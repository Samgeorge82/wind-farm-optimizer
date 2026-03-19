"""
Fetch historical wind data from Open-Meteo ERA5 archive and fit Weibull parameters.

Open-Meteo provides free ERA5 reanalysis data (1940-present) with hourly wind speed
and direction at 10m and 100m heights. No API key required.

We fetch multiple years of hourly data at 100m height, then:
1. Bin observations into 12 directional sectors (30 deg each)
2. Fit a Weibull distribution to each sector using MLE
3. Return a complete WindRose ready for AEP calculations
"""
from __future__ import annotations
import math
import numpy as np
from typing import List, Tuple
import urllib.request
import json
from models.wind import WindRose, WeibullSector

# Open-Meteo ERA5 Historical API
_BASE_URL = "https://archive-api.open-meteo.com/v1/archive"

# Number of years of data to fetch (more = better Weibull fit)
_DEFAULT_YEARS = 5


def _fetch_hourly_wind(
    lat: float,
    lng: float,
    start_year: int,
    end_year: int,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Fetch hourly wind speed and direction at 100m from Open-Meteo.
    Returns (speeds_ms, directions_deg) arrays.
    """
    url = (
        f"{_BASE_URL}"
        f"?latitude={lat:.4f}"
        f"&longitude={lng:.4f}"
        f"&start_date={start_year}-01-01"
        f"&end_date={end_year}-12-31"
        f"&hourly=wind_speed_100m,wind_direction_100m"
        f"&wind_speed_unit=ms"
        f"&timezone=UTC"
    )

    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    hourly = data.get("hourly", {})
    speeds_raw = hourly.get("wind_speed_100m", [])
    dirs_raw = hourly.get("wind_direction_100m", [])

    # Filter out null values (gaps in ERA5 data)
    speeds = []
    dirs = []
    for s, d in zip(speeds_raw, dirs_raw):
        if s is not None and d is not None:
            speeds.append(float(s))
            dirs.append(float(d))

    return np.array(speeds), np.array(dirs)


def _fit_weibull_mle(speeds: np.ndarray) -> Tuple[float, float]:
    """
    Fit Weibull k (shape) and A (scale) using maximum likelihood estimation.
    Uses the iterative Newton-Raphson method for k, then analytical A.
    """
    speeds = speeds[speeds > 0.5]  # Filter near-zero (calm) values
    n = len(speeds)
    if n < 20:
        return 2.0, 8.0  # Fallback for too few data points

    ln_speeds = np.log(speeds)
    mean_ln = np.mean(ln_speeds)

    # Initial guess: k from empirical method
    mean_speed = np.mean(speeds)
    std_speed = np.std(speeds)
    if std_speed > 0:
        k = (std_speed / mean_speed) ** (-1.086)  # Empirical approximation
    else:
        k = 2.0
    k = max(0.5, min(k, 10.0))

    # Newton-Raphson iterations for MLE of k
    for _ in range(50):
        speeds_k = speeds ** k
        sum_sk = np.sum(speeds_k)
        sum_sk_ln = np.sum(speeds_k * ln_speeds)

        if sum_sk < 1e-30:
            break

        # MLE equation for k: 1/k + mean(ln(x)) - sum(x^k * ln(x)) / sum(x^k) = 0
        f = 1.0 / k + mean_ln - sum_sk_ln / sum_sk

        # Derivative
        sum_sk_ln2 = np.sum(speeds_k * ln_speeds ** 2)
        f_prime = -1.0 / (k * k) - (sum_sk_ln2 * sum_sk - sum_sk_ln ** 2) / (sum_sk ** 2)

        if abs(f_prime) < 1e-30:
            break

        k_new = k - f / f_prime
        k_new = max(0.5, min(k_new, 10.0))

        if abs(k_new - k) < 1e-6:
            k = k_new
            break
        k = k_new

    # Analytical A from k
    A = (np.mean(speeds ** k)) ** (1.0 / k)
    A = max(1.0, min(A, 30.0))

    return round(float(k), 2), round(float(A), 2)


def fetch_wind_rose(
    lat: float,
    lng: float,
    n_sectors: int = 12,
    years: int = _DEFAULT_YEARS,
) -> WindRose:
    """
    Fetch ERA5 wind data for a location and compute a Weibull wind rose.

    Args:
        lat: Latitude of site center
        lng: Longitude of site center
        n_sectors: Number of directional sectors (default 12)
        years: Number of years of data to use (default 5)

    Returns:
        WindRose with fitted Weibull parameters per sector
    """
    # Fetch last N full years of data
    end_year = 2025  # Last full year available in ERA5
    start_year = end_year - years + 1

    speeds, directions = _fetch_hourly_wind(lat, lng, start_year, end_year)

    if len(speeds) == 0:
        raise ValueError("No wind data returned from Open-Meteo for this location")

    # Bin into sectors
    sector_width = 360.0 / n_sectors
    sectors: List[WeibullSector] = []
    total_obs = len(speeds)

    for i in range(n_sectors):
        # Sector center angle (meteorological: 0=N, clockwise)
        center = i * sector_width
        lo = (center - sector_width / 2) % 360
        hi = (center + sector_width / 2) % 360

        # Select observations in this sector
        if lo < hi:
            mask = (directions >= lo) & (directions < hi)
        else:
            # Wraps around 360 (e.g., sector centered on N: 345-15)
            mask = (directions >= lo) | (directions < hi)

        sector_speeds = speeds[mask]
        freq = len(sector_speeds) / total_obs if total_obs > 0 else 1.0 / n_sectors

        if len(sector_speeds) > 20:
            k, A = _fit_weibull_mle(sector_speeds)
        else:
            # Too few observations: use overall distribution
            k, A = _fit_weibull_mle(speeds)

        sectors.append(WeibullSector(
            k=k,
            A=A,
            frequency=round(freq, 4),
        ))

    # Normalize frequencies to sum exactly to 1.0
    total_freq = sum(s.frequency for s in sectors)
    if total_freq > 0:
        for s in sectors:
            s.frequency = round(s.frequency / total_freq, 4)
        # Fix rounding to ensure exact sum
        diff = 1.0 - sum(s.frequency for s in sectors)
        sectors[0].frequency = round(sectors[0].frequency + diff, 4)

    # Compute mean speed for summary
    mean_speed = float(np.mean(speeds))

    return WindRose(
        n_sectors=n_sectors,
        sectors=sectors,
        reference_height_m=100.0,
        roughness_length_m=0.0002,
    )


def get_wind_summary(speeds: np.ndarray) -> dict:
    """Return summary statistics for the fetched wind data."""
    return {
        "mean_speed_ms": round(float(np.mean(speeds)), 2),
        "median_speed_ms": round(float(np.median(speeds)), 2),
        "max_speed_ms": round(float(np.max(speeds)), 2),
        "std_speed_ms": round(float(np.std(speeds)), 2),
        "total_hours": len(speeds),
        "calm_pct": round(float(np.sum(speeds < 0.5) / len(speeds) * 100), 1),
    }

from __future__ import annotations
import numpy as np
from models.marine import (
    MarineRequest, MarineAssessmentResult, WeatherWindowResult,
    VerticalExtrapolationResult
)
from services.aep.air_density import compute_air_density


def assess_marine(req: MarineRequest) -> MarineAssessmentResult:
    rho = compute_air_density(req.temperature_celsius, req.site_elevation_m)
    density_factor = rho / 1.225

    # Turbulence intensity (offshore IEC)
    ti = 0.06  # typical offshore ambient TI
    turb_class = "IB" if req.site_latitude > 60 else "IIA"

    # Weather windows from monthly Hs statistics
    ww = _compute_weather_windows(req.wave_conditions)

    # Vertical extrapolation
    vert_result = None
    if req.vertical_extrapolation:
        ve = req.vertical_extrapolation
        if ve.method == "power_law":
            ratio = (ve.hub_height_m / ve.met_mast_height_m) ** ve.shear_exponent
        else:  # log_law
            z0 = ve.roughness_length_m
            ratio = (
                np.log(ve.hub_height_m / z0) / np.log(ve.met_mast_height_m / z0)
            )
        hub_ws = ve.reference_wind_speed_ms * float(ratio)
        vert_result = VerticalExtrapolationResult(
            hub_height_wind_speed_ms=hub_ws,
            shear_multiplier=float(ratio),
            method_used=ve.method,
        )

    return MarineAssessmentResult(
        air_density_kg_m3=rho,
        density_correction_factor=density_factor,
        turbulence_class=turb_class,
        reference_turbulence_intensity=ti,
        weather_window=ww,
        vertical_extrapolation=vert_result,
    )


def _compute_weather_windows(wc) -> WeatherWindowResult:
    """
    Estimate % of hours where Hs is below operational limits.
    Uses Rayleigh-like approximation from monthly mean Hs.
    """
    HOURS_PER_YEAR = 8760.0
    monthly_hours = [730.5] * 12

    op_hours = 0.0
    cable_hours = 0.0
    mono_hours = 0.0

    for i, (mean_hs, hours) in enumerate(zip(wc.monthly_mean_hs, monthly_hours)):
        # Fraction of time below limit using Rayleigh CDF: F(h) = 1 - exp(-(h/σ)²)
        # where σ = mean_hs / sqrt(π/2)
        sigma = mean_hs / np.sqrt(np.pi / 2.0)
        op_frac = 1.0 - np.exp(-((wc.hs_operational_m / sigma) ** 2))
        cable_frac = 1.0 - np.exp(-((wc.hs_cable_lay_m / sigma) ** 2))
        mono_frac = 1.0 - np.exp(-((wc.hs_monopile_m / sigma) ** 2))
        op_hours += op_frac * hours
        cable_hours += cable_frac * hours
        mono_hours += mono_frac * hours

    # Installation vessel days (rough estimate)
    n_turbines_assumed = 50
    vessel_days = n_turbines_assumed * 2.5 / (mono_hours / 24)  # days needed

    return WeatherWindowResult(
        annual_operational_pct=op_hours / HOURS_PER_YEAR * 100,
        annual_cable_lay_pct=cable_hours / HOURS_PER_YEAR * 100,
        annual_monopile_install_pct=mono_hours / HOURS_PER_YEAR * 100,
        annual_operational_hours=op_hours,
        annual_cable_lay_hours=cable_hours,
        installation_vessel_days_required=vessel_days,
        notes=[
            f"Based on monthly Hs statistics, Rayleigh distribution",
            f"Operational window ({wc.hs_operational_m}m Hs): {op_hours:.0f} hrs/year",
        ],
    )

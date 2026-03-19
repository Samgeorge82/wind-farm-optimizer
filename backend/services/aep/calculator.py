from __future__ import annotations
import numpy as np
from scipy.interpolate import interp1d
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.wind import WindRose
    from models.turbine import TurbineSpec
    from services.wake.base import WakeModel

HOURS_PER_YEAR = 8760.0
N_SPEED_BINS = 30


class AEPCalculator:
    """
    Integrates P(u_eff) × Weibull(u) over all wind sectors to compute AEP.

    For each sector s:
        sector_aep = 8760 × freq_s × Σ_u [ P(u_eff(u)) × weibull_pdf(u) × Δu ]

    u_eff(u) is the wake-affected speed at each turbine for freestream u.
    """

    def __init__(
        self,
        wind_rose: WindRose,
        turbine: TurbineSpec,
        wake_model: WakeModel,
        air_density_kg_m3: float = 1.225,
        n_speed_bins: int = N_SPEED_BINS,
    ):
        self.wind_rose = wind_rose
        self.turbine = turbine
        self.wake_model = wake_model
        self.density_factor = air_density_kg_m3 / 1.225
        self.n_speed_bins = n_speed_bins
        self._build_interpolators()

    def _build_interpolators(self):
        speeds_p = [p.wind_speed for p in self.turbine.power_curve]
        powers_p = [p.power * self.density_factor for p in self.turbine.power_curve]
        self.power_interp = interp1d(
            speeds_p, powers_p, kind="linear", bounds_error=False, fill_value=0.0
        )
        speeds_ct = [p.wind_speed for p in self.turbine.ct_curve]
        cts = [p.power for p in self.turbine.ct_curve]
        self.ct_interp = interp1d(
            speeds_ct, cts, kind="linear", bounds_error=False, fill_value=0.0
        )

    def compute(
        self, x: np.ndarray, y: np.ndarray
    ) -> dict:
        from services.wake.base import WakeInput

        n_turbines = len(x)
        n_sectors = self.wind_rose.n_sectors
        sector_angle = 360.0 / n_sectors

        u_edges = np.linspace(0.0, 30.0, self.n_speed_bins + 1)
        u_centers = 0.5 * (u_edges[:-1] + u_edges[1:])
        du = u_edges[1] - u_edges[0]

        per_turbine_energy = np.zeros(n_turbines)   # kWh/year
        gross_energy = np.zeros(n_turbines)
        energy_by_direction = np.zeros(n_sectors)   # GWh by sector

        for s_idx, sector in enumerate(self.wind_rose.sectors):
            wind_dir = s_idx * sector_angle
            k, A, freq = sector.k, sector.A, sector.frequency
            pdf = self._weibull_pdf(u_centers, k, A)

            sector_energy = np.zeros(n_turbines)

            for u_idx, u in enumerate(u_centers):
                if u < self.turbine.cut_in_speed or u > self.turbine.cut_out_speed:
                    continue
                ct = float(self.ct_interp(u))
                if ct <= 0:
                    continue

                inp = WakeInput(
                    x=x, y=y,
                    freestream_speed=u,
                    wind_direction_deg=wind_dir,
                    rotor_diameter=self.turbine.rotor_diameter_m,
                    ct=ct,
                )
                u_eff = self.wake_model.compute_effective_speeds(inp)
                powers = np.array([float(self.power_interp(v)) for v in u_eff])
                gross_powers = np.full(n_turbines, float(self.power_interp(u)))

                prob = freq * pdf[u_idx] * du
                sector_energy += powers * HOURS_PER_YEAR * prob
                gross_energy += gross_powers * HOURS_PER_YEAR * prob

            per_turbine_energy += sector_energy
            energy_by_direction[s_idx] = np.sum(sector_energy) / 1e6  # GWh

        total_aep_gwh = float(np.sum(per_turbine_energy)) / 1e6
        gross_aep_gwh = float(np.sum(gross_energy)) / 1e6
        wake_loss_pct = (
            100.0 * (gross_aep_gwh - total_aep_gwh) / gross_aep_gwh
            if gross_aep_gwh > 0 else 0.0
        )
        installed_kw = n_turbines * self.turbine.rated_power_kw
        capacity_factor = (
            total_aep_gwh * 1e6 / (installed_kw * HOURS_PER_YEAR)
            if installed_kw > 0 else 0.0
        )

        gross_per_t = gross_energy
        return {
            "aep_gwh": total_aep_gwh,
            "gross_aep_gwh": gross_aep_gwh,
            "wake_loss_pct": wake_loss_pct,
            "capacity_factor": capacity_factor,
            "per_turbine_aep": (per_turbine_energy / 1e6).tolist(),
            "per_turbine_wake_loss": (
                (gross_per_t - per_turbine_energy) / np.maximum(gross_per_t, 1e-9)
            ).tolist(),
            "energy_by_direction": energy_by_direction.tolist(),
        }

    @staticmethod
    def _weibull_pdf(u: np.ndarray, k: float, A: float) -> np.ndarray:
        u_safe = np.maximum(u, 1e-9)
        return (k / A) * (u_safe / A) ** (k - 1) * np.exp(-((u_safe / A) ** k))

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional


class WaveConditions(BaseModel):
    hs_operational_m: float = Field(1.5, ge=0, description="Max Hs for turbine ops")
    hs_cable_lay_m: float = Field(2.0, ge=0)
    hs_monopile_m: float = Field(2.5, ge=0)
    current_speed_ms: float = Field(0.5, ge=0)
    # Monthly mean Hs (12 values, Jan-Dec)
    monthly_mean_hs: List[float] = Field(
        default=[1.8, 1.7, 1.5, 1.2, 1.0, 0.8, 0.9, 1.0, 1.3, 1.6, 1.8, 1.9],
        description="Monthly mean significant wave height Jan-Dec"
    )


class WeatherWindowResult(BaseModel):
    annual_operational_pct: float
    annual_cable_lay_pct: float
    annual_monopile_install_pct: float
    annual_operational_hours: float
    annual_cable_lay_hours: float
    installation_vessel_days_required: float
    notes: List[str] = []


class VerticalExtrapolationRequest(BaseModel):
    method: str = Field("power_law", pattern="^(log_law|power_law)$")
    met_mast_height_m: float = Field(..., gt=0)
    hub_height_m: float = Field(..., gt=0)
    reference_wind_speed_ms: float = Field(..., gt=0)
    roughness_length_m: float = Field(0.0002, gt=0)
    shear_exponent: float = Field(0.11, ge=0.05, le=0.40)


class VerticalExtrapolationResult(BaseModel):
    hub_height_wind_speed_ms: float
    shear_multiplier: float
    method_used: str


class MarineAssessmentResult(BaseModel):
    air_density_kg_m3: float
    density_correction_factor: float
    turbulence_class: str
    reference_turbulence_intensity: float
    weather_window: WeatherWindowResult
    vertical_extrapolation: Optional[VerticalExtrapolationResult] = None


class MarineRequest(BaseModel):
    wave_conditions: WaveConditions
    site_latitude: float = Field(55.0)
    site_elevation_m: float = Field(0.0, description="Mean sea level")
    temperature_celsius: float = Field(10.0)
    vertical_extrapolation: Optional[VerticalExtrapolationRequest] = None

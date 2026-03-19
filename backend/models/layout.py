from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional


class GeoPoint(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class BoundaryPolygon(BaseModel):
    """Site boundary as ordered list of WGS84 coordinates (auto-closed)."""
    coordinates: List[GeoPoint] = Field(..., min_items=3)


class TurbinePosition(BaseModel):
    id: str
    lat: float
    lng: float
    x: float = Field(0.0, description="Local Cartesian East (m)")
    y: float = Field(0.0, description="Local Cartesian North (m)")
    aep_gwh: Optional[float] = None
    wake_loss: Optional[float] = None


class ExclusionZone(BaseModel):
    center: GeoPoint
    radius_m: float = Field(..., gt=0)
    label: Optional[str] = None


class LayoutEvaluateRequest(BaseModel):
    boundary: BoundaryPolygon
    turbines: List[TurbinePosition]
    turbine_spec: "TurbineSpec"  # forward ref
    wind_rose: "WindRose"
    wake_model: str = Field("jensen", pattern="^(jensen|gaussian)$")
    exclusion_zones: List[ExclusionZone] = []


class AEPResult(BaseModel):
    aep_gwh: float
    gross_aep_gwh: float
    wake_loss_pct: float
    capacity_factor: float
    per_turbine_aep: List[float]
    per_turbine_wake_loss: List[float]
    energy_by_direction: Optional[List[float]] = None


class LayoutOptimizeRequest(BaseModel):
    boundary: BoundaryPolygon
    turbine_spec: "TurbineSpec"
    wind_rose: "WindRose"
    n_turbines: int = Field(..., ge=1, le=200)
    min_spacing_diameters: float = Field(4.0, ge=1.0, le=20.0)
    wake_model: str = Field("jensen", pattern="^(jensen|gaussian)$")
    method: str = Field("cobyla", pattern="^(cobyla|differential_evolution|grid|staggered)$")
    max_iterations: int = Field(300, le=1000)
    exclusion_zones: List[ExclusionZone] = []
    objective: str = Field("aep", pattern="^(aep|lcoe|irr|npv)$")
    financial_params: Optional["FinancialParams"] = None

    # Site parameters for full-cost computation
    water_depth_m: float = Field(30.0, ge=5.0, le=300.0)
    distance_to_shore_km: float = Field(50.0, ge=1.0, le=500.0)
    array_voltage_kv: float = Field(33.0, description="Array cable voltage: 33 or 66 kV")
    max_turbines_per_string: int = Field(8, ge=2, le=20)

    # ── Auto-optimization ranges ──
    # If set, the optimizer sweeps these discrete values to find the best config
    n_turbines_range: Optional[List[int]] = Field(
        None,
        description="If set, sweep these turbine counts (e.g. [15,20,25]) instead of fixed n_turbines"
    )
    string_size_range: Optional[List[int]] = Field(
        None,
        description="If set, sweep these max-turbines-per-string values (e.g. [4,6,8])"
    )
    voltage_options: Optional[List[float]] = Field(
        None,
        description="If set, sweep these voltages (e.g. [33,66]) instead of fixed voltage"
    )


# Resolve forward references after all models are loaded
from models.turbine import TurbineSpec
from models.wind import WindRose
from models.financial import FinancialParams
LayoutEvaluateRequest.model_rebuild()
LayoutOptimizeRequest.model_rebuild()

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional, Tuple
from enum import Enum


class CableSpec(BaseModel):
    cross_section_mm2: int
    voltage_kv: float
    current_rating_amps: float
    resistance_ohm_km: float
    cost_usd_km: float


class CableSegment(BaseModel):
    segment_id: str
    from_id: str
    to_id: str
    length_m: float
    cable_spec: CableSpec
    current_amps: float
    losses_kw: float
    cost_usd: float
    route_coords: List[Tuple[float, float]]  # [[lng, lat], ...]


class StringConfig(BaseModel):
    string_id: str
    turbine_ids: List[str]
    segments: List[CableSegment]
    total_length_m: float
    total_losses_kw: float
    total_cost_usd: float
    peak_current_amps: float


class OSSConfig(BaseModel):
    oss_id: str = "OSS-1"
    lat: float
    lng: float
    x: float = 0.0
    y: float = 0.0
    transformer_mva: float
    num_transformers: int = 2
    voltage_hv_kv: float = 132.0
    voltage_lv_kv: float = 33.0
    platform_cost_musd: float
    transformer_cost_musd: float
    total_cost_musd: float


class ExportCableType(str, Enum):
    HVAC_132kV = "HVAC_132kV"
    HVAC_220kV = "HVAC_220kV"
    HVDC_320kV = "HVDC_320kV"
    HVDC_525kV = "HVDC_525kV"


class ExportCableConfig(BaseModel):
    cable_type: ExportCableType
    length_km: float
    cost_usd_km: float
    total_cost_musd: float
    reactive_compensation_musd: Optional[float] = None
    converter_station_musd: Optional[float] = None
    losses_mw: float
    selection_reason: str


class ElectricalNetwork(BaseModel):
    strings: List[StringConfig]
    oss: OSSConfig
    export_cable: ExportCableConfig
    array_voltage_kv: float = 33.0
    total_array_losses_pct: float
    total_cable_cost_musd: float
    total_electrical_losses_mw: float
    array_cable_total_km: float


class ElectricalRequest(BaseModel):
    turbines: List["TurbinePosition"]
    boundary: "BoundaryPolygon"
    turbine_spec: "TurbineSpec"
    array_voltage_kv: float = Field(33.0, description="33 or 66 kV")
    max_turbines_per_string: int = Field(8, ge=2, le=20)
    shore_point: "GeoPoint"
    distance_to_shore_km: float = Field(..., gt=0)
    exclusion_zones: List["ExclusionZone"] = []


# Resolve forward references
from models.layout import TurbinePosition, BoundaryPolygon, GeoPoint, ExclusionZone
from models.turbine import TurbineSpec
ElectricalRequest.model_rebuild()

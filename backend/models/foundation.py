from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from enum import Enum


class FoundationType(str, Enum):
    MONOPILE = "monopile"
    JACKET = "jacket"
    FLOATING_SEMI_SUB = "floating_semi_sub"
    FLOATING_SPAR = "floating_spar"


class SeabedType(str, Enum):
    SAND = "sand"
    CLAY = "clay"
    ROCK = "rock"


class TurbineFoundationResult(BaseModel):
    turbine_id: str
    water_depth_m: float
    seabed_type: SeabedType
    foundation_type: FoundationType
    steel_mass_tonnes: float
    supply_cost_musd: float
    installation_cost_musd: float
    total_cost_musd: float
    design_notes: List[str] = []


class FoundationSummary(BaseModel):
    per_turbine: List[TurbineFoundationResult]
    type_distribution: Dict[str, int]
    total_cost_musd: float
    average_cost_musd_per_turbine: float
    cost_by_type: Dict[str, float]


class FoundationRequest(BaseModel):
    turbines: List["TurbinePosition"]
    turbine_spec: "TurbineSpec"
    default_water_depth_m: float = Field(30.0, gt=0)
    default_seabed_type: SeabedType = SeabedType.SAND
    depth_overrides: Dict[str, float] = {}  # turbine_id -> depth


# Resolve forward references
from models.layout import TurbinePosition
from models.turbine import TurbineSpec
FoundationRequest.model_rebuild()

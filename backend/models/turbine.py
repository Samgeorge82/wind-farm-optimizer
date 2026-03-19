from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List
from enum import Enum


class IECClass(str, Enum):
    IA = "IA"
    IB = "IB"
    IIA = "IIA"
    IIB = "IIB"
    IIIA = "IIIA"
    S = "S"


class PowerCurvePoint(BaseModel):
    wind_speed: float = Field(..., ge=0, le=50, description="m/s")
    power: float = Field(..., ge=0, description="kW or Ct coefficient")


class TurbineSpec(BaseModel):
    id: str
    name: str
    manufacturer: str
    rated_power_kw: float = Field(..., gt=0)
    rotor_diameter_m: float = Field(..., gt=0)
    hub_height_m: float = Field(..., gt=0)
    iec_class: IECClass = IECClass.IIA
    cut_in_speed: float = Field(3.0, description="m/s")
    cut_out_speed: float = Field(25.0, description="m/s")
    rated_speed: float = Field(12.0, description="m/s")
    power_curve: List[PowerCurvePoint]
    ct_curve: List[PowerCurvePoint]

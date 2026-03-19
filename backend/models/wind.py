from __future__ import annotations
from pydantic import BaseModel, Field, validator
from typing import List, Optional


class WeibullSector(BaseModel):
    k: float = Field(..., gt=0, description="Weibull shape parameter")
    A: float = Field(..., gt=0, description="Weibull scale parameter (m/s)")
    frequency: float = Field(..., ge=0, le=1, description="Sector frequency fraction")


class WindRose(BaseModel):
    """Discretized wind rose with N sectors (0=N, sectors go clockwise)."""
    n_sectors: int = Field(12, ge=4, le=36)
    sectors: List[WeibullSector]
    reference_height_m: float = Field(100.0, gt=0)
    roughness_length_m: float = Field(0.0002, gt=0, description="Sea surface z0")

    @validator("sectors")
    def validate_sectors(cls, v, values):
        if "n_sectors" in values and len(v) != values["n_sectors"]:
            raise ValueError(f"sectors length must equal n_sectors ({values['n_sectors']})")
        total = sum(s.frequency for s in v)
        if abs(total - 1.0) > 0.02:
            raise ValueError(f"Sector frequencies must sum to 1.0, got {total:.3f}")
        return v


class MetMastData(BaseModel):
    mast_id: str
    lat: float
    lng: float
    height_m: float
    wind_rose: WindRose

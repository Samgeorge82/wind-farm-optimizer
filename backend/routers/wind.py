"""
Wind resource API — fetch location-specific wind data from ERA5 via Open-Meteo.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from models.wind import WindRose
from services.wind.open_meteo import fetch_wind_rose

router = APIRouter()


class WindFetchRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90, description="Site latitude")
    lng: float = Field(..., ge=-180, le=180, description="Site longitude")
    n_sectors: int = Field(12, ge=4, le=36, description="Number of sectors")
    years: int = Field(5, ge=1, le=30, description="Years of data to fetch")


class WindFetchResponse(BaseModel):
    wind_rose: WindRose
    mean_speed_ms: float
    data_years: int
    data_source: str = "ERA5 via Open-Meteo"
    location: dict


@router.post("/fetch", response_model=WindFetchResponse)
def fetch_wind_data(req: WindFetchRequest):
    """
    Fetch ERA5 historical wind data for a location and return fitted Weibull wind rose.

    Uses the Open-Meteo Historical API (free, no API key) backed by ERA5 reanalysis.
    Returns hourly wind at 100m height over the requested number of years, then fits
    Weibull distributions per directional sector.
    """
    try:
        wind_rose = fetch_wind_rose(
            lat=req.lat,
            lng=req.lng,
            n_sectors=req.n_sectors,
            years=req.years,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch wind data: {str(e)}")

    # Calculate mean speed from fitted Weibull (A * Gamma(1 + 1/k))
    import math
    mean_speed = sum(
        s.frequency * s.A * math.gamma(1 + 1 / s.k)
        for s in wind_rose.sectors
    )

    return WindFetchResponse(
        wind_rose=wind_rose,
        mean_speed_ms=round(mean_speed, 2),
        data_years=req.years,
        location={"lat": req.lat, "lng": req.lng},
    )

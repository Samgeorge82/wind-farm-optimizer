import json
from pathlib import Path
from fastapi import APIRouter
from models.turbine import TurbineSpec

router = APIRouter()
_DATA = Path(__file__).parent.parent / "data" / "turbines.json"


@router.get("/", response_model=list[TurbineSpec])
def list_turbines():
    with open(_DATA) as f:
        return json.load(f)


@router.get("/{turbine_id}", response_model=TurbineSpec)
def get_turbine(turbine_id: str):
    with open(_DATA) as f:
        turbines = json.load(f)
    for t in turbines:
        if t["id"] == turbine_id:
            return t
    from fastapi import HTTPException
    raise HTTPException(404, f"Turbine '{turbine_id}' not found")

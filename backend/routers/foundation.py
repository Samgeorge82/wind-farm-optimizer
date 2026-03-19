from fastapi import APIRouter
from models.foundation import FoundationRequest, FoundationSummary
from services.foundation.cost_model import assess_foundations

router = APIRouter()


@router.post("/assess", response_model=FoundationSummary)
def assess_foundation(req: FoundationRequest):
    return assess_foundations(
        req.turbines, req.turbine_spec,
        req.default_water_depth_m, req.default_seabed_type,
        req.depth_overrides,
    )

from fastapi import APIRouter
from models.marine import MarineRequest, MarineAssessmentResult
from services.marine.assess import assess_marine

router = APIRouter()


@router.post("/assess", response_model=MarineAssessmentResult)
def marine_assess(req: MarineRequest):
    return assess_marine(req)

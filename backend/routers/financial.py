from fastapi import APIRouter
from models.financial import FinancialRequest, FinancialResult
from models.sensitivity import ScenarioComparisonResult, ScenarioConfig
from services.financial.dcf_model import calculate_financials

router = APIRouter()


@router.post("/calculate", response_model=FinancialResult)
def calculate_financial(req: FinancialRequest):
    return calculate_financials(req)


@router.post("/scenarios", response_model=ScenarioComparisonResult)
def compare_scenarios(scenarios: list[ScenarioConfig]):
    if len(scenarios) > 3:
        from fastapi import HTTPException
        raise HTTPException(400, "Maximum 3 scenarios supported")

    metrics = {}
    for sc in scenarios:
        result = calculate_financials(sc.request)
        metrics[sc.name] = {
            "equity_irr": result.equity_irr,
            "project_irr": result.project_irr,
            "lcoe_usd_mwh": result.lcoe_usd_mwh,
            "npv_musd": result.npv_musd,
            "total_capex_musd": result.total_capex_musd,
            "payback_year": result.payback_year,
            "min_dscr": result.min_dscr,
        }

    return ScenarioComparisonResult(
        scenarios=[sc.name for sc in scenarios],
        results=metrics,
    )

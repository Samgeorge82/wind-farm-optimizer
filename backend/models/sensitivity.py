from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Dict, Optional


class SensitivityVariable(BaseModel):
    name: str
    display_label: str
    base_value: float
    low_pct: float = Field(0.10, ge=0, le=0.50)
    high_pct: float = Field(0.10, ge=0, le=0.50)
    unit: str = ""
    attribute_path: str = Field("", description="Dot-notation path into FinancialParams")


class TornadoInput(BaseModel):
    request: "FinancialRequest"
    variables: List[SensitivityVariable]
    target_metric: str = Field(
        "lcoe_usd_mwh",
        pattern="^(equity_irr|project_irr|lcoe_usd_mwh|npv_musd)$"
    )


class TornadoBar(BaseModel):
    variable: str
    display_label: str
    base_value: float
    low_impact: float
    high_impact: float
    swing: float


class TornadoResult(BaseModel):
    target_metric: str
    base_result: float
    bars: List[TornadoBar]


class MonteCarloInput(BaseModel):
    request: "FinancialRequest"
    n_iterations: int = Field(2000, ge=100, le=20000)
    aep_p90_gwh: float = Field(..., gt=0)
    capex_uncertainty_pct: float = Field(0.10, ge=0)
    opex_uncertainty_pct: float = Field(0.10, ge=0)
    energy_price_uncertainty_pct: float = Field(0.10, ge=0)


class MonteCarloResult(BaseModel):
    n_iterations: int
    equity_irr: Dict[str, float]   # {"p10": x, "p50": x, "p90": x, "mean": x}
    project_irr: Dict[str, float]
    lcoe_usd_mwh: Dict[str, float]
    npv_musd: Dict[str, float]
    irr_histogram: List[float]     # sampled equity_irr values for histogram
    lcoe_histogram: List[float]


class ScenarioConfig(BaseModel):
    scenario_id: str
    name: str
    description: str = ""
    request: "FinancialRequest"


class ScenarioComparisonResult(BaseModel):
    scenarios: List[str]
    results: Dict[str, Dict[str, float]]


# Resolve forward references
from models.financial import FinancialRequest
TornadoInput.model_rebuild()
MonteCarloInput.model_rebuild()
ScenarioConfig.model_rebuild()

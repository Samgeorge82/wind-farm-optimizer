from __future__ import annotations
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict


class DebtStructure(BaseModel):
    debt_fraction: float = Field(0.70, ge=0.0, le=1.0)
    interest_rate: float = Field(0.045, ge=0.0, le=0.30)
    loan_tenor_years: int = Field(18, ge=5, le=30)
    grace_period_years: int = Field(2, ge=0, le=5)
    amortization: str = Field("annuity", pattern="^(annuity|straight_line)$")


class EnergyPriceConfig(BaseModel):
    base_price_usd_mwh: float = Field(85.0, ge=0.0)
    escalation_rate: float = Field(0.02, ge=-0.05, le=0.10)
    price_curve_override: Optional[List[float]] = None


class CapexBreakdown(BaseModel):
    turbine_supply_usd_mw: float = Field(1_400_000.0, ge=0)
    turbine_installation_usd_mw: float = Field(250_000.0, ge=0)
    foundation_total_musd: float = Field(0.0, ge=0)
    array_cable_usd_km: float = Field(400_000.0, ge=0)
    array_cable_total_km: float = Field(0.0, ge=0)
    oss_total_musd: float = Field(100.0, ge=0)
    export_cable_usd_km: float = Field(1_200_000.0, ge=0)
    export_cable_total_km: float = Field(50.0, ge=0)
    onshore_substation_musd: float = Field(15.0, ge=0)
    installation_vessels_musd: float = Field(50.0, ge=0)
    mobilization_musd: float = Field(10.0, ge=0)
    development_engineering_pct: float = Field(0.03, ge=0, le=0.15)
    contingency_pct: float = Field(0.05, ge=0, le=0.20)

    def total_musd(self, installed_mw: float) -> float:
        turbine = (self.turbine_supply_usd_mw + self.turbine_installation_usd_mw) * installed_mw / 1e6
        foundation = self.foundation_total_musd
        cables = (self.array_cable_usd_km * self.array_cable_total_km +
                  self.export_cable_usd_km * self.export_cable_total_km) / 1e6
        oss = self.oss_total_musd
        onshore = self.onshore_substation_musd
        install = self.installation_vessels_musd + self.mobilization_musd
        hard = turbine + foundation + cables + oss + onshore + install
        soft = hard * (self.development_engineering_pct + self.contingency_pct)
        return hard + soft

    def breakdown_musd(self, installed_mw: float) -> Dict[str, float]:
        turbine = (self.turbine_supply_usd_mw + self.turbine_installation_usd_mw) * installed_mw / 1e6
        return {
            "turbine": turbine,
            "foundation": self.foundation_total_musd,
            "array_cables": self.array_cable_usd_km * self.array_cable_total_km / 1e6,
            "oss": self.oss_total_musd,
            "export_cable": self.export_cable_usd_km * self.export_cable_total_km / 1e6,
            "onshore_substation": self.onshore_substation_musd,
            "installation": self.installation_vessels_musd + self.mobilization_musd,
            "soft_costs": 0.0,  # filled in total_musd
        }


class OpexBreakdown(BaseModel):
    fixed_usd_mw_year: float = Field(60_000.0, ge=0)
    variable_usd_mwh: float = Field(3.0, ge=0)
    insurance_pct_capex: float = Field(0.005, ge=0)
    lease_usd_mw_year: float = Field(8_000.0, ge=0)
    asset_management_usd_year: float = Field(500_000.0, ge=0)
    opex_escalation_rate: float = Field(0.02, ge=0, le=0.10)


class DecommissioningConfig(BaseModel):
    method: str = Field("pct_capex", pattern="^(pct_capex|lump_sum)$")
    pct_capex: float = Field(0.05, ge=0, le=0.30)
    lump_sum_musd: float = Field(0.0, ge=0)


class FinancialParams(BaseModel):
    project_lifetime_years: int = Field(25, ge=10, le=40)
    construction_years: int = Field(3, ge=1, le=5)
    capex_draw_schedule: List[float] = Field(default=[0.20, 0.50, 0.30])
    wacc: float = Field(0.07, ge=0.01, le=0.25)
    tax_rate: float = Field(0.25, ge=0.0, le=0.50)
    depreciation_years: int = Field(15, ge=5, le=25)
    inflation_rate: float = Field(0.025, ge=0, le=0.10)
    debt: DebtStructure = Field(default_factory=DebtStructure)
    energy_price: EnergyPriceConfig = Field(default_factory=EnergyPriceConfig)
    capex: CapexBreakdown = Field(default_factory=CapexBreakdown)
    opex: OpexBreakdown = Field(default_factory=OpexBreakdown)
    decommissioning: DecommissioningConfig = Field(default_factory=DecommissioningConfig)

    @validator("capex_draw_schedule")
    def validate_draw_schedule(cls, v, values):
        if "construction_years" in values and len(v) != values["construction_years"]:
            raise ValueError("capex_draw_schedule length must equal construction_years")
        if abs(sum(v) - 1.0) > 0.01:
            raise ValueError(f"capex_draw_schedule must sum to 1.0, got {sum(v):.3f}")
        return v


class FinancialRequest(BaseModel):
    params: FinancialParams
    installed_mw: float = Field(..., gt=0)
    aep_gwh: float = Field(..., gt=0)
    n_turbines: int = Field(..., gt=0)


class AnnualCashFlow(BaseModel):
    year: int
    revenue_musd: float
    opex_musd: float
    ebitda_musd: float
    depreciation_musd: float
    ebit_musd: float
    interest_musd: float
    ebt_musd: float
    tax_musd: float
    net_income_musd: float
    debt_repayment_musd: float
    capex_musd: float
    fcfe_musd: float
    fcff_musd: float
    debt_outstanding_musd: float
    dscr: Optional[float] = None


class FinancialResult(BaseModel):
    project_irr: float
    equity_irr: float
    npv_musd: float
    lcoe_usd_mwh: float
    payback_year: int
    min_dscr: float
    average_dscr: float
    total_capex_musd: float
    annual_cash_flows: List[AnnualCashFlow]
    capex_breakdown_musd: Dict[str, float]
    lcoe_components: Dict[str, float]
    warnings: List[str] = []

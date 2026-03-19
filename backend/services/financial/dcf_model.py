from __future__ import annotations
import numpy as np
from scipy.optimize import brentq
from typing import List
from models.financial import (
    FinancialParams, FinancialRequest, FinancialResult, AnnualCashFlow
)

HOURS_PER_YEAR = 8760.0


def _irr(cash_flows: List[float]) -> float:
    """Compute IRR using Brent's method. Returns 0.0 if no solution found."""
    def npv(r):
        return sum(cf / (1 + r) ** t for t, cf in enumerate(cash_flows))
    try:
        return float(brentq(npv, -0.999, 10.0, xtol=1e-6, maxiter=200))
    except (ValueError, RuntimeError):
        return 0.0


def _npv(cash_flows: List[float], rate: float) -> float:
    return sum(cf / (1 + rate) ** t for t, cf in enumerate(cash_flows))


def calculate_financials(req: FinancialRequest) -> FinancialResult:
    p = req.params
    capex = p.capex
    opex = p.opex
    debt = p.debt
    price = p.energy_price
    decom = p.decommissioning

    installed_mw = req.installed_mw
    aep_gwh = req.aep_gwh
    aep_mwh = aep_gwh * 1000.0

    total_capex = capex.total_musd(installed_mw)
    capex_breakdown = capex.breakdown_musd(installed_mw)
    # Add soft costs
    hard = sum(v for k, v in capex_breakdown.items() if k != "soft_costs")
    soft = hard * (capex.development_engineering_pct + capex.contingency_pct)
    capex_breakdown["soft_costs"] = soft
    capex_breakdown["total"] = total_capex

    # Debt
    debt_total = total_capex * debt.debt_fraction
    equity_total = total_capex * (1 - debt.debt_fraction)

    # Annuity payment (after grace period)
    r = debt.interest_rate
    n = debt.loan_tenor_years - debt.grace_period_years
    if r > 0 and n > 0:
        annual_debt_service = debt_total * (r * (1 + r) ** n) / ((1 + r) ** n - 1)
    else:
        annual_debt_service = debt_total / max(n, 1)

    # Decommissioning cost
    decom_cost = (
        total_capex * decom.pct_capex if decom.method == "pct_capex"
        else decom.lump_sum_musd
    )

    warnings = []
    cash_flows_project: List[float] = []
    cash_flows_equity: List[float] = []
    annual_cfs: List[AnnualCashFlow] = []

    debt_outstanding = 0.0
    # Construction period (negative cashflows)
    draw = p.capex_draw_schedule
    for c_yr in range(p.construction_years):
        capex_yr = total_capex * draw[c_yr]
        equity_yr = -capex_yr * (1 - debt.debt_fraction)
        debt_draw = capex_yr * debt.debt_fraction
        debt_outstanding += debt_draw

        cash_flows_project.append(-capex_yr)
        cash_flows_equity.append(equity_yr)

    # Operational period
    for yr in range(1, p.project_lifetime_years + 1):
        # Revenue
        if price.price_curve_override and yr <= len(price.price_curve_override):
            price_yr = price.price_curve_override[yr - 1]
        else:
            price_yr = price.base_price_usd_mwh * ((1 + price.escalation_rate) ** (yr - 1))
        revenue = aep_mwh * price_yr / 1e6  # MUSD

        # OPEX
        esc = (1 + opex.opex_escalation_rate) ** (yr - 1)
        opex_fixed = opex.fixed_usd_mw_year * installed_mw / 1e6 * esc
        opex_var = opex.variable_usd_mwh * aep_mwh / 1e6 * esc
        opex_ins = opex.insurance_pct_capex * total_capex * esc
        opex_lease = opex.lease_usd_mw_year * installed_mw / 1e6 * esc
        opex_mgmt = opex.asset_management_usd_year / 1e6 * esc
        total_opex = opex_fixed + opex_var + opex_ins + opex_lease + opex_mgmt

        ebitda = revenue - total_opex

        # Depreciation (straight-line)
        depr = total_capex / p.depreciation_years if yr <= p.depreciation_years else 0.0

        ebit = ebitda - depr

        # Debt service
        if yr <= debt.grace_period_years:
            interest = debt_outstanding * r
            principal = 0.0
            dscr_val = None
        elif yr <= debt.loan_tenor_years:
            interest = debt_outstanding * r
            principal = annual_debt_service - interest
            debt_outstanding = max(0.0, debt_outstanding - principal)
            dscr_val = ebitda / annual_debt_service if annual_debt_service > 0 else None
        else:
            interest = 0.0
            principal = 0.0
            dscr_val = None

        ebt = ebit - interest
        tax = max(0.0, ebt) * p.tax_rate
        net_income = ebt - tax

        # Decommissioning in last year
        decom_yr = decom_cost if yr == p.project_lifetime_years else 0.0

        fcfe = net_income + depr - principal - decom_yr
        # Unlevered FCFF
        fcff = ebitda * (1 - p.tax_rate) + depr * p.tax_rate - decom_yr

        capex_yr_amount = 0.0
        cash_flows_project.append(fcff)
        cash_flows_equity.append(fcfe)

        annual_cfs.append(AnnualCashFlow(
            year=yr,
            revenue_musd=revenue,
            opex_musd=total_opex,
            ebitda_musd=ebitda,
            depreciation_musd=depr,
            ebit_musd=ebit,
            interest_musd=interest,
            ebt_musd=ebt,
            tax_musd=tax,
            net_income_musd=net_income,
            debt_repayment_musd=principal,
            capex_musd=capex_yr_amount,
            fcfe_musd=fcfe,
            fcff_musd=fcff,
            debt_outstanding_musd=debt_outstanding,
            dscr=dscr_val,
        ))

    project_irr = _irr(cash_flows_project)
    equity_irr = _irr(cash_flows_equity)
    npv = _npv(cash_flows_project, p.wacc)

    # LCOE
    all_costs = [-c for c in cash_flows_project[:p.construction_years]]
    for yr in range(1, p.project_lifetime_years + 1):
        cf = annual_cfs[yr - 1]
        all_costs_yr = cf.opex_musd + (decom_cost if yr == p.project_lifetime_years else 0.0)
        all_costs.append(all_costs_yr)

    pv_costs = sum(c / (1 + p.wacc) ** t for t, c in enumerate(all_costs))
    pv_costs += total_capex * sum(
        draw[c] / (1 + p.wacc) ** c for c in range(p.construction_years)
    )
    pv_energy = sum(
        aep_mwh / (1 + p.wacc) ** (p.construction_years + yr)
        for yr in range(1, p.project_lifetime_years + 1)
    )
    lcoe = (pv_costs * 1e6 / pv_energy) if pv_energy > 0 else 0.0

    # DSCR stats
    dscr_vals = [cf.dscr for cf in annual_cfs if cf.dscr is not None]
    min_dscr = min(dscr_vals) if dscr_vals else 0.0
    avg_dscr = float(np.mean(dscr_vals)) if dscr_vals else 0.0

    if min_dscr < 1.2:
        warnings.append(f"Min DSCR {min_dscr:.2f} is below typical covenant of 1.20")
    if equity_irr < p.wacc:
        warnings.append(f"Equity IRR {equity_irr:.1%} is below WACC {p.wacc:.1%}")

    # Payback year
    cumulative = 0.0
    payback_yr = p.project_lifetime_years
    for cf in annual_cfs:
        cumulative += cf.fcff_musd
        if cumulative >= equity_total:
            payback_yr = cf.year
            break

    return FinancialResult(
        project_irr=project_irr,
        equity_irr=equity_irr,
        npv_musd=npv,
        lcoe_usd_mwh=lcoe,
        payback_year=payback_yr,
        min_dscr=min_dscr,
        average_dscr=avg_dscr,
        total_capex_musd=total_capex,
        annual_cash_flows=annual_cfs,
        capex_breakdown_musd=capex_breakdown,
        lcoe_components={
            "capex_contribution": pv_costs * (total_capex / (pv_costs or 1.0)) * 1e6 / (pv_energy or 1.0),
            "opex_contribution": pv_costs * (1 - total_capex / (pv_costs or 1.0)) * 1e6 / (pv_energy or 1.0),
        },
        warnings=warnings,
    )

from __future__ import annotations
import numpy as np
from concurrent.futures import ProcessPoolExecutor, as_completed
from models.sensitivity import MonteCarloInput, MonteCarloResult
from models.financial import FinancialRequest
from services.financial.dcf_model import calculate_financials


def _run_single(args):
    """Worker function for a single MC iteration."""
    req_dict, aep_sample, capex_mult, opex_mult, price_mult = args
    from models.financial import FinancialRequest
    req = FinancialRequest.model_validate(req_dict)
    req.aep_gwh = aep_sample
    req.params.capex.turbine_supply_usd_mw *= capex_mult
    req.params.capex.foundation_total_musd *= capex_mult
    req.params.opex.fixed_usd_mw_year *= opex_mult
    req.params.energy_price.base_price_usd_mwh *= price_mult
    result = calculate_financials(req)
    return result.equity_irr, result.project_irr, result.lcoe_usd_mwh, result.npv_musd


def run_monte_carlo(inp: MonteCarloInput) -> MonteCarloResult:
    """
    Sample from distributions and run DCF for each iteration.
    Uses numpy random (seeded) for reproducibility.
    For large n_iterations, uses ProcessPoolExecutor.
    """
    rng = np.random.default_rng(42)
    n = inp.n_iterations

    # AEP: LogNormal fitted to P50/P90
    aep_p50 = inp.request.aep_gwh
    aep_p90 = inp.aep_p90_gwh
    # ln(P50) and ln(P90)
    # P90 = 10th percentile → z = -1.2816
    sigma_ln = (np.log(aep_p50) - np.log(aep_p90)) / 1.2816
    mu_ln = np.log(aep_p50)
    aep_samples = rng.lognormal(mu_ln, sigma_ln, n)

    # CAPEX/OPEX/price: Normal centered at 1.0 with relative std
    capex_std = inp.capex_uncertainty_pct / 1.96
    opex_std = inp.opex_uncertainty_pct / 1.96
    price_std = inp.energy_price_uncertainty_pct / 1.96
    capex_mults = np.clip(rng.normal(1.0, capex_std, n), 0.5, 2.0)
    opex_mults = np.clip(rng.normal(1.0, opex_std, n), 0.5, 2.0)
    price_mults = np.clip(rng.normal(1.0, price_std, n), 0.5, 2.0)

    req_dict = inp.request.model_dump()

    # Run sequentially for smaller runs, parallel for large
    irr_eq, irr_pr, lcoe, npv = [], [], [], []
    if n <= 500:
        for i in range(n):
            r = _run_single((req_dict, float(aep_samples[i]),
                             float(capex_mults[i]), float(opex_mults[i]),
                             float(price_mults[i])))
            irr_eq.append(r[0]); irr_pr.append(r[1])
            lcoe.append(r[2]); npv.append(r[3])
    else:
        args_list = [
            (req_dict, float(aep_samples[i]), float(capex_mults[i]),
             float(opex_mults[i]), float(price_mults[i]))
            for i in range(n)
        ]
        with ProcessPoolExecutor(max_workers=4) as ex:
            for res in ex.map(_run_single, args_list, chunksize=50):
                irr_eq.append(res[0]); irr_pr.append(res[1])
                lcoe.append(res[2]); npv.append(res[3])

    def stats(arr):
        a = np.array(arr)
        return {
            "p10": float(np.percentile(a, 10)),
            "p25": float(np.percentile(a, 25)),
            "p50": float(np.percentile(a, 50)),
            "p75": float(np.percentile(a, 75)),
            "p90": float(np.percentile(a, 90)),
            "mean": float(np.mean(a)),
        }

    return MonteCarloResult(
        n_iterations=n,
        equity_irr=stats(irr_eq),
        project_irr=stats(irr_pr),
        lcoe_usd_mwh=stats(lcoe),
        npv_musd=stats(npv),
        irr_histogram=irr_eq,
        lcoe_histogram=lcoe,
    )

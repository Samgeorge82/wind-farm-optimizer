from __future__ import annotations
import copy
from models.sensitivity import TornadoInput, TornadoResult, TornadoBar
from models.financial import FinancialRequest
from services.financial.dcf_model import calculate_financials


def _get_metric(result, metric: str) -> float:
    return getattr(result, metric, 0.0)


def _set_nested(obj, path: str, value):
    """Set attribute at dot-notation path on a nested pydantic model."""
    parts = path.split(".")
    cur = obj
    for part in parts[:-1]:
        cur = getattr(cur, part)
    setattr(cur, parts[-1], value)


def run_tornado(inp: TornadoInput) -> TornadoResult:
    base_req = inp.request
    base_result = calculate_financials(base_req)
    base_val = _get_metric(base_result, inp.target_metric)

    bars = []
    for var in inp.variables:
        # Low case
        req_low = base_req.model_copy(deep=True)
        if var.attribute_path:
            low_val = var.base_value * (1 - var.low_pct)
            _set_nested(req_low.params, var.attribute_path, low_val)
        else:
            # Fallback: scale AEP
            req_low = FinancialRequest(
                params=req_low.params,
                installed_mw=req_low.installed_mw,
                aep_gwh=req_low.aep_gwh * (1 - var.low_pct),
                n_turbines=req_low.n_turbines,
            )
        low_result = calculate_financials(req_low)
        low_impact = _get_metric(low_result, inp.target_metric)

        # High case
        req_high = base_req.model_copy(deep=True)
        if var.attribute_path:
            high_val = var.base_value * (1 + var.high_pct)
            _set_nested(req_high.params, var.attribute_path, high_val)
        else:
            req_high = FinancialRequest(
                params=req_high.params,
                installed_mw=req_high.installed_mw,
                aep_gwh=req_high.aep_gwh * (1 + var.high_pct),
                n_turbines=req_high.n_turbines,
            )
        high_result = calculate_financials(req_high)
        high_impact = _get_metric(high_result, inp.target_metric)

        bars.append(TornadoBar(
            variable=var.name,
            display_label=var.display_label,
            base_value=var.base_value,
            low_impact=low_impact,
            high_impact=high_impact,
            swing=abs(high_impact - low_impact),
        ))

    bars.sort(key=lambda b: b.swing, reverse=True)
    return TornadoResult(
        target_metric=inp.target_metric,
        base_result=base_val,
        bars=bars,
    )

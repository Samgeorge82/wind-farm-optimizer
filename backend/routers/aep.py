import json
import copy
import numpy as np
from itertools import product
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks
from models.layout import LayoutEvaluateRequest, LayoutOptimizeRequest, AEPResult
from models.financial import FinancialRequest, FinancialParams, CapexBreakdown
from models.foundation import SeabedType
from services.wake.jensen import JensenWakeModel
from services.wake.gaussian import GaussianWakeModel
from services.aep.calculator import AEPCalculator
from services.financial.dcf_model import calculate_financials
from services.layout.boundary import CoordinateTransformer, generate_staggered_layout
from services.layout.optimizer import LayoutOptimizer
from services.electrical.string_builder import build_strings, get_segment_pairs
from services.electrical.cable_sizer import load_cable_specs, size_segment
from services.electrical.oss_optimizer import optimize_oss_position, build_oss_config
from services.electrical.export_cable import select_export_cable
from services.foundation.cost_model import (
    select_foundation_type, compute_foundation_cost
)
from workers.task_runner import job_store, JobStatus

router = APIRouter()

_FOUNDATION_DATA_PATH = Path(__file__).parent.parent / "data" / "foundation_costs.json"
_foundation_cost_params_cache = None


def _load_foundation_params():
    global _foundation_cost_params_cache
    if _foundation_cost_params_cache is None:
        try:
            with open(_FOUNDATION_DATA_PATH) as f:
                _foundation_cost_params_cache = json.load(f)
        except Exception:
            _foundation_cost_params_cache = {}
    return _foundation_cost_params_cache


def _get_wake_model(name: str):
    if name == "gaussian":
        return GaussianWakeModel()
    return JensenWakeModel()


@router.post("/evaluate", response_model=AEPResult)
def evaluate_layout(req: LayoutEvaluateRequest):
    if not req.turbines:
        raise HTTPException(400, "No turbines provided")
    transformer = CoordinateTransformer.from_boundary(req.boundary)
    x = np.array([t.x for t in req.turbines])
    y = np.array([t.y for t in req.turbines])
    wake = _get_wake_model(req.wake_model)
    calc = AEPCalculator(req.wind_rose, req.turbine_spec, wake)
    result = calc.compute(x, y)
    return AEPResult(**result)


@router.post("/optimize")
def start_optimization(req: LayoutOptimizeRequest, background_tasks: BackgroundTasks):
    if req.objective in ("lcoe", "irr", "npv") and req.financial_params is None:
        raise HTTPException(
            400,
            f"financial_params is required for {req.objective.upper()} optimization"
        )
    job_id = job_store.create()
    background_tasks.add_task(_run_optimization, job_id, req)
    return {"job_id": job_id, "status": "pending"}


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job_store.to_dict(job)


@router.delete("/jobs/{job_id}")
def cancel_job(job_id: str):
    if not job_store.exists(job_id):
        raise HTTPException(404, "Job not found")
    job_store.cancel(job_id)
    return {"message": "Cancellation requested"}


# ─── Full-cost computation ─────────────────────────────────────────────────────

def _compute_full_project_cost(
    positions: np.ndarray,
    oss_position: np.ndarray,
    req: LayoutOptimizeRequest,
    voltage_kv: float = None,
    max_per_string: int = None,
) -> dict:
    """
    Compute total project CAPEX from turbine positions and OSS position.
    voltage_kv and max_per_string can override the request defaults for sweeps.
    """
    voltage = voltage_kv or req.array_voltage_kv
    mps = max_per_string or req.max_turbines_per_string
    n_turbines = len(positions)
    installed_mw = n_turbines * req.turbine_spec.rated_power_kw / 1000.0

    fin = req.financial_params
    capex = fin.capex if fin else CapexBreakdown()
    turbine_cost_musd = (
        (capex.turbine_supply_usd_mw + capex.turbine_installation_usd_mw)
        * installed_mw / 1e6
    )

    oss_config = build_oss_config(oss_position, installed_mw, {}, 0.0, 0.0)
    oss_cost_musd = oss_config.total_cost_musd

    turbine_ids = [f"t_{i}" for i in range(n_turbines)]
    strings_ids = build_strings(turbine_ids, positions, oss_position, mps)
    cable_specs = load_cable_specs(voltage)

    pos_map = {turbine_ids[i]: positions[i] for i in range(n_turbines)}
    total_array_cable_cost_usd = 0.0
    total_array_cable_km = 0.0

    for string in strings_ids:
        pairs = get_segment_pairs(string)
        n_downstream = len(string)
        for from_id, to_id in pairs:
            from_pos = pos_map[from_id]
            to_pos = oss_position if to_id == "OSS" else pos_map[to_id]
            seg = size_segment(
                from_id, to_id, from_pos, to_pos,
                n_downstream, req.turbine_spec.rated_power_kw,
                voltage, cable_specs,
            )
            total_array_cable_cost_usd += seg.cost_usd
            total_array_cable_km += seg.length_m / 1000.0
            n_downstream -= 1

    array_cable_cost_musd = total_array_cable_cost_usd / 1e6

    foundation_cost_params = _load_foundation_params()
    foundation_cost_musd = 0.0
    if foundation_cost_params:
        seabed = SeabedType.SAND
        for i in range(n_turbines):
            ftype = select_foundation_type(req.water_depth_m, seabed)
            result = compute_foundation_cost(
                req.turbine_spec, req.water_depth_m, seabed,
                ftype, foundation_cost_params
            )
            foundation_cost_musd += result.total_cost_musd
    else:
        foundation_cost_musd = capex.foundation_total_musd

    export = select_export_cable(req.distance_to_shore_km, installed_mw)
    export_cable_cost_musd = export.total_cost_musd

    installation_cost_musd = capex.installation_vessels_musd + capex.mobilization_musd
    onshore_cost_musd = capex.onshore_substation_musd

    hard_cost_musd = (
        turbine_cost_musd + foundation_cost_musd + array_cable_cost_musd
        + oss_cost_musd + export_cable_cost_musd + onshore_cost_musd
        + installation_cost_musd
    )
    soft_pct = capex.development_engineering_pct + capex.contingency_pct
    soft_cost_musd = hard_cost_musd * soft_pct
    total_capex_musd = hard_cost_musd + soft_cost_musd

    return {
        "total_capex_musd": total_capex_musd,
        "turbine_cost_musd": turbine_cost_musd,
        "foundation_cost_musd": foundation_cost_musd,
        "array_cable_cost_musd": array_cable_cost_musd,
        "array_cable_total_km": total_array_cable_km,
        "oss_cost_musd": oss_cost_musd,
        "export_cable_cost_musd": export_cable_cost_musd,
        "installation_cost_musd": installation_cost_musd,
        "onshore_cost_musd": onshore_cost_musd,
        "soft_cost_musd": soft_cost_musd,
    }


def _build_financial_params_with_costs(
    base_params: FinancialParams, cost_breakdown: dict, installed_mw: float,
) -> FinancialParams:
    params_dict = base_params.model_dump()
    params_dict["capex"]["foundation_total_musd"] = cost_breakdown["foundation_cost_musd"]
    params_dict["capex"]["array_cable_total_km"] = cost_breakdown["array_cable_total_km"]
    if cost_breakdown["array_cable_total_km"] > 0:
        params_dict["capex"]["array_cable_usd_km"] = (
            cost_breakdown["array_cable_cost_musd"] * 1e6
            / cost_breakdown["array_cable_total_km"]
        )
    params_dict["capex"]["oss_total_musd"] = cost_breakdown["oss_cost_musd"]
    params_dict["capex"]["export_cable_total_km"] = 0.0
    if cost_breakdown.get("export_cable_cost_musd", 0) > 0:
        params_dict["capex"]["export_cable_total_km"] = 1.0
        params_dict["capex"]["export_cable_usd_km"] = cost_breakdown["export_cable_cost_musd"] * 1e6
    params_dict["capex"]["installation_vessels_musd"] = cost_breakdown["installation_cost_musd"]
    params_dict["capex"]["onshore_substation_musd"] = cost_breakdown["onshore_cost_musd"]
    params_dict["capex"]["mobilization_musd"] = 0.0
    return FinancialParams(**params_dict)


# ─── Objective functions ────────────────────────────────────────────────────────

def _build_objective_fn(req, calc, job_id, voltage_kv=None, max_per_string=None):
    """
    Build objective function. voltage_kv/max_per_string override defaults for sweep.
    Returns: (obj_fn, maximize, label, unit, include_oss)
    """
    voltage = voltage_kv or req.array_voltage_kv
    mps = max_per_string or req.max_turbines_per_string
    installed_mw = req.n_turbines * req.turbine_spec.rated_power_kw / 1000.0

    if req.objective == "aep":
        def aep_fn(positions):
            if job_store.is_cancelled(job_id):
                raise InterruptedError("Cancelled")
            r = calc.compute(positions[:, 0], positions[:, 1])
            return r["aep_gwh"]
        return aep_fn, True, "AEP", "GWh", False

    fin_params = req.financial_params or FinancialParams()

    def _financial_fn(positions, oss_position, metric):
        if job_store.is_cancelled(job_id):
            raise InterruptedError("Cancelled")
        r = calc.compute(positions[:, 0], positions[:, 1])
        aep_gwh = r["aep_gwh"]
        if aep_gwh <= 0:
            if metric == "lcoe": return 9999.0
            return -9999.0 if metric == "npv" else 0.0
        costs = _compute_full_project_cost(positions, oss_position, req, voltage, mps)
        full_params = _build_financial_params_with_costs(fin_params, costs, installed_mw)
        fin_req = FinancialRequest(
            params=full_params, installed_mw=installed_mw,
            aep_gwh=aep_gwh, n_turbines=req.n_turbines,
        )
        fin_result = calculate_financials(fin_req)
        if metric == "lcoe": return fin_result.lcoe_usd_mwh
        if metric == "irr": return fin_result.project_irr
        return fin_result.npv_musd  # npv

    if req.objective == "lcoe":
        def fn(p, o): return _financial_fn(p, o, "lcoe")
        return fn, False, "LCOE", "$/MWh", True
    elif req.objective == "irr":
        def fn(p, o): return _financial_fn(p, o, "irr")
        return fn, True, "IRR", "%", True
    elif req.objective == "npv":
        def fn(p, o): return _financial_fn(p, o, "npv")
        return fn, True, "NPV", "MUSD", True
    else:
        raise ValueError(f"Unknown objective: {req.objective}")


# ─── Single-config optimization run ────────────────────────────────────────────

def _optimize_single_config(
    req, boundary_poly, min_spacing, job_id,
    n_turbines, voltage_kv, max_per_string,
    progress_offset=15.0, progress_scale=73.0,
):
    """
    Run optimization for a single (n_turbines, voltage, string_size) config.
    Returns dict with result or None if failed.
    """
    # Generate initial layout
    initial = generate_staggered_layout(boundary_poly, n_turbines, min_spacing)
    if len(initial) < n_turbines:
        return None  # Can't fit this many turbines

    initial_oss = np.mean(initial[:n_turbines], axis=0)

    # Create a modified request with this config
    req_copy = req.model_copy()
    req_copy.n_turbines = n_turbines
    req_copy.array_voltage_kv = voltage_kv
    req_copy.max_turbines_per_string = max_per_string

    if req.method in ("grid", "staggered"):
        final_turbines = initial[:n_turbines]
        final_oss = optimize_oss_position(
            final_turbines, boundary_poly,
            n_turbines * req.turbine_spec.rated_power_kw / 1000.0,
        )
    else:
        wake = _get_wake_model(req.wake_model)
        calc = AEPCalculator(req.wind_rose, req.turbine_spec, wake)

        obj_fn, maximize, obj_label, obj_unit, include_oss = _build_objective_fn(
            req_copy, calc, job_id, voltage_kv, max_per_string
        )

        def progress_cb(pct, msg):
            scaled = progress_offset + (pct - 15.0) / 73.0 * progress_scale
            job_store.update(job_id, progress=min(88.0, scaled), message=msg)

        optimizer = LayoutOptimizer(
            obj_fn=obj_fn, boundary=boundary_poly,
            n_turbines=n_turbines, min_spacing_m=min_spacing,
            rotor_diameter=req.turbine_spec.rotor_diameter_m,
            maximize=maximize, progress_cb=progress_cb,
            obj_label=obj_label, obj_unit=obj_unit,
            include_oss=include_oss,
        )

        final_turbines, final_oss = optimizer.optimize(
            initial[:n_turbines], method=req.method,
            max_iterations=req.max_iterations,
            initial_oss=initial_oss if include_oss else None,
        )

        if final_oss is None:
            final_oss = optimize_oss_position(
                final_turbines, boundary_poly,
                n_turbines * req.turbine_spec.rated_power_kw / 1000.0,
            )

    # Evaluate final AEP
    wake = _get_wake_model(req.wake_model)
    calc = AEPCalculator(req.wind_rose, req.turbine_spec, wake)
    final_aep = calc.compute(final_turbines[:, 0], final_turbines[:, 1])

    installed_mw = n_turbines * req.turbine_spec.rated_power_kw / 1000.0
    cost_breakdown = {}
    financial_summary = {}

    try:
        cost_breakdown = _compute_full_project_cost(
            final_turbines, final_oss, req_copy, voltage_kv, max_per_string
        )
    except Exception as e:
        cost_breakdown = {"error": str(e)}

    if req.financial_params and final_aep["aep_gwh"] > 0 and "error" not in cost_breakdown:
        full_params = _build_financial_params_with_costs(
            req.financial_params, cost_breakdown, installed_mw
        )
        fin_req = FinancialRequest(
            params=full_params, installed_mw=installed_mw,
            aep_gwh=final_aep["aep_gwh"], n_turbines=n_turbines,
        )
        fin_result = calculate_financials(fin_req)
        financial_summary = {
            "lcoe_usd_mwh": fin_result.lcoe_usd_mwh,
            "project_irr": fin_result.project_irr,
            "npv_musd": fin_result.npv_musd,
            "total_capex_musd": fin_result.total_capex_musd,
            "equity_irr": fin_result.equity_irr,
            "payback_year": fin_result.payback_year,
        }

    return {
        "final_turbines": final_turbines,
        "final_oss": final_oss,
        "final_aep": final_aep,
        "cost_breakdown": cost_breakdown,
        "financial_summary": financial_summary,
        "config": {
            "n_turbines": n_turbines,
            "array_voltage_kv": voltage_kv,
            "max_turbines_per_string": max_per_string,
        },
    }


def _get_objective_value(result, objective):
    """Extract the objective metric from a result for comparison."""
    fs = result["financial_summary"]
    fa = result["final_aep"]
    if objective == "aep":
        return fa["aep_gwh"]
    elif objective == "lcoe":
        return fs.get("lcoe_usd_mwh", 9999.0)
    elif objective == "irr":
        return fs.get("project_irr", 0.0)
    elif objective == "npv":
        return fs.get("npv_musd", -9999.0)
    return 0.0


# ─── Main optimization runner ──────────────────────────────────────────────────

def _run_optimization(job_id: str, req: LayoutOptimizeRequest):
    try:
        obj_name = req.objective.upper()
        maximize = req.objective in ("aep", "irr", "npv")

        transformer = CoordinateTransformer.from_boundary(req.boundary)
        boundary_poly = transformer.boundary_to_shapely(req.boundary)
        min_spacing = req.min_spacing_diameters * req.turbine_spec.rotor_diameter_m

        # ── Build discrete sweep combinations ──
        n_turbines_list = req.n_turbines_range or [req.n_turbines]
        voltage_list = req.voltage_options or [req.array_voltage_kv]
        string_list = req.string_size_range or [req.max_turbines_per_string]

        combos = list(product(n_turbines_list, voltage_list, string_list))
        n_combos = len(combos)
        is_sweep = n_combos > 1

        if is_sweep:
            job_store.update(
                job_id, status=JobStatus.RUNNING, progress=5.0,
                message=f"Sweeping {n_combos} configurations for best {obj_name}"
            )
        else:
            is_financial = req.objective != "aep"
            job_store.update(
                job_id, status=JobStatus.RUNNING, progress=5.0,
                message=f"Initializing {obj_name} {'co-' if is_financial else ''}optimization"
            )

        best_result = None
        best_obj_val = -np.inf if maximize else np.inf
        all_configs = []

        for idx, (nt, vkv, mps) in enumerate(combos):
            if job_store.is_cancelled(job_id):
                raise InterruptedError("Cancelled")

            progress_offset = 10.0 + idx * (78.0 / n_combos)
            progress_scale = 78.0 / n_combos

            if is_sweep:
                job_store.update(
                    job_id, progress=progress_offset,
                    message=f"Config {idx+1}/{n_combos}: {nt} turbines, {vkv}kV, {mps}/string"
                )

            result = _optimize_single_config(
                req, boundary_poly, min_spacing, job_id,
                n_turbines=nt, voltage_kv=vkv, max_per_string=mps,
                progress_offset=progress_offset, progress_scale=progress_scale,
            )

            if result is None:
                all_configs.append({
                    "n_turbines": nt, "voltage_kv": vkv, "string_size": mps,
                    "status": "skipped", "reason": f"Only {len(generate_staggered_layout(boundary_poly, nt, min_spacing))} fit"
                })
                continue

            obj_val = _get_objective_value(result, req.objective)
            all_configs.append({
                "n_turbines": nt, "voltage_kv": vkv, "string_size": mps,
                "status": "ok", "objective_value": obj_val,
            })

            is_better = (maximize and obj_val > best_obj_val) or \
                        (not maximize and obj_val < best_obj_val)
            if is_better:
                best_obj_val = obj_val
                best_result = result

        if best_result is None:
            job_store.update(
                job_id, status=JobStatus.FAILED,
                error="No valid configuration found. Reduce turbine count or spacing."
            )
            return

        # ── Build output ──
        job_store.update(job_id, progress=92.0, message="Finalizing best configuration")
        final_turbines = best_result["final_turbines"]
        final_oss = best_result["final_oss"]
        final_aep = best_result["final_aep"]
        cost_breakdown = best_result["cost_breakdown"]
        financial_summary = best_result["financial_summary"]
        chosen_config = best_result["config"]

        n_out = chosen_config["n_turbines"]
        turbines_out = []
        for i, (x, y) in enumerate(final_turbines):
            lat, lng = transformer.local_to_geo(x, y)
            turbines_out.append({
                "id": f"opt_{i}", "x": float(x), "y": float(y),
                "lat": lat, "lng": lng,
                "aep_gwh": final_aep["per_turbine_aep"][i],
                "wake_loss": final_aep["per_turbine_wake_loss"][i],
            })

        oss_lat, oss_lng = transformer.local_to_geo(
            float(final_oss[0]), float(final_oss[1])
        )
        oss_info = {
            "x": float(final_oss[0]), "y": float(final_oss[1]),
            "lat": oss_lat, "lng": oss_lng,
        }

        result_data = {
            **final_aep,
            **financial_summary,
            "cost_breakdown": cost_breakdown,
            "objective": req.objective,
            "turbines": turbines_out,
            "oss": oss_info,
            "chosen_config": chosen_config,
        }
        if is_sweep:
            result_data["sweep_results"] = all_configs

        job_store.update(
            job_id, status=JobStatus.COMPLETED, progress=100.0,
            message=f"{obj_name} optimization complete",
            result=result_data,
        )

    except InterruptedError:
        job_store.update(job_id, status=JobStatus.CANCELLED, error="Cancelled by user")
    except Exception as e:
        import traceback
        job_store.update(job_id, status=JobStatus.FAILED, error=f"{str(e)}\n{traceback.format_exc()}")


# ─── Wake field visualization ────────────────────────────────────────────────

from pydantic import BaseModel as _BaseModel
from typing import List as _List, Optional as _Optional


class WakeFieldRequest(_BaseModel):
    boundary: "BoundaryPolygon"
    turbines: _List[dict]  # [{x, y, lat, lng}, ...]
    turbine_spec: "TurbineSpec"
    wind_direction_deg: float = 270.0  # meteorological: direction wind comes FROM
    wind_speed_ms: float = 10.0
    wake_model: str = "jensen"
    grid_resolution_m: float = 80.0  # grid cell size in meters


from models.layout import BoundaryPolygon
from models.turbine import TurbineSpec
WakeFieldRequest.model_rebuild()


def _compute_wake_field_jensen(
    turbine_x: np.ndarray,
    turbine_y: np.ndarray,
    grid_x: np.ndarray,
    grid_y: np.ndarray,
    wind_dir_deg: float,
    wind_speed: float,
    rotor_diameter: float,
    ct: float,
    k: float = 0.04,
) -> np.ndarray:
    """
    Compute Jensen wake deficit at each grid point.
    Returns array of speed ratios (1.0 = no deficit, 0.5 = 50% deficit).
    """
    angle_rad = np.radians(270.0 - wind_dir_deg)
    cos_a, sin_a = np.cos(angle_rad), np.sin(angle_rad)

    # Rotate turbine positions to wind frame
    tx_rot = turbine_x * cos_a - turbine_y * sin_a
    ty_rot = turbine_x * sin_a + turbine_y * cos_a

    # Rotate grid positions to wind frame
    gx_rot = grid_x * cos_a - grid_y * sin_a
    gy_rot = grid_x * sin_a + grid_y * cos_a

    r0 = rotor_diameter / 2.0
    n_turbines = len(turbine_x)
    n_grid = len(grid_x)
    deficits_sq = np.zeros(n_grid)

    for i in range(n_turbines):
        # Vector from turbine i to all grid points
        dx = gx_rot - tx_rot[i]
        dy = np.abs(gy_rot - ty_rot[i])

        # Only points downwind
        mask = dx > 0.0
        wake_radius = r0 + k * dx  # wake cone radius at each point
        # Points within wake cone
        mask &= dy < wake_radius + r0

        if not np.any(mask):
            continue

        dx_m = dx[mask]
        dy_m = dy[mask]
        wr_m = r0 + k * dx_m

        # Overlap fraction (simplified: use lateral distance / wake radius)
        # Full overlap if dy < wake_radius - r0, partial otherwise
        overlap = np.ones_like(dx_m)
        partial = dy_m > (wr_m - r0)
        if np.any(partial):
            # Approximate overlap for grid points
            overlap[partial] = np.clip(
                1.0 - (dy_m[partial] - (wr_m[partial] - r0)) / (2 * r0), 0.0, 1.0
            )

        deficit = (
            (1.0 - np.sqrt(max(0.0, 1.0 - ct)))
            * (rotor_diameter / (rotor_diameter + 2.0 * k * dx_m)) ** 2
            * overlap
        )
        deficits_sq[mask] += deficit ** 2

    combined = np.sqrt(deficits_sq)
    return np.clip(1.0 - combined, 0.0, 1.0)


def _compute_wake_field_gaussian(
    turbine_x: np.ndarray,
    turbine_y: np.ndarray,
    grid_x: np.ndarray,
    grid_y: np.ndarray,
    wind_dir_deg: float,
    wind_speed: float,
    rotor_diameter: float,
    ct: float,
    k_star: float = 0.04,
    epsilon: float = 0.20,
) -> np.ndarray:
    """
    Compute Bastankhah Gaussian wake deficit at each grid point.
    Returns array of speed ratios (1.0 = no deficit).
    """
    angle_rad = np.radians(270.0 - wind_dir_deg)
    cos_a, sin_a = np.cos(angle_rad), np.sin(angle_rad)

    tx_rot = turbine_x * cos_a - turbine_y * sin_a
    ty_rot = turbine_x * sin_a + turbine_y * cos_a
    gx_rot = grid_x * cos_a - grid_y * sin_a
    gy_rot = grid_x * sin_a + grid_y * cos_a

    D = rotor_diameter
    sigma0 = epsilon * D / np.sqrt(8.0)
    n_turbines = len(turbine_x)
    n_grid = len(grid_x)
    deficits = np.zeros(n_grid)

    ct_eff = np.clip(ct, 0.0, 1.0)

    for i in range(n_turbines):
        dx = gx_rot - tx_rot[i]
        dy = gy_rot - ty_rot[i]

        mask = dx > 0.5 * D
        if not np.any(mask):
            continue

        dx_m = dx[mask]
        dy_m = dy[mask]
        sigma = sigma0 + k_star * dx_m

        radicand = 1.0 - ct_eff / (8.0 * (sigma / D) ** 2)
        C = 1.0 - np.sqrt(np.clip(radicand, 0.0, None))
        deficit = C * np.exp(-0.5 * (dy_m / sigma) ** 2)
        deficits[mask] += deficit

    combined = np.clip(deficits, 0.0, 0.999)
    return 1.0 - combined


@router.post("/wake-field")
def compute_wake_field(req: WakeFieldRequest):
    """
    Compute a 2D wake deficit grid for visualization.
    Returns speed_ratio grid (1.0 = freestream, <1.0 = deficit) plus geographic bounds.
    """
    if not req.turbines:
        raise HTTPException(400, "No turbines provided")

    transformer = CoordinateTransformer.from_boundary(req.boundary)

    # Get turbine local positions
    tx = np.array([t.get("x", 0.0) for t in req.turbines])
    ty = np.array([t.get("y", 0.0) for t in req.turbines])

    # If only lat/lng provided, convert to local
    if np.all(tx == 0) and np.all(ty == 0):
        for i, t in enumerate(req.turbines):
            local = transformer.geo_to_local(t["lat"], t["lng"])
            tx[i] = local[0]
            ty[i] = local[1]

    # Compute bounding box of boundary in local coords
    bnd_local = []
    for c in req.boundary.coordinates:
        lx, ly = transformer.geo_to_local(c.lat, c.lng)
        bnd_local.append((lx, ly))
    bnd_local = np.array(bnd_local)
    min_x, min_y = bnd_local.min(axis=0) - 500  # 500m padding
    max_x, max_y = bnd_local.max(axis=0) + 500

    # Build grid
    res = req.grid_resolution_m
    xs = np.arange(min_x, max_x, res)
    ys = np.arange(min_y, max_y, res)
    cols = len(xs)
    rows = len(ys)

    # Cap grid size to avoid memory issues
    if rows * cols > 500_000:
        scale = np.sqrt(rows * cols / 500_000)
        res *= scale
        xs = np.arange(min_x, max_x, res)
        ys = np.arange(min_y, max_y, res)
        cols = len(xs)
        rows = len(ys)

    gx, gy = np.meshgrid(xs, ys)
    gx_flat = gx.ravel()
    gy_flat = gy.ravel()

    # Interpolate Ct from turbine spec ct_curve at wind speed
    ct = 0.8  # default
    if req.turbine_spec.ct_curve:
        ct_speeds = [p.wind_speed for p in req.turbine_spec.ct_curve]
        ct_vals = [p.power for p in req.turbine_spec.ct_curve]  # 'power' field holds Ct values
        ct = float(np.interp(req.wind_speed_ms, ct_speeds, ct_vals))

    # Compute wake field
    if req.wake_model == "gaussian":
        speed_ratio = _compute_wake_field_gaussian(
            tx, ty, gx_flat, gy_flat,
            req.wind_direction_deg, req.wind_speed_ms,
            req.turbine_spec.rotor_diameter_m, ct,
        )
    else:
        speed_ratio = _compute_wake_field_jensen(
            tx, ty, gx_flat, gy_flat,
            req.wind_direction_deg, req.wind_speed_ms,
            req.turbine_spec.rotor_diameter_m, ct,
        )

    # Reshape to 2D grid [rows x cols]
    grid = speed_ratio.reshape(rows, cols)

    # Convert grid bounds to geographic coordinates
    min_lat, min_lng = transformer.local_to_geo(min_x, min_y)
    max_lat, max_lng = transformer.local_to_geo(max_x, max_y)

    # Return as list of lists (JSON-serializable)
    return {
        "grid": grid.tolist(),
        "bounds": {
            "min_lat": min_lat,
            "min_lng": min_lng,
            "max_lat": max_lat,
            "max_lng": max_lng,
        },
        "rows": rows,
        "cols": cols,
        "wind_direction_deg": req.wind_direction_deg,
        "wind_speed_ms": req.wind_speed_ms,
        "grid_resolution_m": res,
    }

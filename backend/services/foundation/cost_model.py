from __future__ import annotations
import json
from pathlib import Path
from typing import List
from models.foundation import (
    FoundationType, SeabedType, TurbineFoundationResult, FoundationSummary
)
from models.layout import TurbinePosition
from models.turbine import TurbineSpec

_DATA_PATH = Path(__file__).parent.parent.parent / "data" / "foundation_costs.json"


def select_foundation_type(
    depth_m: float, seabed: SeabedType
) -> FoundationType:
    if seabed == SeabedType.ROCK:
        if depth_m < 60:
            return FoundationType.JACKET
        elif depth_m < 200:
            return FoundationType.FLOATING_SEMI_SUB
        else:
            return FoundationType.FLOATING_SPAR
    if depth_m < 30:
        return FoundationType.MONOPILE
    elif depth_m < 60:
        # Overlap zone: choose cheapest (monopile typically wins up to ~40m)
        return FoundationType.MONOPILE if depth_m < 40 else FoundationType.JACKET
    elif depth_m < 200:
        return FoundationType.FLOATING_SEMI_SUB
    else:
        return FoundationType.FLOATING_SPAR


def compute_foundation_cost(
    turbine: TurbineSpec,
    depth_m: float,
    seabed: SeabedType,
    ftype: FoundationType,
    cost_params: dict,
) -> TurbineFoundationResult:
    D = turbine.rotor_diameter_m
    MW = turbine.rated_power_kw / 1000.0
    notes = []

    if ftype == FoundationType.MONOPILE:
        p = cost_params["monopile"]
        mass = p["mass_coeff"] * (D ** p["mass_diameter_exp"]) * (depth_m ** p["mass_depth_exp"])
        supply = mass * p["steel_price_usd_tonne"] / 1e6
        install_days = p["base_install_days"] + p["depth_install_factor"] * depth_m
        install = install_days * p["installation_day_rate_usd"] / 1e6
        if seabed == SeabedType.ROCK:
            notes.append("Rock seabed may require rock socket / grouting")
            install *= 1.3

    elif ftype == FoundationType.JACKET:
        p = cost_params["jacket"]
        mass = p["mass_coeff"] * (D ** p["mass_diameter_exp"]) * (depth_m ** p["mass_depth_exp"])
        supply = mass * p["steel_price_usd_tonne"] / 1e6
        install = p["installation_cost_musd"]

    elif ftype == FoundationType.FLOATING_SEMI_SUB:
        p = cost_params["floating_semi_sub"]
        supply = p["base_cost_musd"] + p["power_coeff_musd_mw2"] * MW ** 2
        mooring = p["mooring_base_musd"] + p["mooring_depth_coeff"] * depth_m
        supply += mooring
        install = p["installation_musd"]
        mass = supply * 200  # approximate
        notes.append("Floating: mooring included in supply cost")

    else:  # FLOATING_SPAR
        p = cost_params["floating_spar"]
        supply = p["base_cost_musd"] + p["power_coeff_musd_mw2"] * MW ** 2
        mooring = p["mooring_base_musd"] + p["mooring_depth_coeff"] * depth_m
        supply += mooring
        install = p["installation_musd"]
        mass = supply * 200
        notes.append("Spar: requires deep water (>100m for dry-dock)")

    total = supply + install
    return TurbineFoundationResult(
        turbine_id="",  # filled by caller
        water_depth_m=depth_m,
        seabed_type=seabed,
        foundation_type=ftype,
        steel_mass_tonnes=float(mass) if ftype in (FoundationType.MONOPILE, FoundationType.JACKET) else 0.0,
        supply_cost_musd=float(supply),
        installation_cost_musd=float(install),
        total_cost_musd=float(total),
        design_notes=notes,
    )


def assess_foundations(
    turbines: List[TurbinePosition],
    turbine_spec: TurbineSpec,
    default_depth: float,
    default_seabed: SeabedType,
    depth_overrides: dict,
) -> FoundationSummary:
    with open(_DATA_PATH) as f:
        cost_params = json.load(f)

    results = []
    type_dist: dict = {}
    cost_by_type: dict = {}

    for t in turbines:
        depth = depth_overrides.get(t.id, default_depth)
        ftype = select_foundation_type(depth, default_seabed)
        result = compute_foundation_cost(turbine_spec, depth, default_seabed, ftype, cost_params)
        result.turbine_id = t.id
        results.append(result)

        fname = ftype.value
        type_dist[fname] = type_dist.get(fname, 0) + 1
        cost_by_type[fname] = cost_by_type.get(fname, 0.0) + result.total_cost_musd

    total = sum(r.total_cost_musd for r in results)
    return FoundationSummary(
        per_turbine=results,
        type_distribution=type_dist,
        total_cost_musd=total,
        average_cost_musd_per_turbine=total / len(results) if results else 0.0,
        cost_by_type=cost_by_type,
    )

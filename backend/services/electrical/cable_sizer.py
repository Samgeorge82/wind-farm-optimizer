from __future__ import annotations
import json, math
from pathlib import Path
from typing import List, Dict
from models.electrical import CableSpec, CableSegment
import numpy as np

_DATA_PATH = Path(__file__).parent.parent.parent / "data" / "cable_specs.json"

def load_cable_specs(voltage_kv: float) -> List[CableSpec]:
    with open(_DATA_PATH) as f:
        data = json.load(f)
    key = "33kV" if voltage_kv <= 40 else "66kV"
    return [CableSpec(**s) for s in data["array_cables"][key]]


def select_cable(current_design_amps: float, specs: List[CableSpec]) -> CableSpec:
    """Select the smallest cable that can carry current_design_amps."""
    for spec in sorted(specs, key=lambda s: s.cross_section_mm2):
        if spec.current_rating_amps >= current_design_amps:
            return spec
    return specs[-1]  # Return largest if current exceeds all ratings


def size_segment(
    from_id: str,
    to_id: str,
    from_pos: np.ndarray,  # (2,) local Cartesian
    to_pos: np.ndarray,
    n_turbines_downstream: int,
    turbine_rated_kw: float,
    array_voltage_kv: float,
    cable_specs: List[CableSpec],
    power_factor: float = 0.95,
    diversity_factor: float = 0.90,
) -> CableSegment:
    length_m = float(np.linalg.norm(to_pos - from_pos))
    power_kw = n_turbines_downstream * turbine_rated_kw
    current_amps = (power_kw * 1000) / (math.sqrt(3) * array_voltage_kv * 1000 * power_factor)
    current_design = current_amps * diversity_factor

    spec = select_cable(current_design, cable_specs)
    length_km = length_m / 1000.0
    losses_kw = 3.0 * current_design ** 2 * spec.resistance_ohm_km * length_km / 1000.0
    cost_usd = spec.cost_usd_km * length_km

    return CableSegment(
        segment_id=f"{from_id}_{to_id}",
        from_id=from_id,
        to_id=to_id,
        length_m=length_m,
        cable_spec=spec,
        current_amps=current_design,
        losses_kw=losses_kw,
        cost_usd=cost_usd,
        route_coords=[from_pos.tolist(), to_pos.tolist()],
    )

import numpy as np
from fastapi import APIRouter, HTTPException
from models.electrical import ElectricalNetwork, ElectricalRequest, StringConfig, CableSegment
from services.electrical.string_builder import build_strings, get_segment_pairs
from services.electrical.cable_sizer import load_cable_specs, size_segment
from services.electrical.oss_optimizer import optimize_oss_position, build_oss_config
from services.electrical.export_cable import select_export_cable
from services.layout.boundary import CoordinateTransformer

router = APIRouter()


@router.post("/build", response_model=ElectricalNetwork)
def build_electrical_network(req: ElectricalRequest):
    transformer = CoordinateTransformer.from_boundary(req.boundary)
    boundary_poly = transformer.boundary_to_shapely(req.boundary)

    positions = np.array([
        transformer.geo_to_local(t.lat, t.lng) for t in req.turbines
    ])
    turbine_ids = [t.id for t in req.turbines]
    installed_mw = len(req.turbines) * req.turbine_spec.rated_power_kw / 1000.0

    # Optimize OSS position
    oss_local = optimize_oss_position(positions, boundary_poly, installed_mw)
    oss_lat, oss_lng = transformer.local_to_geo(oss_local[0], oss_local[1])
    oss = build_oss_config(oss_local, installed_mw, {}, oss_lat, oss_lng)

    # Build strings
    strings_ids = build_strings(turbine_ids, positions, oss_local, req.max_turbines_per_string)
    cable_specs = load_cable_specs(req.array_voltage_kv)

    pos_map = {t.id: np.array(transformer.geo_to_local(t.lat, t.lng)) for t in req.turbines}

    string_configs = []
    total_array_km = 0.0
    total_cable_cost = 0.0
    total_losses_kw = 0.0

    # Build geo lookup: turbine_id -> (lat, lng)
    geo_map = {t.id: (t.lat, t.lng) for t in req.turbines}

    for s_idx, string in enumerate(strings_ids):
        pairs = get_segment_pairs(string)
        segments = []
        total_string_length = 0.0
        total_string_losses = 0.0
        total_string_cost = 0.0
        peak_current = 0.0
        n_downstream = len(string)

        for from_id, to_id in pairs:
            from_pos = pos_map[from_id]
            to_pos = oss_local if to_id == "OSS" else pos_map[to_id]
            seg = size_segment(
                from_id, to_id, from_pos, to_pos,
                n_downstream,
                req.turbine_spec.rated_power_kw,
                req.array_voltage_kv,
                cable_specs,
            )
            # Convert route_coords from local Cartesian to [lng, lat] for map rendering
            from_geo = geo_map.get(from_id, (oss_lat, oss_lng))
            to_geo = (oss_lat, oss_lng) if to_id == "OSS" else geo_map.get(to_id, (oss_lat, oss_lng))
            seg.route_coords = [
                [from_geo[1], from_geo[0]],  # [lng, lat]
                [to_geo[1], to_geo[0]],
            ]
            segments.append(seg)
            total_string_length += seg.length_m
            total_string_losses += seg.losses_kw
            total_string_cost += seg.cost_usd
            peak_current = max(peak_current, seg.current_amps)
            n_downstream -= 1  # one fewer turbine downstream of next segment

        string_configs.append(StringConfig(
            string_id=f"S{s_idx + 1:02d}",
            turbine_ids=string,
            segments=segments,
            total_length_m=total_string_length,
            total_losses_kw=total_string_losses,
            total_cost_usd=total_string_cost,
            peak_current_amps=peak_current,
        ))
        total_array_km += total_string_length / 1000.0
        total_cable_cost += total_string_cost
        total_losses_kw += total_string_losses

    # Export cable
    export = select_export_cable(req.distance_to_shore_km, installed_mw)

    total_cable_cost_musd = (total_cable_cost + oss.total_cost_musd * 1e6) / 1e6 + export.total_cost_musd
    total_losses_mw = total_losses_kw / 1000.0 + export.losses_mw
    array_losses_pct = total_losses_mw / installed_mw * 100 if installed_mw > 0 else 0.0

    return ElectricalNetwork(
        strings=string_configs,
        oss=oss,
        export_cable=export,
        array_voltage_kv=req.array_voltage_kv,
        total_array_losses_pct=array_losses_pct,
        total_cable_cost_musd=total_cable_cost_musd,
        total_electrical_losses_mw=total_losses_mw,
        array_cable_total_km=total_array_km,
    )

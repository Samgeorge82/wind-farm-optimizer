from __future__ import annotations
import numpy as np
from scipy.optimize import minimize
from shapely.geometry import Polygon, Point
from models.electrical import OSSConfig


def optimize_oss_position(
    turbine_positions: np.ndarray,  # (N, 2)
    boundary: Polygon,
    installed_mw: float,
    array_voltage_kv: float = 33.0,
) -> np.ndarray:
    """
    Minimize sum of distances from turbines to OSS.
    Initial guess: centroid of turbine positions.
    Constraint: OSS must be inside boundary.
    """
    centroid = np.mean(turbine_positions, axis=0)
    initial = centroid.copy()

    def objective(pos):
        return float(np.sum(np.linalg.norm(turbine_positions - pos, axis=1)))

    minx, miny, maxx, maxy = boundary.bounds
    bounds = [(minx, maxx), (miny, maxy)]

    result = minimize(
        objective, initial, method="L-BFGS-B", bounds=bounds
    )
    oss_pos = result.x

    # Project to boundary interior if outside
    if not boundary.contains(Point(oss_pos[0], oss_pos[1])):
        from shapely.ops import nearest_points
        nearest = nearest_points(boundary, Point(oss_pos[0], oss_pos[1]))[0]
        oss_pos = np.array([nearest.x, nearest.y])
        # Move slightly inward
        interior = boundary.buffer(-10.0)
        if not interior.is_empty:
            cen = np.array([interior.centroid.x, interior.centroid.y])
            oss_pos = oss_pos + 0.1 * (cen - oss_pos)

    return oss_pos


def build_oss_config(
    oss_pos: np.ndarray,
    installed_mw: float,
    transformer: dict,  # {"mva": 250, "num": 2}
    lat: float,
    lng: float,
) -> OSSConfig:
    mva = transformer.get("mva", max(250.0, installed_mw * 1.1))
    num_t = transformer.get("num", 2)
    platform_cost = 40.0 + installed_mw * 0.08  # MUSD rough estimate
    transformer_cost = num_t * 15.0              # MUSD per transformer
    return OSSConfig(
        lat=lat,
        lng=lng,
        x=float(oss_pos[0]),
        y=float(oss_pos[1]),
        transformer_mva=mva,
        num_transformers=num_t,
        platform_cost_musd=platform_cost,
        transformer_cost_musd=transformer_cost,
        total_cost_musd=platform_cost + transformer_cost,
    )

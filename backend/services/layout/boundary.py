from __future__ import annotations
import numpy as np
from shapely.geometry import Polygon, Point, MultiPoint
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.layout import BoundaryPolygon, GeoPoint

R_EARTH = 6_371_000.0  # meters


class CoordinateTransformer:
    """
    Flat-Earth projection: WGS84 ↔ local Cartesian (x=East, y=North) in meters.
    Valid for sites < ~200 km across.
    """

    def __init__(self, origin_lat: float, origin_lng: float):
        self.origin_lat = origin_lat
        self.origin_lng = origin_lng
        self.m_per_deg_lat = np.radians(1.0) * R_EARTH
        self.m_per_deg_lng = np.radians(1.0) * R_EARTH * np.cos(np.radians(origin_lat))

    @classmethod
    def from_boundary(cls, boundary: BoundaryPolygon) -> CoordinateTransformer:
        lats = [p.lat for p in boundary.coordinates]
        lngs = [p.lng for p in boundary.coordinates]
        return cls(float(np.mean(lats)), float(np.mean(lngs)))

    def geo_to_local(self, lat: float, lng: float) -> tuple[float, float]:
        x = (lng - self.origin_lng) * self.m_per_deg_lng
        y = (lat - self.origin_lat) * self.m_per_deg_lat
        return x, y

    def local_to_geo(self, x: float, y: float) -> tuple[float, float]:
        lat = y / self.m_per_deg_lat + self.origin_lat
        lng = x / self.m_per_deg_lng + self.origin_lng
        return lat, lng

    def boundary_to_shapely(self, boundary: BoundaryPolygon) -> Polygon:
        coords = [self.geo_to_local(p.lat, p.lng) for p in boundary.coordinates]
        return Polygon(coords)


def generate_staggered_layout(
    poly: Polygon, n_turbines: int, spacing_m: float
) -> np.ndarray:
    """
    Place turbines in a staggered (offset row) grid inside polygon,
    centered on the polygon centroid for better initial distribution.
    Returns array of shape (M, 2) where M <= n_turbines.
    """
    minx, miny, maxx, maxy = poly.bounds
    cx, cy = poly.centroid.x, poly.centroid.y
    row_spacing = spacing_m * np.sqrt(3) / 2.0

    # Estimate how many rows/cols we need (oversize a bit)
    est_cols = int(np.ceil((maxx - minx) / spacing_m)) + 2
    est_rows = int(np.ceil((maxy - miny) / row_spacing)) + 2

    # Center the grid on the polygon centroid
    grid_width = est_cols * spacing_m
    grid_height = est_rows * row_spacing
    start_x = cx - grid_width / 2.0
    start_y = cy - grid_height / 2.0

    # Generate all candidate positions inside the polygon
    candidates = []
    for row_idx in range(est_rows):
        x_offset = (spacing_m / 2.0) if row_idx % 2 == 1 else 0.0
        y = start_y + row_idx * row_spacing
        for col_idx in range(est_cols):
            x = start_x + col_idx * spacing_m + x_offset
            if poly.contains(Point(x, y)):
                candidates.append([x, y])

    if not candidates:
        return np.empty((0, 2))

    candidates = np.array(candidates)

    # Sort by distance from centroid so we fill from the center outward
    dists = np.sqrt((candidates[:, 0] - cx) ** 2 + (candidates[:, 1] - cy) ** 2)
    order = np.argsort(dists)
    candidates = candidates[order]

    return candidates[:n_turbines]


def check_spacing_violations(positions: np.ndarray, min_spacing: float) -> list[tuple[int, int, float]]:
    """Return list of (i, j, distance) for pairs below minimum spacing."""
    violations = []
    n = len(positions)
    for i in range(n):
        for j in range(i + 1, n):
            d = float(np.linalg.norm(positions[i] - positions[j]))
            if d < min_spacing:
                violations.append((i, j, d))
    return violations

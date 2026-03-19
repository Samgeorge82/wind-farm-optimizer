from abc import ABC, abstractmethod
from dataclasses import dataclass
import numpy as np


@dataclass
class WakeInput:
    """Cartesian turbine positions and inflow conditions."""
    x: np.ndarray        # Local East (m), shape (N,)
    y: np.ndarray        # Local North (m), shape (N,)
    freestream_speed: float
    wind_direction_deg: float  # Meteorological: direction wind COMES FROM (0=N, 90=E)
    rotor_diameter: float
    ct: float            # Thrust coefficient at freestream speed


class WakeModel(ABC):
    @abstractmethod
    def compute_effective_speeds(self, inp: WakeInput) -> np.ndarray:
        """Return effective wind speed at each turbine hub (m/s)."""

    def _rotate_to_wind_frame(
        self, x: np.ndarray, y: np.ndarray, wind_dir_deg: float
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Rotate coordinates so +x_rot points downwind.
        Met convention: wind_dir = direction wind COMES FROM.
        270 (westerly wind) → wind blows toward east → +x_rot = east.
        """
        angle_rad = np.radians(270.0 - wind_dir_deg)
        x_rot = x * np.cos(angle_rad) - y * np.sin(angle_rad)
        y_rot = x * np.sin(angle_rad) + y * np.cos(angle_rad)
        return x_rot, y_rot

import numpy as np
from .base import WakeModel, WakeInput


class GaussianWakeModel(WakeModel):
    """
    Bastankhah & Porte-Agel (2014) Gaussian wake model.

    Wake deficit at (x, y) downwind of turbine i:
      C(x) = 1 - sqrt(1 - Ct / (8 * (σ/D)²))
      Δu/u0 = C(x) * exp(-0.5 * (y/σ)²)

    Wake width: σ(x) = σ0 + k* × x
    Initial width: σ0 = ε × D / sqrt(8)

    Superposition: linear (sum of deficits).

    Reference: Bastankhah & Porte-Agel, Renewable Energy 70 (2014) 116-123
    """

    def __init__(self, k_star: float = 0.04, epsilon: float = 0.20):
        self.k_star = k_star
        self.epsilon = epsilon

    def compute_effective_speeds(self, inp: WakeInput) -> np.ndarray:
        n = len(inp.x)
        x_rot, y_rot = self._rotate_to_wind_frame(inp.x, inp.y, inp.wind_direction_deg)
        D = inp.rotor_diameter
        sigma0 = self.epsilon * D / np.sqrt(8.0)
        deficits = np.zeros(n)

        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                dx = x_rot[j] - x_rot[i]
                if dx <= 0.5 * D:
                    continue
                dy = y_rot[j] - y_rot[i]
                sigma = sigma0 + self.k_star * dx
                ct_eff = np.clip(inp.ct, 0.0, 1.0)
                radicand = 1.0 - ct_eff / (8.0 * (sigma / D) ** 2)
                C = 1.0 - np.sqrt(max(0.0, radicand))
                deficit = C * np.exp(-0.5 * (dy / sigma) ** 2)
                deficits[j] += deficit  # linear superposition

        combined = np.clip(deficits, 0.0, 0.999)
        return inp.freestream_speed * (1.0 - combined)

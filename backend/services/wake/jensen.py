import numpy as np
from .base import WakeModel, WakeInput


class JensenWakeModel(WakeModel):
    """
    Jensen (Park) top-hat wake model with circle-circle rotor overlap.

    Speed deficit at turbine j from turbine i:
      Δu/u0 = (1 - sqrt(1 - Ct)) × (D / (D + 2k·dx))²  × overlap_fraction

    Superposition: Root Sum of Squares (RSS).

    Reference: Jensen (1983) "A note on wind generator interaction"
    """

    def __init__(self, wake_decay_k: float = 0.04):
        self.k = wake_decay_k  # 0.04 offshore, 0.06 onshore

    def compute_effective_speeds(self, inp: WakeInput) -> np.ndarray:
        n = len(inp.x)
        x_rot, y_rot = self._rotate_to_wind_frame(inp.x, inp.y, inp.wind_direction_deg)
        r0 = inp.rotor_diameter / 2.0
        deficits_sq = np.zeros(n)

        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                dx = x_rot[j] - x_rot[i]
                if dx <= 0.0:
                    continue  # j is upwind of i
                dy = abs(y_rot[j] - y_rot[i])
                wake_radius = r0 + self.k * dx
                if dy >= wake_radius + r0:
                    continue  # fully outside wake

                overlap = self._rotor_overlap(dy, r0, wake_radius)
                if overlap <= 0:
                    continue

                deficit = (
                    (1.0 - np.sqrt(max(0.0, 1.0 - inp.ct)))
                    * (inp.rotor_diameter / (inp.rotor_diameter + 2.0 * self.k * dx)) ** 2
                    * overlap
                )
                deficits_sq[j] += deficit ** 2

        combined = np.sqrt(deficits_sq)
        return np.clip(inp.freestream_speed * (1.0 - combined), 0.0, inp.freestream_speed)

    @staticmethod
    def _rotor_overlap(d: float, r1: float, r2: float) -> float:
        """
        Fraction of rotor disc (radius r1) overlapped by wake disc (radius r2)
        at lateral separation d.
        """
        if d >= r1 + r2:
            return 0.0
        if d + r1 <= r2:
            return 1.0
        if d + r2 <= r1:
            # Wake is smaller than rotor and fully inside
            return (r2 / r1) ** 2

        # Partial overlap: two-circle intersection area
        d_safe = max(d, 1e-9)
        cos_a1 = np.clip((d_safe ** 2 + r1 ** 2 - r2 ** 2) / (2 * d_safe * r1), -1, 1)
        cos_a2 = np.clip((d_safe ** 2 + r2 ** 2 - r1 ** 2) / (2 * d_safe * r2), -1, 1)
        a1 = np.arccos(cos_a1)
        a2 = np.arccos(cos_a2)
        overlap_area = (
            r1 ** 2 * (a1 - np.sin(2 * a1) / 2)
            + r2 ** 2 * (a2 - np.sin(2 * a2) / 2)
        )
        rotor_area = np.pi * r1 ** 2
        return max(0.0, min(1.0, overlap_area / rotor_area))

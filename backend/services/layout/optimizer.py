from __future__ import annotations
import numpy as np
from scipy.optimize import minimize, differential_evolution
from shapely.geometry import Polygon, Point
from shapely.prepared import prep
from typing import Callable, Optional
import time

from services.layout.boundary import generate_staggered_layout, check_spacing_violations


class LayoutOptimizer:
    """
    Co-optimizes turbine layout and (optionally) OSS position.

    Decision vector:
      - Turbine-only mode:  [t_x1, t_y1, ..., t_xN, t_yN]  (2N vars)
      - Joint mode:         [t_x1, t_y1, ..., t_xN, t_yN, oss_x, oss_y]  (2N+2 vars)

    Strategy:
      - COBYLA multi-start: 3 starts (staggered, perturbed, random), fast local optimizer
      - DE: small population, few generations, seeded with good initial layouts
      - Both keep penalty checks fast using prepared geometries
    """

    def __init__(
        self,
        obj_fn: Callable,
        boundary: Polygon,
        n_turbines: int,
        min_spacing_m: float,
        rotor_diameter: float,
        maximize: bool = True,
        penalty_weight: float = 1e4,
        progress_cb: Optional[Callable[[float, str], None]] = None,
        obj_label: str = "AEP",
        obj_unit: str = "GWh",
        include_oss: bool = False,
    ):
        self.obj_fn = obj_fn
        self.boundary = boundary
        self.n = n_turbines
        self.min_spacing = min_spacing_m
        self.D = rotor_diameter
        self.maximize = maximize
        self.lam = penalty_weight
        self.progress_cb = progress_cb
        self.obj_label = obj_label
        self.obj_unit = obj_unit
        self.include_oss = include_oss
        self.iteration = 0
        self.best_obj = -np.inf if maximize else np.inf
        self.best_flat: Optional[np.ndarray] = None
        self._cancelled = False
        self._t0 = 0.0
        minx, miny, maxx, maxy = boundary.bounds
        self.bounds_tuple = (minx, miny, maxx, maxy)
        self.bounds = [(minx, maxx), (miny, maxy)] * n_turbines
        if include_oss:
            self.bounds += [(minx, maxx), (miny, maxy)]
        self.site_length = np.sqrt((maxx - minx) ** 2 + (maxy - miny) ** 2)

        # Pre-compute buffered boundary and prepare for fast contains checks
        self._inner = boundary.buffer(-rotor_diameter * 0.5)
        if self._inner.is_empty:
            self._inner = boundary
        self._prep_inner = prep(self._inner)
        self._prep_boundary = prep(boundary)

    @property
    def n_vars(self) -> int:
        return 2 * self.n + (2 if self.include_oss else 0)

    def cancel(self):
        self._cancelled = True

    def _split_flat(self, flat: np.ndarray):
        turbine_positions = flat[:2 * self.n].reshape(self.n, 2)
        if self.include_oss:
            oss_position = flat[2 * self.n:2 * self.n + 2]
            return turbine_positions, oss_position
        return turbine_positions, None

    def _penalty(self, turbine_positions: np.ndarray, oss_position: Optional[np.ndarray] = None) -> float:
        """Fast constraint violation penalty using prepared geometries."""
        # Vectorized spacing violation
        sp_viol = 0.0
        if self.n > 1:
            diffs = turbine_positions[:, np.newaxis, :] - turbine_positions[np.newaxis, :, :]
            dists_sq = np.sum(diffs ** 2, axis=-1)
            i_upper, j_upper = np.triu_indices(self.n, k=1)
            pair_dists_sq = dists_sq[i_upper, j_upper]
            min_sq = self.min_spacing ** 2
            violations_mask = pair_dists_sq < min_sq
            if np.any(violations_mask):
                pair_dists = np.sqrt(pair_dists_sq[violations_mask])
                gaps = (self.min_spacing - pair_dists) / self.min_spacing
                sp_viol = float(np.sum(gaps ** 2))

        # Boundary violation using prepared geometry (much faster)
        bnd_viol = 0.0
        for pos in turbine_positions:
            pt = Point(pos[0], pos[1])
            if not self._prep_inner.contains(pt):
                dist_outside = self._inner.exterior.distance(pt)
                bnd_viol += (dist_outside / self.D) ** 2

        if oss_position is not None:
            pt = Point(oss_position[0], oss_position[1])
            if not self._prep_boundary.contains(pt):
                dist_outside = self.boundary.exterior.distance(pt)
                bnd_viol += (dist_outside / self.D) ** 2 * 2.0

        return self.lam * (sp_viol + bnd_viol)

    def _is_better(self, val: float) -> bool:
        if self.maximize:
            return val > self.best_obj
        return val < self.best_obj

    def _objective(self, flat: np.ndarray) -> float:
        if self._cancelled:
            raise InterruptedError("Cancelled")

        turbine_positions, oss_position = self._split_flat(flat)

        # Quick penalty check — skip expensive obj_fn if layout is wildly infeasible
        pen = self._penalty(turbine_positions, oss_position)
        if pen > self.lam * 5.0:
            # Very infeasible — return huge cost without calling AEP
            self.iteration += 1
            sign = -1.0 if self.maximize else 1.0
            dummy_obj = 0.0 if self.maximize else 9999.0
            return sign * dummy_obj + pen

        # Call objective function
        if self.include_oss:
            obj_val = self.obj_fn(turbine_positions, oss_position)
        else:
            obj_val = self.obj_fn(turbine_positions)

        sign = -1.0 if self.maximize else 1.0
        cost = sign * obj_val + pen

        self.iteration += 1

        # Track best (only if constraints are reasonably satisfied)
        if self._is_better(obj_val) and pen < self.lam * 0.01:
            self.best_obj = obj_val
            self.best_flat = flat.copy()

        if self.progress_cb and self.iteration % 10 == 0:
            elapsed = time.time() - self._t0
            best_display = self.best_obj
            if self.maximize and best_display == -np.inf:
                best_display = obj_val
            elif not self.maximize and best_display == np.inf:
                best_display = obj_val
            self.progress_cb(
                min(88.0, 15.0 + self.iteration / 4.0),
                f"Eval {self.iteration} | Best {self.obj_label}: {best_display:.3f} {self.obj_unit} | {elapsed:.0f}s"
            )
        return cost

    def _perturb_layout(self, positions: np.ndarray, scale: float, rng: np.random.Generator) -> np.ndarray:
        """Add random jitter to positions while trying to stay inside boundary."""
        perturbed = positions + rng.normal(0, scale, positions.shape)
        cx, cy = self.boundary.centroid.x, self.boundary.centroid.y

        for i in range(len(perturbed)):
            pt = Point(perturbed[i, 0], perturbed[i, 1])
            if not self._prep_inner.contains(pt):
                perturbed[i, 0] = perturbed[i, 0] * 0.3 + cx * 0.7
                perturbed[i, 1] = perturbed[i, 1] * 0.3 + cy * 0.7

        return perturbed

    def _generate_random_layout(self, rng: np.random.Generator) -> np.ndarray:
        """Generate a random feasible layout by sampling inside the boundary."""
        minx, miny, maxx, maxy = self.bounds_tuple
        positions = []
        attempts = 0
        max_attempts = self.n * 200

        while len(positions) < self.n and attempts < max_attempts:
            x = rng.uniform(minx, maxx)
            y = rng.uniform(miny, maxy)
            pt = Point(x, y)
            if self._prep_inner.contains(pt):
                ok = True
                for p in positions:
                    if (p[0] - x) ** 2 + (p[1] - y) ** 2 < self.min_spacing ** 2:
                        ok = False
                        break
                if ok:
                    positions.append([x, y])
            attempts += 1

        if len(positions) < self.n:
            return generate_staggered_layout(self.boundary, self.n, self.min_spacing)

        return np.array(positions)

    def optimize(
        self,
        initial_positions: np.ndarray,
        method: str = "cobyla",
        max_iterations: int = 300,
        initial_oss: Optional[np.ndarray] = None,
    ) -> tuple[np.ndarray, Optional[np.ndarray]]:
        """
        Run optimization.

        COBYLA: 3 multi-start runs for global coverage (fast, ~1-3 min).
        DE: small population + few generations (moderate, ~3-8 min).

        Returns: (turbine_positions, oss_position)
        """
        self._t0 = time.time()
        self.iteration = 0

        # Build initial flat vector
        x0_parts = [initial_positions.flatten()]
        if self.include_oss:
            if initial_oss is None:
                initial_oss = np.mean(initial_positions, axis=0)
            x0_parts.append(initial_oss.flatten())
        x0 = np.concatenate(x0_parts)

        # Compute initial best
        t_pos, o_pos = self._split_flat(x0)
        if self.include_oss:
            self.best_obj = self.obj_fn(t_pos, o_pos)
        else:
            self.best_obj = self.obj_fn(t_pos)
        self.best_flat = x0.copy()

        if method == "cobyla":
            # Multi-start COBYLA — 3 starts, each with max_iterations/3
            rhobeg = max(self.D * 2, self.site_length * 0.05)
            iters_per_start = max(max_iterations // 3, 50)
            rng = np.random.default_rng(42)

            # Start 1: centered staggered layout
            if self.progress_cb:
                self.progress_cb(18.0, "COBYLA 1/3: staggered layout")
            minimize(
                self._objective, x0, method="COBYLA",
                options={"maxiter": iters_per_start, "rhobeg": rhobeg, "catol": 1e-4}
            )

            # Start 2: perturbed layout
            if self.progress_cb:
                self.progress_cb(40.0, "COBYLA 2/3: perturbed layout")
            perturbed = self._perturb_layout(initial_positions.copy(), self.D * 1.5, rng)
            x0_p = perturbed.flatten()
            if self.include_oss:
                x0_p = np.concatenate([x0_p, initial_oss.flatten()])
            minimize(
                self._objective, x0_p, method="COBYLA",
                options={"maxiter": iters_per_start, "rhobeg": rhobeg, "catol": 1e-4}
            )

            # Start 3: random feasible layout
            if self.progress_cb:
                self.progress_cb(62.0, "COBYLA 3/3: random layout")
            random_layout = self._generate_random_layout(rng)
            x0_r = random_layout[:self.n].flatten()
            if self.include_oss:
                oss_rand = np.mean(random_layout[:self.n], axis=0)
                x0_r = np.concatenate([x0_r, oss_rand.flatten()])
            minimize(
                self._objective, x0_r, method="COBYLA",
                options={"maxiter": iters_per_start, "rhobeg": rhobeg, "catol": 1e-4}
            )

        elif method in ("differential_evolution", "de"):
            # Small, fast DE — population of 10, max 30 generations
            # Total evals ≈ 10 * 30 = 300 (manageable)
            pop_size = 10
            de_maxiter = min(max_iterations, 30)

            if self.progress_cb:
                self.progress_cb(18.0, f"DE: pop={pop_size}, maxiter={de_maxiter}")

            init_pop = self._build_de_init_population(
                initial_positions, initial_oss, pop_size
            )

            result = differential_evolution(
                self._objective, self.bounds,
                maxiter=de_maxiter,
                seed=42, tol=0.01, workers=1,
                init=init_pop,
                mutation=(0.5, 1.0),
                recombination=0.7,
            )
        else:
            pass  # grid/staggered — no optimization

        # Return best tracked solution
        if self.best_flat is not None:
            t_final, o_final = self._split_flat(self.best_flat)
        else:
            t_final, o_final = self._split_flat(x0)

        return t_final, o_final

    def _build_de_init_population(
        self, initial_positions: np.ndarray,
        initial_oss: Optional[np.ndarray],
        pop_target: int,
    ) -> np.ndarray:
        """Build initial population for DE with good seed layouts."""
        rng = np.random.default_rng(42)
        n_vars = self.n_vars
        members = []

        def _layout_to_flat(positions: np.ndarray, oss: Optional[np.ndarray] = None) -> np.ndarray:
            flat = positions[:self.n].flatten()
            if self.include_oss:
                o = oss if oss is not None else np.mean(positions[:self.n], axis=0)
                flat = np.concatenate([flat, o.flatten()])
            return flat

        # Member 1: centered staggered layout
        oss0 = initial_oss if initial_oss is not None else np.mean(initial_positions, axis=0)
        members.append(_layout_to_flat(initial_positions, oss0))

        # Fill with mix of perturbed + random
        for i in range(pop_target - 1):
            if i % 3 == 0:
                pert = self._perturb_layout(
                    initial_positions.copy(), self.D * (1.0 + rng.uniform(0, 2)), rng
                )
                flat = _layout_to_flat(pert)
            else:
                rand_layout = self._generate_random_layout(rng)
                flat = _layout_to_flat(rand_layout)

            if len(flat) == n_vars:
                members.append(flat)

        while len(members) < pop_target:
            rand_layout = self._generate_random_layout(rng)
            flat = _layout_to_flat(rand_layout)
            if len(flat) == n_vars:
                members.append(flat)

        pop = np.array(members[:pop_target])

        # Clip to bounds
        for i, (lo, hi) in enumerate(self.bounds):
            pop[:, i] = np.clip(pop[:, i], lo, hi)

        return pop

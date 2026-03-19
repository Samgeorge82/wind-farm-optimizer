from __future__ import annotations
import numpy as np
from typing import List, Tuple
import math


def build_strings(
    turbine_ids: List[str],
    positions: np.ndarray,   # (N, 2) local Cartesian
    oss_position: np.ndarray,  # (2,) local Cartesian
    max_turbines_per_string: int = 8,
) -> List[List[str]]:
    """
    OSS-rooted tree string assembly using Prim's MST.

    Algorithm:
    1. Build a minimum spanning tree rooted at the OSS that connects all turbines
    2. The OSS is the root; each branch from the OSS becomes a string
    3. If a branch has more turbines than max_turbines_per_string, split at
       the deepest nodes first
    4. Each string is ordered tip (farthest) -> root (nearest to OSS)

    This naturally produces non-crossing cables because an MST on 2D points
    is always planar (no crossings).

    Returns list of strings, each string is ordered list of turbine IDs
    (index 0 = farthest from OSS, last = nearest to OSS).
    """
    n = len(turbine_ids)
    if n == 0:
        return []
    if n == 1:
        return [[turbine_ids[0]]]

    # Build all-points array: OSS at index 0, turbines at 1..n
    all_pos = np.vstack([oss_position.reshape(1, 2), positions])  # (n+1, 2)
    n_all = n + 1

    # Prim's MST starting from OSS (index 0)
    in_tree = np.zeros(n_all, dtype=bool)
    in_tree[0] = True
    parent = np.full(n_all, -1, dtype=int)
    min_edge = np.full(n_all, np.inf)

    # Initial distances from OSS
    for i in range(1, n_all):
        min_edge[i] = float(np.linalg.norm(all_pos[i] - all_pos[0]))

    for _ in range(n):
        # Pick closest non-tree node
        candidates = np.where(~in_tree)[0]
        u = candidates[np.argmin(min_edge[candidates])]
        in_tree[u] = True

        # Update edges
        for v in range(1, n_all):
            if not in_tree[v]:
                d = float(np.linalg.norm(all_pos[u] - all_pos[v]))
                if d < min_edge[v]:
                    min_edge[v] = d
                    parent[v] = u

    # Build adjacency list (tree rooted at OSS=0)
    children: dict[int, list[int]] = {i: [] for i in range(n_all)}
    for i in range(1, n_all):
        p = parent[i] if parent[i] >= 0 else 0
        children[p].append(i)

    # Extract branches from OSS: each direct child of OSS starts a branch
    # Traverse depth-first to collect the full branch as a path
    def collect_branch(node: int) -> List[int]:
        """Collect turbine indices in a branch via DFS (deepest first)."""
        result = []
        for child in children[node]:
            result.extend(collect_branch(child))
        if node != 0:  # Don't include OSS
            result.append(node)
        return result

    strings: List[List[str]] = []

    for branch_root in children[0]:
        # Collect all turbine nodes in this branch (tip-first ordering)
        branch_nodes = collect_branch(branch_root)

        # Split into chunks of max_turbines_per_string if needed
        # Each chunk maintains the depth-first tip-to-root order
        for i in range(0, len(branch_nodes), max_turbines_per_string):
            chunk = branch_nodes[i:i + max_turbines_per_string]
            # Convert from all_pos indices (1-based) to turbine indices (0-based)
            string = [turbine_ids[node_idx - 1] for node_idx in chunk]
            strings.append(string)

    return strings


def get_segment_pairs(string: List[str]) -> List[Tuple[str, str]]:
    """
    Returns ordered (from_id, to_id) pairs for a string.
    Tip turbine -> ... -> root turbine -> OSS.
    Last segment connects root turbine to OSS (to_id="OSS").
    """
    segments = []
    for i in range(len(string) - 1):
        segments.append((string[i], string[i + 1]))
    if string:
        segments.append((string[-1], "OSS"))
    return segments

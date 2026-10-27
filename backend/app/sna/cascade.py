from typing import List, Dict, Any
import numpy as np


def run_cascade_simulation(
    adjacency_reversed: Dict[int, List[Dict[str, float]]],
    follower_map: Dict[int, int],
    seed_ids: List[int],
    outreach_bridge_ids: List[int],
    steps: int = 10,
    runs: int = 200
) -> List[Dict[str, Any]]:
    """Simulates information cascade dynamics using the Independent Cascade (IC) model (F14).

    Methodology:
    1. Graph Inversion: Simulates information spread along the reversed interaction network
       (from target post authors outwards to interacting followers/amplifiers).
    2. Edge Transmission Probability:
       p = min(0.30, 0.05 + 0.25 * min(1.0, edge_weight / 1.2)).
    3. Counterfactual Scenarios:
       - 'no_response': Baseline passive propagation.
       - 'fast_response': Dampens transmission by 40% (chance *= 0.6) starting from step 2
         representing verified brand clarifications.
       - 'influencer_outreach': Immunizes top 3 community bridge nodes, cutting cross-community contagion.
    4. Monte Carlo Evaluation:
       Executes runs (default 200) using synchronized pseudo-random draws to compute expected
       cumulative activated accounts per step and aggregate public reach (followers * 0.1).
    """
    scenarios = ["no_response", "fast_response", "influencer_outreach"]
    outreach_set = set(outreach_bridge_ids)
    seeds = list(seed_ids)
    if not seeds:
        seeds = list(adjacency_reversed.keys())[:3]

    results = []

    for scenario in scenarios:
        cumulative_steps = np.zeros(steps, dtype=float)
        total_reach_sum = 0.0
        
        # Consistent random seed across runs
        rng = np.random.default_rng(seed=42)

        for _ in range(runs):
            active = set(seeds)
            frontier = list(seeds)

            for step in range(steps):
                next_frontier = []
                for u in frontier:
                    edges = adjacency_reversed.get(u, [])
                    for edge in edges:
                        v = edge["target"]
                        if v in active:
                            continue
                        if scenario == "influencer_outreach" and v in outreach_set:
                            continue

                        chance = edge["prob"]
                        if scenario == "fast_response" and step >= 2:
                            chance *= 0.6

                        if rng.random() < chance:
                            active.add(v)
                            next_frontier.append(v)

                frontier = next_frontier
                cumulative_steps[step] += len(active)

            # Sum reach
            total_reach_sum += sum((follower_map.get(node_id, 100) * 0.1) for node_id in active)

        avg_steps = [round(float(val / runs), 1) for val in cumulative_steps]
        expected_reach = round(float(total_reach_sum / runs), 1)

        results.append({
            "scenario": scenario,
            "steps": avg_steps,
            "expected_reach": expected_reach
        })

    return results

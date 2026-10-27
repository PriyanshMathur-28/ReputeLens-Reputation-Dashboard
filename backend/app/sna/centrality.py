import math
from typing import Dict, Any
import networkx as nx
import numpy as np


def minmax_scale(values: Dict[int, float]) -> Dict[int, float]:
    """Min-max normalizes a dictionary of node values to 0.0 - 1.0."""
    if not values:
        return {}
    vals = list(values.values())
    min_v = min(vals)
    max_v = max(vals)
    if max_v == min_v:
        return {k: 0.5 for k in values}
    return {k: (v - min_v) / (max_v - min_v) for k, v in values.items()}


def compute_centrality_and_influence(G: nx.DiGraph, author_engagements: Dict[int, float] = None) -> Dict[int, Dict[str, Any]]:
    """Calculates PageRank, Betweenness centrality, and Composite Influence Score (F10).

    Methodology:
    1. PageRank: Evaluates structural authority using damping factor alpha=0.85 weighted by interaction frequency.
    2. Betweenness Centrality: Identifies strategic brokers. Exact computation when n <= 500;
       approximated with k=min(200, n) samples for larger network efficiency (seed=42).
    3. Degrees: Weighted in-degree (incoming conversation pull) and out-degree (activity rate).
    4. Composite Influence Score Formula:
       raw = 0.40 * minmax(PageRank)
           + 0.30 * minmax(log1p(followers))
           + 0.20 * minmax(in_degree)
           + 0.10 * minmax(avg_engagement)
       influence_score = 100 * raw (bounded 0 to 100).
    """
    n = G.number_of_nodes()
    if n == 0:
        return {}

    # 1. PageRank
    try:
        pagerank = nx.pagerank(G, alpha=0.85, weight="weight")
    except Exception:
        pagerank = {node: 1.0 / n for node in G.nodes()}

    # 2. Betweenness
    if n <= 500:
        betweenness = nx.betweenness_centrality(G, weight="weight")
    else:
        betweenness = nx.betweenness_centrality(G, k=min(200, n), seed=42, weight="weight")

    # 3. Degrees
    in_degrees = {node: float(G.in_degree(node, weight="weight")) for node in G.nodes()}
    out_degrees = {node: float(G.out_degree(node, weight="weight")) for node in G.nodes()}

    # 4. Followers & engagement
    log_followers = {node: math.log1p(G.nodes[node].get("followers", 0)) for node in G.nodes()}
    engagements = {node: (author_engagements.get(node, 1.0) if author_engagements else 1.0) for node in G.nodes()}

    # Min-max normalize components
    norm_pr = minmax_scale(pagerank)
    norm_foll = minmax_scale(log_followers)
    norm_in = minmax_scale(in_degrees)
    norm_eng = minmax_scale(engagements)

    results = {}
    for node in G.nodes():
        raw = (
            0.40 * norm_pr.get(node, 0.0) +
            0.30 * norm_foll.get(node, 0.0) +
            0.20 * norm_in.get(node, 0.0) +
            0.10 * norm_eng.get(node, 0.0)
        )
        influence_score = round(max(0.0, min(100.0, raw * 100.0)), 1)
        results[node] = {
            "pagerank": round(pagerank.get(node, 0.0), 5),
            "betweenness": round(betweenness.get(node, 0.0), 5),
            "in_degree": int(in_degrees.get(node, 0)),
            "out_degree": int(out_degrees.get(node, 0)),
            "influence_score": influence_score
        }

    return results

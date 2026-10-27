from typing import Dict, Any, List
import networkx as nx
import numpy as np


def assign_network_roles(
    G: nx.DiGraph,
    author_profiles: Dict[int, Dict[str, Any]],
    centrality_results: Dict[int, Dict[str, Any]],
    node_to_community: Dict[int, int],
    bot_scores: Dict[int, float]
) -> Dict[int, str]:
    """Classifies network participants into behavioral roles (Section 10.4 & 10.6).

    Role Priority Hierarchy:
    1. suspected_bot: Bot likelihood >= 0.7.
    2. influencer: Top 2% by composite influence_score (minimum 3 authors).
    3. bridge: Top 2% by betweenness centrality who maintain outgoing/incoming connections
       bridging 2 or more distinct communities.
    4. amplifier: Out-degree in the top 10% of the network and high interaction ratio.
    5. regular: Default organic community member.
    """
    roles: Dict[int, str] = {}
    nodes = list(G.nodes())
    if not nodes:
        return roles

    # Thresholds
    influence_scores = [centrality_results.get(n, {}).get("influence_score", 0.0) for n in nodes]
    betweenness_scores = [centrality_results.get(n, {}).get("betweenness", 0.0) for n in nodes]
    out_degrees = [centrality_results.get(n, {}).get("out_degree", 0) for n in nodes]

    inf_threshold = np.percentile(influence_scores, 98) if len(influence_scores) > 5 else 80.0
    btw_threshold = np.percentile(betweenness_scores, 98) if len(betweenness_scores) > 5 else 0.05
    out_threshold = np.percentile(out_degrees, 90) if len(out_degrees) > 5 else 5

    # Identify bridges
    bridge_candidates = set()
    for n in nodes:
        btw = centrality_results.get(n, {}).get("betweenness", 0.0)
        if btw >= btw_threshold:
            # Check communities of neighbors
            neighbors = list(G.successors(n)) + list(G.predecessors(n))
            neighbor_communities = {node_to_community.get(nbr) for nbr in neighbors if nbr in node_to_community}
            neighbor_communities.discard(None)
            if len(neighbor_communities) >= 2:
                bridge_candidates.add(n)

    # Top influencers (guarantee at least 3)
    sorted_by_inf = sorted(nodes, key=lambda n: centrality_results.get(n, {}).get("influence_score", 0.0), reverse=True)
    influencer_nodes = set(sorted_by_inf[:max(3, int(len(nodes) * 0.02))])

    for n in nodes:
        b_score = bot_scores.get(n, 0.0)
        
        # 1. Suspected Bot
        if b_score >= 0.7:
            roles[n] = "suspected_bot"
        # 2. Influencer
        elif n in influencer_nodes or centrality_results.get(n, {}).get("influence_score", 0.0) >= inf_threshold:
            roles[n] = "influencer"
        # 3. Bridge
        elif n in bridge_candidates:
            roles[n] = "bridge"
        # 4. Amplifier
        elif centrality_results.get(n, {}).get("out_degree", 0) >= out_threshold:
            roles[n] = "amplifier"
        # 5. Regular
        else:
            roles[n] = "regular"

    return roles

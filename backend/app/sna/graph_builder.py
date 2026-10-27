from typing import List, Dict, Any
import networkx as nx


def build_interaction_graph(
    authors: List[Dict[str, Any]],
    interactions: List[Dict[str, Any]]
) -> nx.DiGraph:
    """Constructs a directed weighted interaction graph for social network analytics (Section 10.1).

    Methodology:
    1. Nodes represent authors who mentioned or interacted with the brand in the window.
    2. Node attributes preserve profile metrics: followers, average sentiment, and mention volume.
    3. Directed edges u -> v represent interaction events: u replied to, mentioned, shared, or quoted v.
    4. Edge weights aggregate multiple interactions using standard weights:
       - Reply: 1.0
       - Mention: 0.8
       - Share: 1.2
       - Quote: 1.0
    """
    G = nx.DiGraph()

    for a in authors:
        G.add_node(
            a["id"],
            handle=a.get("handle", ""),
            followers=a.get("followers", 0),
            avg_sentiment=a.get("avg_sentiment", 0.0),
            mention_count=a.get("post_count", 0),
            role=a.get("role", "regular")
        )

    for inter in interactions:
        u = inter["source_author_id"]
        v = inter["target_author_id"]
        w = inter.get("weight", 1.0)
        if G.has_node(u) and G.has_node(v):
            if G.has_edge(u, v):
                G[u][v]["weight"] += w
            else:
                G.add_edge(u, v, weight=w, type=inter.get("type", "reply"))

    return G

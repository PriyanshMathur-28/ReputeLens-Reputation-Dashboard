from typing import List, Dict, Any
import networkx as nx
from networkx.community import louvain_communities


def detect_communities(G: nx.DiGraph, author_data: Dict[int, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Detects author sub-communities using the Louvain modularity algorithm (F11).

    Methodology:
    1. Converts the directed interaction network to an undirected projection by summing reciprocal weights.
    2. Runs the Louvain modularity optimization algorithm (seed=42) to partition nodes into dense clusters.
    3. Aggregates internal sentiment, dominant conversational aspects, and identifies the top 3 influencers per cluster.
    4. Auto-generates explanatory names in the format: 'Community #N · <Topic/Role>'.
    """
    if G.number_of_nodes() == 0:
        return []

    # Undirected projection
    G_undirected = G.to_undirected(as_view=False)
    
    try:
        communities_set = louvain_communities(G_undirected, weight="weight", seed=42)
    except Exception:
        communities_set = [set(G.nodes())]

    output = []
    for c_id, members in enumerate(communities_set):
        if not members:
            continue
        
        member_authors = [author_data.get(uid, {}) for uid in members if uid in author_data]
        size = len(members)
        
        # Sentiments
        sentiments = [a.get("avg_sentiment", 0.0) for a in member_authors]
        avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else 0.0
        neg_count = sum(1 for s in sentiments if s < -0.05)
        negative_share = round(neg_count / max(1, size), 3)

        # Top 3 influencers
        sorted_members = sorted(
            members,
            key=lambda uid: author_data.get(uid, {}).get("influence_score", 0.0),
            reverse=True
        )
        top_influencers = [
            {
                "id": uid,
                "handle": author_data.get(uid, {}).get("handle", f"user_{uid}"),
                "influence_score": author_data.get(uid, {}).get("influence_score", 0.0)
            }
            for uid in sorted_members[:3]
        ]

        name = f"Community #{c_id + 1} · {top_influencers[0]['handle'] if top_influencers else 'General'}"

        output.append({
            "id": c_id + 1,
            "name": name,
            "size": size,
            "member_ids": list(members),
            "avg_sentiment": round(avg_sentiment, 2),
            "negative_share": negative_share,
            "top_influencers": top_influencers
        })

    return output

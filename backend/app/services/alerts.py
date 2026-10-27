from typing import List, Dict, Any
import datetime


def evaluate_alerts(
    brand_id: int,
    today_negative: int,
    trailing_14_negative: List[int],
    today_total: int,
    trailing_14_total: List[int],
    health_score_drop: float,
    emerging_topics: List[Dict[str, Any]],
    negative_influencer_mentions: List[Dict[str, Any]],
    coordinated_clusters: List[Dict[str, Any]],
    risk_keyword_mentions: List[Dict[str, Any]],
    event_timestamp: datetime.datetime = None
) -> List[Dict[str, Any]]:
    """Evaluates multi-vector alert criteria across 7 trigger types (Section 12, F17).

    Trigger Rules & Severity Matrix:
    1. negative_spike: z >= 2.5 on daily negative volume. (z >= 5.0 -> critical, >= 3.5 -> high, else medium).
    2. volume_spike: z >= 3.0 on total volume. (z >= 5.0 -> high, else medium).
    3. emerging_narrative: Triggered when a narrative cluster becomes emerging. (negative_share >= 0.6 -> high, else medium).
    4. influencer_negative: High-reach author sentiment <= -0.5. (followers >= 100k -> high, else medium).
    5. coordinated_activity: Coordinated bot cluster detected. (size >= 20 -> high, else medium).
    6. score_drop: Trailing 24h health score plunge >= 10 points. (drop >= 20 -> critical, else high).
    7. risk_keyword: >= 10 risk keyword mentions in 24h. (hygiene/legal risk -> high, else medium).
    """
    alerts = []
    ts = event_timestamp or datetime.datetime.utcnow()

    # 1. Negative spike
    if trailing_14_negative and len(trailing_14_negative) > 0:
        mean_neg = sum(trailing_14_negative) / len(trailing_14_negative)
        std_neg = max(1.0, float((sum((x - mean_neg)**2 for x in trailing_14_negative) / len(trailing_14_negative))**0.5))
        z_neg = (today_negative - mean_neg) / std_neg
        if z_neg >= 2.5:
            sev = "critical" if z_neg >= 5.0 else ("high" if z_neg >= 3.5 else "medium")
            alerts.append({
                "brand_id": brand_id,
                "type": "negative_spike",
                "severity": sev,
                "title": f"Negative conversation surged ({z_neg:.1f}σ)",
                "description": f"Negative mentions ({today_negative}) exceeded the 14-day statistical baseline ({mean_neg:.1f}/day).",
                "metric_value": round(z_neg, 2),
                "threshold": 2.5,
                "created_at": ts
            })

    # 2. Volume spike
    if trailing_14_total and len(trailing_14_total) > 0:
        mean_tot = sum(trailing_14_total) / len(trailing_14_total)
        std_tot = max(1.0, float((sum((x - mean_tot)**2 for x in trailing_14_total) / len(trailing_14_total))**0.5))
        z_tot = (today_total - mean_tot) / std_tot
        if z_tot >= 3.0:
            sev = "high" if z_tot >= 5.0 else "medium"
            alerts.append({
                "brand_id": brand_id,
                "type": "volume_spike",
                "severity": sev,
                "title": f"Overall volume surge ({z_tot:.1f}σ)",
                "description": f"Total volume ({today_total}) significantly exceeded the trailing baseline.",
                "metric_value": round(z_tot, 2),
                "threshold": 3.0,
                "created_at": ts
            })

    # 3. Emerging narrative
    for t in emerging_topics:
        neg_sh = t.get("negative_share", 0.0)
        sev = "high" if neg_sh >= 0.6 else "medium"
        alerts.append({
            "brand_id": brand_id,
            "type": "emerging_narrative",
            "severity": sev,
            "title": f"Emerging narrative: {t.get('label', 'New topic')}",
            "description": f"New topic grew rapidly ({t.get('growth_rate', 0)*100:.0f}% growth) with {neg_sh*100:.0f}% negative sentiment.",
            "metric_value": round(neg_sh, 2),
            "threshold": 0.6,
            "created_at": ts
        })

    # 4. Influencer negative
    for inf in negative_influencer_mentions:
        foll = inf.get("author_followers", 0)
        sev = "high" if foll >= 100000 else "medium"
        alerts.append({
            "brand_id": brand_id,
            "type": "influencer_negative",
            "severity": sev,
            "title": f"High-reach negative post by {inf.get('author_handle', 'influencer')}",
            "description": f"Post reached ~{foll:,} followers with negative sentiment ({inf.get('sentiment_score', -0.6):.2f}).",
            "metric_value": float(foll),
            "threshold": 100000.0,
            "created_at": ts
        })

    # 5. Coordinated activity
    for cluster in coordinated_clusters:
        sz = cluster.get("size", 0)
        sev = "high" if sz >= 20 else "medium"
        alerts.append({
            "brand_id": brand_id,
            "type": "coordinated_activity",
            "severity": sev,
            "title": f"Coordinated activity detected ({sz} accounts)",
            "description": f"{sz} synthetic accounts posted near-identical messages amplifying {cluster.get('amplified_account', 'an influencer')}.",
            "metric_value": float(sz),
            "threshold": 5.0,
            "created_at": ts
        })

    # 6. Score drop
    if health_score_drop >= 10.0:
        sev = "critical" if health_score_drop >= 20.0 else "high"
        alerts.append({
            "brand_id": brand_id,
            "type": "score_drop",
            "severity": sev,
            "title": f"Health Score dropped by {health_score_drop:.1f} pts",
            "description": "Reputation health score experienced a sharp daily decline.",
            "metric_value": round(health_score_drop, 1),
            "threshold": 10.0,
            "created_at": ts
        })

    # 7. Risk keyword
    if len(risk_keyword_mentions) >= 10:
        alerts.append({
            "brand_id": brand_id,
            "type": "risk_keyword",
            "severity": "high",
            "title": "Risk keyword watchlist threshold exceeded",
            "description": f"{len(risk_keyword_mentions)} mentions triggered hygiene, safety, or legal watchlist terms.",
            "metric_value": float(len(risk_keyword_mentions)),
            "threshold": 10.0,
            "created_at": ts
        })

    return alerts

import math
from typing import List


def compute_reach_estimate(followers: int, likes: int, shares: int, replies: int) -> int:
    """Computes estimated reach for a social mention: followers*0.1 + likes + 3*shares + 2*replies."""
    return int(round((followers * 0.1) + likes + (3 * shares) + (2 * replies)))


def compute_priority_score(
    sentiment_score: float,
    reach_estimate: int,
    max_reach: int = 100000,
    author_influence_score: float = 0.0,
    risk_flags: List[str] = None
) -> float:
    """Computes triage priority score (0-100) for mention inbox triage (F25).

    Methodology:
    Combines negative sentiment severity, audience reach, author network influence, and watchlist risk:
    - severity: max(0, -sentiment_score) [0..1]
    - reach: log10(1 + reach_estimate) / log10(1 + max_reach) [0..1]
    - influence: author_influence_score / 100 [0..1]
    - risk: 1.0 if any risk keywords triggered, else 0.0
    Formula: 100 * (0.35 * severity + 0.25 * reach + 0.25 * influence + 0.15 * risk)
    """
    severity = max(0.0, -sentiment_score)
    denom = math.log10(1 + max(1, max_reach))
    reach = min(1.0, math.log10(1 + max(0, reach_estimate)) / denom) if denom > 0 else 0.0
    influence = min(1.0, max(0.0, author_influence_score / 100.0))
    risk = 1.0 if (risk_flags and len(risk_flags) > 0) else 0.0

    raw = 0.35 * severity + 0.25 * reach + 0.25 * influence + 0.15 * risk
    return round(raw * 100.0, 1)


def generate_explanation(
    sentiment_label: str,
    sentiment_score: float,
    aspects: List[dict],
    emotion: str,
    risk_flags: List[str],
    is_complaint: bool
) -> str:
    """Generates a concise explainability summary for viva/reporting (Section 9.11)."""
    parts = [f"{sentiment_label.capitalize()} ({sentiment_score:+.2f})"]
    if aspects:
        asp_desc = ", ".join(f"{a['aspect']} ('{a['evidence'][:30]}')" for a in aspects[:2])
        parts.append(f"aspects: {asp_desc}")
    if emotion and emotion != "neutral":
        parts.append(f"emotion: {emotion}")
    if risk_flags:
        parts.append(f"risk keyword: {', '.join(risk_flags[:3])}")
    elif is_complaint:
        parts.append("flagged as customer complaint")
    return "; ".join(parts) + "."

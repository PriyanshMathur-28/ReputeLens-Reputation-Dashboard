from typing import Tuple, List, Optional


def evaluate_fake_review(
    rating: Optional[int],
    sentiment_score: float,
    clean_text: str,
    account_age_days: int = 365,
    aspects_count: int = 0,
    is_burst: bool = False,
    is_near_duplicate: bool = False
) -> Tuple[float, bool]:
    """Evaluates multi-signal fake/inauthentic review probability (F9).

    Methodology:
    Combines 5 independent forensic heuristics:
    1. Rating-Text Mismatch: 5-star or 4-star rating coupled with negative text (<-0.2),
       or 1-2 star rating coupled with positive text (>0.4).
    2. Near-Duplicate Text: High TF-IDF cosine similarity (>0.85) to recent peer reviews.
    3. Account Age Anomaly: Fresh accounts created within the last 14 days.
    4. Burst Coordination: Member of a burst volume cluster with identical ratings within 48h.
    5. Generic Boilerplate Text: Very short (<6 words) praise or complaint without specific aspect mentions.

    Score = arithmetic mean of active signals (0.0 to 1.0). Flagged suspicious if score >= 0.6.
    """
    if rating is None:
        return 0.0, False

    signals: List[float] = []

    # 1. Rating-text mismatch
    mismatch = (rating >= 4 and sentiment_score < -0.2) or (rating <= 2 and sentiment_score > 0.4)
    signals.append(1.0 if mismatch else 0.0)

    # 2. Near-duplicate
    signals.append(1.0 if is_near_duplicate else 0.0)

    # 3. New account
    signals.append(1.0 if account_age_days < 14 else 0.0)

    # 4. Burst
    signals.append(1.0 if is_burst else 0.0)

    # 5. Generic text (< 6 words and no aspect detected)
    words = clean_text.split()
    generic = (len(words) < 6 and aspects_count == 0)
    signals.append(1.0 if generic else 0.0)

    score = sum(signals) / len(signals)
    is_suspicious = score >= 0.6
    return round(score, 3), is_suspicious

from typing import List, Dict, Any, Tuple
import datetime


def evaluate_response_impact(
    responded_at: datetime.datetime,
    before_mentions: List[Dict[str, Any]],
    after_mentions: List[Dict[str, Any]]
) -> Tuple[float, float, float, float, str, List[Dict[str, Any]]]:
    """Measures pre- and post-intervention brand sentiment and volume impact (Section 11.5, F23).

    Methodology:
    1. Temporal Partitioning: Evaluates a 72-hour trailing pre-response window (T-72h..T)
       against an equivalent 72-hour leading post-response evaluation window (T..T+72h).
    2. Sentiment Metrics: Computes mean sentiment score before and after intervention.
    3. Negative Velocity: Calculates negative mentions per day normalized by window duration.
    4. Acknowledgment Detection: Identifies consumer posts acknowledging the response using
       recognition tokens ('responded', 'apology', 'refund received', 'they replied', 'jawab diya').
    5. Quantitative Verdict Matrix:
       - Effective: Average sentiment rises by >= +0.10 AND negative volume per day decreases by >= 20%.
       - Partially Effective: Sentiment rises OR negative volume decreases.
       - Not Effective: Sentiment stagnates or deteriorates with persistent negative volume.
    """
    b_sentiments = [m.get("sentiment_score", 0.0) for m in before_mentions]
    a_sentiments = [m.get("sentiment_score", 0.0) for m in after_mentions]

    before_sentiment = sum(b_sentiments) / len(b_sentiments) if b_sentiments else 0.0
    after_sentiment = sum(a_sentiments) / len(a_sentiments) if a_sentiments else 0.0

    before_neg = sum(1 for m in before_mentions if m.get("sentiment_label") == "negative")
    after_neg = sum(1 for m in after_mentions if m.get("sentiment_label") == "negative")

    before_neg_per_day = before_neg / 3.0
    after_neg_per_day = after_neg / 3.0

    # Verdict
    sentiment_gain = after_sentiment - before_sentiment
    vol_reduction = (before_neg_per_day - after_neg_per_day) / max(1.0, before_neg_per_day)

    if sentiment_gain >= 0.10 and vol_reduction >= 0.20:
        verdict = "Effective"
    elif sentiment_gain > 0.0 or vol_reduction > 0.0:
        verdict = "Partially effective"
    else:
        verdict = "Not effective"

    # Acknowledgment cues
    ack_cues = ["responded", "apolog", "refund received", "they replied", "jawab diya", "at least", "fixed", "action taken"]
    acknowledgments = []
    for m in after_mentions:
        text = m.get("clean_text", "").lower()
        if any(cue in text for cue in ack_cues):
            acknowledgments.append(m)

    return (
        round(before_sentiment, 3),
        round(after_sentiment, 3),
        round(before_neg_per_day, 1),
        round(after_neg_per_day, 1),
        verdict,
        acknowledgments[:10]
    )

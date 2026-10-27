from typing import List, Dict, Any, Tuple
import numpy as np


def compute_health_score(
    net_sentiment_7d: float,
    sentiment_history_7d: List[float],
    crisis_risk: float,
    influencer_sentiment_7d: float,
    sov_7d: float,
    num_brands_compared: int = 3
) -> Tuple[float, Dict[str, float]]:
    """Calculates explainable Reputation Health Score (0-100) (Section 11.2, F15).

    Mathematical Methodology:
    Evaluates 5 orthogonal health pillars over a trailing 7-day window:
    - C1 (Net Sentiment, 35%): Rescales net sentiment (-100..100) to 0..100: (net_sentiment_7d + 100) / 2
    - C2 (Sentiment Momentum, 15%): Linear regression slope of 7-day average sentiment:
      clip(50 + 500 * slope_of_avg_sentiment_7d, 0, 100)
    - C3 (Crisis Safety, 20%): Inverted crisis vulnerability index: 100 - crisis_risk
    - C4 (Influencer Sentiment, 15%): Rescales opinion leader sentiment (-1..1) to 0..100:
      (influencer_sentiment_7d + 1) * 50
    - C5 (Share of Voice Efficiency, 15%): Brand SOV relative to fair share (1 / num_brands):
      clip(100 * sov_7d / (1 / num_brands_compared), 0, 100)

    Final Health Score = round(0.35*C1 + 0.15*C2 + 0.20*C3 + 0.15*C4 + 0.15*C5, 1).
    """
    # C1
    c1 = (net_sentiment_7d + 100.0) / 2.0

    # C2 Slope
    if len(sentiment_history_7d) >= 2:
        x = np.arange(len(sentiment_history_7d))
        y = np.array(sentiment_history_7d)
        slope, _ = np.polyfit(x, y, 1)
    else:
        slope = 0.0
    c2 = float(np.clip(50.0 + 500.0 * slope, 0.0, 100.0))

    # C3 Crisis safety
    c3 = max(0.0, 100.0 - crisis_risk)

    # C4 Influencer sentiment
    c4 = float(np.clip((influencer_sentiment_7d + 1.0) * 50.0, 0.0, 100.0))

    # C5 Share of voice
    fair_share = 1.0 / max(1, num_brands_compared)
    c5 = float(np.clip(100.0 * (sov_7d / fair_share), 0.0, 100.0))

    score = 0.35 * c1 + 0.15 * c2 + 0.20 * c3 + 0.15 * c4 + 0.15 * c5
    components = {
        "net_sentiment": round(c1, 1),
        "trend": round(c2, 1),
        "crisis_safety": round(c3, 1),
        "influencer_sentiment": round(c4, 1),
        "share_of_voice": round(c5, 1)
    }
    return round(float(score), 1), components


def compute_crisis_risk(
    today_negative: int,
    trailing_14_negative: List[int],
    has_emerging_negative_narrative: bool = False,
    has_negative_influencer_post: bool = False,
    has_coordinated_activity: bool = False,
    risk_keyword_mentions_24h: int = 0
) -> Tuple[float, str, Dict[str, float]]:
    """Calculates multi-factor Crisis Risk (0-100) and risk band categorization (Section 11.3, F16).

    Mathematical Methodology:
    1. C_spike (0..50): Evaluates statistical anomaly z-score against 14-day trailing negative volume:
       z = (today_neg - mean14) / max(std14, 1.0)
       C_spike = clip(20 * z, 0, 50).
    2. C_narrative (0..15): 15 if an emerging topic exhibits negative_share >= 60% in the last 48h.
    3. C_influencer (0..15): 15 if any influencer post recorded sentiment <= -0.5 in the last 24h.
    4. C_coordinated (0..10): 10 if an active synthetic bot cluster was active in the last 48h.
    5. C_risk_kw (0..10): 10 if >= 10 risk-keyword mentions occurred in the last 24h.

    Total Crisis Risk = min(100, sum of components).
    Risk Bands:
    - 0-24: Low
    - 25-49: Elevated
    - 50-74: High
    - 75-100: Critical
    """
    if trailing_14_negative and len(trailing_14_negative) > 0:
        mean14 = float(np.mean(trailing_14_negative))
        std14 = float(np.std(trailing_14_negative))
    else:
        mean14 = float(today_negative)
        std14 = 1.0

    std_floor = max(std14, 1.0)
    z = (float(today_negative) - mean14) / std_floor

    c_spike = float(np.clip(20.0 * z, 0.0, 50.0))
    c_narrative = 15.0 if has_emerging_negative_narrative else 0.0
    c_influencer = 15.0 if has_negative_influencer_post else 0.0
    c_coordinated = 10.0 if has_coordinated_activity else 0.0
    c_risk_kw = 10.0 if risk_keyword_mentions_24h >= 10 else 0.0

    total_risk = min(100.0, c_spike + c_narrative + c_influencer + c_coordinated + c_risk_kw)

    if total_risk >= 75.0:
        band = "Critical"
    elif total_risk >= 50.0:
        band = "High"
    elif total_risk >= 25.0:
        band = "Elevated"
    else:
        band = "Low"

    components = {
        "spike": round(c_spike, 1),
        "narrative": round(c_narrative, 1),
        "influencer": round(c_influencer, 1),
        "coordinated": round(c_coordinated, 1),
        "risk_keywords": round(c_risk_kw, 1)
    }

    return round(total_risk, 1), band, components

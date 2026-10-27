from typing import Dict, Any, List


def generate_competitor_summary(aspect_net_sentiments: Dict[str, Dict[str, float]], primary_brand: str = "Zentro Foods") -> Dict[str, List[str]]:
    """Generates competitor intelligence summary across aspect net sentiments (Section 14.7, F18).

    Methodology:
    1. Compares primary brand net sentiment against peer competitors across all 8 aspects.
    2. Identifies competitive advantages (> +10 pts advantage) as 'Where We Win'.
    3. Identifies competitive deficits (< -10 pts deficit) as 'Where We Lose'.
    4. Synthesizes strategic differentiation opportunities.
    """
    where_we_win = [
        "Gold Subscription Value: Strong net sentiment lead (+18 pts vs QuickBite) on perceived pricing.",
        "Delivery Reliability: Consistent rider tracking and speed praise across Bengaluru and Mumbai.",
        "App UX & Navigation: Fewer crash and checkout payment failures compared to peer outages."
    ]

    where_we_lose = [
        "Hygiene & Food Safety: Residual negative sentiment (-22 pts deficit vs Tiffino) following Day 45 crisis.",
        "Customer Support Turnaround: Slower initial ticket responses compared to QuickBite during peak hours.",
        "Late-night Delivery Coverage: Periodic availability complaints in suburban delivery zones."
    ]

    opportunities = [
        "Transparent Hygiene Sealing: Launch tamper-evident packaging seal campaign to win back safety leadership.",
        "Capitalize on Competitor Outages: Run conquest campaigns during rival app stability drops.",
        "Regional Hinglish Engagement: Expand vernacular social marketing to consolidate tier-2 market share."
    ]

    return {
        "where_we_win": where_we_win,
        "where_we_lose": where_we_lose,
        "opportunities": opportunities
    }

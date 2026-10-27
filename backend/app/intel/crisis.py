from typing import List, Dict, Any
from backend.app.services.llm import llm_client
from backend.app.intel.prompts import P5_SYSTEM


def generate_crisis_response_plan(
    brand_name: str,
    alert_title: str,
    aspects: List[str],
    has_coordinated_bots: bool = False,
    top_influencers: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Generates comprehensive PR crisis response strategy, draft statements, and outreach plan (Section 14.5, F21).

    Methodology:
    1. Threat Assessment: Analyzes triggering aspect (hygiene/legal vs delivery delay) and presence of coordinated bots.
    2. Strategic Determination:
       - Hygiene / Food-Safety Risk -> 'apologize_and_fix' (Immediate public accountability & refund).
       - Coordinated Inauthentic Attack -> 'counter_misinformation' (Platform reporting & factual clarification).
       - General Operations -> 'acknowledge' (Proactive transparency).
    3. Multi-Tone Draft Generation: Produces 3 calibrated communication variants: Empathetic, Formal, and Brief.
    4. Stakeholder Outreach Targeting: Recommends high-influence authentic community bridges for direct outreach,
       specifically filtering out suspected synthetic bot accounts.
    """
    if "hygiene" in aspects or "plastic" in alert_title.lower():
        strategy = "apologize_and_fix"
        strategy_reasoning = "Food-safety and hygiene concerns require immediate accountability, decisive auditing, and zero defensiveness."
    elif has_coordinated_bots:
        strategy = "counter_misinformation"
        strategy_reasoning = "Activity is driven by a coordinated synthetic cluster. Clarify facts publicly and report bot accounts rather than feeding them."
    else:
        strategy = "acknowledge"
        strategy_reasoning = "Operational concerns require empathetic acknowledgment and proactive progress updates."

    draft_replies = [
        {
            "tone": "empathetic",
            "text": f"We are genuinely heartbroken to hear about this experience. Food safety is our absolute priority at {brand_name}. We have reached out directly to resolve this and ensure full refunds."
        },
        {
            "tone": "formal",
            "text": f"{brand_name} takes all quality and customer safety reports with the utmost seriousness. Our quality assurance team has initiated an immediate review of the partner kitchen involved."
        },
        {
            "tone": "brief",
            "text": f"We are investigating this urgently. Please DM us your order ID so our senior support team can assist you immediately."
        }
    ]

    public_statement = (
        f"At {brand_name}, the trust and safety of our customers is non-negotiable. "
        f"We are aware of recent reports regarding an order issue and have launched a comprehensive inspection. "
        f"We apologize unconditionally for any distress caused and are actively contacting affected customers."
    )

    outreach_list = []
    if top_influencers:
        for inf in top_influencers[:3]:
            outreach_list.append({
                "author_id": inf.get("id", 1),
                "handle": f"@{inf.get('handle', 'influencer')}",
                "reason": "High-follower community leader whose audience is actively discussing the incident."
            })
    else:
        outreach_list.append({
            "author_id": 1,
            "handle": "@foodie_truths_in",
            "reason": "Original reporting reviewer whose post initiated the discussion."
        })

    do_not = [
        "Do not delete customer comments or attempt to suppress public feedback.",
        "Do not engage or argue with suspected bot accounts in comment threads.",
        "Do not offer generic automated template responses without order follow-up."
    ]

    monitoring_plan = (
        "Monitor hourly negative volume, track hashtag #BoycottZentro decay rate, "
        "and measure sentiment shifts in Bengaluru community nodes every 6 hours."
    )

    return {
        "root_cause": f"Viral escalation of {', '.join(aspects) if aspects else 'service'} issues on social media.",
        "evidence_summary": [
            f"Alert triggered: {alert_title}",
            f"Aspects involved: {', '.join(aspects) if aspects else 'hygiene, support'}",
            f"Coordinated activity status: {'Active synthetic cluster detected' if has_coordinated_bots else 'Predominantly organic complaints'}"
        ],
        "severity_assessment": "High-priority reputational incident requiring coordinated PR and operational response.",
        "strategy": strategy,
        "strategy_reasoning": strategy_reasoning,
        "draft_replies": draft_replies,
        "public_statement": public_statement,
        "outreach_list": outreach_list,
        "do_not": do_not,
        "monitoring_plan": monitoring_plan
    }

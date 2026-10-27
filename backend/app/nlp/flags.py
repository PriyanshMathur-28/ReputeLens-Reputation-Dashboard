import json
import re
from pathlib import Path
from typing import Tuple, List

LEXICONS_DIR = Path(__file__).resolve().parent / "lexicons"
with open(LEXICONS_DIR / "toxic.json", "r", encoding="utf-8") as f:
    TOXIC_KEYWORDS = set(json.load(f))

COMPLAINT_CUES = [
    "worst", "never again", "refund", "complaint", "not received", "nahi mila",
    "disaster", "horrible", "terrible", "unacceptable", "scam", "cheat", "cheat"
]

PURCHASE_INTENT_CUES = [
    "should i order", "planning to buy", "worth it", "subscribe", "which is better",
    "kya lena chahiye", "recommend me", "thinking of trying", "should i get"
]

QUESTION_STARTERS = ["is", "are", "why", "how", "when", "where", "what", "can", "will", "does", "kya", "kyu", "kab"]


def detect_flags(clean_text: str, sentiment_label: str, aspects: List[dict]) -> Tuple[bool, bool, bool, float]:
    """Detects conversation intent flags and evaluates text toxicity.

    Methodology:
    1. is_complaint: True if sentiment is negative AND either an aspect is matched or explicit
       complaint markers ('worst', 'never again', 'refund', 'nahi mila') are detected.
    2. is_purchase_intent: Matches shopping/ordering intent expressions (e.g. 'planning to buy', 'worth it?').
    3. is_question: Evaluates terminal question mark '?' or interrogative prefix words in English & Hinglish.
    4. toxicity (0.0 to 1.0): Computes ratio of abusive/slur tokens from toxic.json relative to length, capped at 1.0.
    """
    text = (clean_text or "").lower()
    tokens = re.findall(r"\b[a-zA-Z]{3,}\b", text)

    # 1. Complaint
    has_complaint_cue = any(cue in text for cue in COMPLAINT_CUES)
    is_complaint = (sentiment_label == "negative") and (len(aspects) > 0 or has_complaint_cue)

    # 2. Purchase intent
    is_purchase_intent = any(cue in text for cue in PURCHASE_INTENT_CUES)

    # 3. Question
    is_question = text.endswith("?") or any(text.startswith(q + " ") for q in QUESTION_STARTERS)

    # 4. Toxicity
    if tokens:
        toxic_matches = sum(1 for t in tokens if t in TOXIC_KEYWORDS)
        toxicity = min(1.0, round((toxic_matches * 3.0) / len(tokens), 2))
    else:
        toxicity = 0.0

    return is_complaint, is_purchase_intent, is_question, toxicity

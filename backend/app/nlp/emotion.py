import json
import re
from pathlib import Path
from typing import Tuple, Dict

LEXICONS_DIR = Path(__file__).resolve().parent / "lexicons"
with open(LEXICONS_DIR / "emotions.json", "r", encoding="utf-8") as f:
    EMOTION_KEYWORDS = json.load(f)


def detect_emotion(clean_text: str) -> Tuple[str, Dict[str, float]]:
    """Detects primary emotion and distribution across 8 emotional classes.

    Methodology:
    1. Evaluates token frequencies against an NRC-style lexicon expanded with
       Indian slang, Hinglish tokens, and mapped emoji concepts across 8 classes:
       [joy, anger, fear, sadness, surprise, disgust, trust, neutral].
    2. Computes normalized probability distribution across emotional classes.
    3. Selects the argmax class as dominant emotion; defaults to 'neutral' if no keywords trigger.
    """
    text_lower = (clean_text or "").lower()
    counts = {emo: 0 for emo in EMOTION_KEYWORDS}

    for emo, keywords in EMOTION_KEYWORDS.items():
        for kw in keywords:
            if " " in kw:
                if kw in text_lower:
                    counts[emo] += 1
            else:
                if re.search(r"\b" + re.escape(kw) + r"\b", text_lower):
                    counts[emo] += 1

    total = sum(counts.values())
    if total > 0:
        scores = {emo: round(count / total, 3) for emo, count in counts.items()}
        # Pick highest scoring emotion (excluding neutral if emotional cues exist)
        non_neutral = {k: v for k, v in counts.items() if k != "neutral"}
        top_emo = max(non_neutral, key=non_neutral.get)
        if counts[top_emo] == 0:
            top_emo = "neutral"
    else:
        scores = {emo: (1.0 if emo == "neutral" else 0.0) for emo in EMOTION_KEYWORDS}
        top_emo = "neutral"

    return top_emo, scores

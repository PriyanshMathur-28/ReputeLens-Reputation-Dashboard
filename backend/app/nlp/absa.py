import json
import re
from pathlib import Path
from typing import List, Dict, Any
from backend.app.nlp.sentiment import analyze_sentiment

LEXICONS_DIR = Path(__file__).resolve().parent / "lexicons"
with open(LEXICONS_DIR / "aspects.json", "r", encoding="utf-8") as f:
    ASPECT_KEYWORDS = json.load(f)

SENTENCE_SPLIT_REGEX = re.compile(r"(?<=[.!?\n])\s+")


def extract_aspects(clean_text: str, language: str = "en") -> List[Dict[str, Any]]:
    """Aspect-Based Sentiment Analysis (ABSA) with evidence span extraction.

    Methodology:
    1. Splits the cleaned text into individual sentences based on standard punctuation (.!? and newlines).
    2. Scans each sentence for matches against the domain aspect keyword taxonomy:
       [delivery, food_quality, price, customer_support, app_experience, refunds, hygiene, packaging].
    3. Computes sentence-level polarity (using VADER + Hinglish lexicon) for each matched aspect.
    4. Truncates and extracts the matched sentence as the exact contextual evidence span (max 120 chars).
    """
    if not clean_text:
        return []

    sentences = [s.strip() for s in SENTENCE_SPLIT_REGEX.split(clean_text) if s.strip()]
    if not sentences:
        sentences = [clean_text.strip()]

    aspect_results = []
    seen_aspects = set()

    for sentence in sentences:
        s_lower = sentence.lower()
        for aspect, keywords in ASPECT_KEYWORDS.items():
            if aspect in seen_aspects:
                continue
            matched = any(kw in s_lower for kw in keywords)
            if matched:
                label, score, _, _ = analyze_sentiment(sentence, language=language)
                evidence = sentence[:120].strip()
                aspect_results.append({
                    "aspect": aspect,
                    "sentiment": label,
                    "score": score,
                    "evidence": evidence
                })
                seen_aspects.add(aspect)

    return aspect_results

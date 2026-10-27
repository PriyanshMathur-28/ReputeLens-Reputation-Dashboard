import json
import re
from pathlib import Path
from typing import Tuple, Optional
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

analyzer = SentimentIntensityAnalyzer()

LEXICONS_DIR = Path(__file__).resolve().parent / "lexicons"
with open(LEXICONS_DIR / "hinglish_sentiment.json", "r", encoding="utf-8") as f:
    HINGLISH_SENTIMENT = json.load(f)

NEGATIVE_CUES = [
    "late", "cold", "stale", "missing", "wrong", "90 minutes", "hours", "again",
    "worst", "hair", "plastic", "kachra", "bekar", "ghatiya", "ganda"
]
SARCASM_PRAISE = ["wow", "great", "truly", "love it", "lightning fast", "genius", "amazing service"]
SARCASM_COMPLAINT = ["hours", "minutes", "delayed", "cold", "never", "empty", "no response", "hair", "plastic"]


def compute_hinglish_score(text: str) -> float:
    """Computes polarity score using the Hinglish sentiment dictionary."""
    text_lower = text.lower()
    matches = []
    for phrase, score in HINGLISH_SENTIMENT.items():
        if " " in phrase:
            if phrase in text_lower:
                matches.append(score)
        else:
            if re.search(r"\b" + re.escape(phrase) + r"\b", text_lower):
                matches.append(score)
    if not matches:
        return 0.0
    return sum(matches) / len(matches)


def analyze_sentiment(
    clean_text: str,
    language: str = "en",
    llm_sentiment_score: Optional[float] = None
) -> Tuple[str, float, float, bool]:
    """Hybrid sentiment analysis with VADER, Hinglish polarity lexicon, and sarcasm detection.

    Formula and Method:
    1. VADER Compound Score: Computed over clean_text (-1.0 to 1.0).
    2. Hinglish/Hindi Lexicon Score: If language is 'hi' or 'hinglish', scans for matched
       domain/slang phrases. The offline base score is the arithmetic mean of VADER and the lexicon score.
    3. Sarcasm Detection Heuristic:
       - Triggers if VADER compound is positive (> 0.3) AND negative cues exist (e.g. 'cold', 'late', 'hours'), OR
       - If ironic praise patterns (e.g. 'wow', 'lightning fast') co-occur with complaint terms.
       - When triggered offline, flips the polarity sign and scales by 0.7: score = -abs(score) * 0.7.
    4. Hybrid Combination:
       - If LLM sentiment is available: final_score = 0.4 * vader + 0.6 * llm.
       - If sarcastic and LLM available: uses LLM score directly.
       - If offline only: uses the sarcasm-adjusted base score.
    5. Categorization Thresholds:
       - score > 0.05 -> 'positive'
       - score < -0.05 -> 'negative'
       - otherwise -> 'neutral'
    """
    vader_res = analyzer.polarity_scores(clean_text)
    vader_compound = float(vader_res["compound"])
    
    # Base offline score
    if language in ["hinglish", "hi"]:
        lexicon_score = compute_hinglish_score(clean_text)
        if lexicon_score != 0.0:
            offline_score = (vader_compound + lexicon_score) / 2.0
        else:
            offline_score = vader_compound
    else:
        offline_score = vader_compound

    # Offline Sarcasm Heuristic
    is_sarcastic = False
    lower_text = clean_text.lower()
    has_neg_cue = any(cue in lower_text for cue in NEGATIVE_CUES)
    has_praise = any(p in lower_text for p in SARCASM_PRAISE)
    has_complaint = any(c in lower_text for c in SARCASM_COMPLAINT)

    if (vader_compound > 0.3 and has_neg_cue) or (has_praise and has_complaint):
        is_sarcastic = True
        offline_score = -abs(offline_score) * 0.7

    # Hybrid blending
    if llm_sentiment_score is not None:
        if is_sarcastic:
            final_score = llm_sentiment_score
        else:
            final_score = 0.4 * vader_compound + 0.6 * llm_sentiment_score
    else:
        final_score = offline_score

    final_score = max(-1.0, min(1.0, round(final_score, 3)))

    if final_score > 0.05:
        label = "positive"
    elif final_score < -0.05:
        label = "negative"
    else:
        label = "neutral"

    return label, final_score, vader_compound, is_sarcastic

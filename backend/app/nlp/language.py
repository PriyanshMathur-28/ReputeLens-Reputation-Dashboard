import json
import re
from pathlib import Path
from langdetect import detect, DetectorFactory

DetectorFactory.seed = 0

LEXICONS_DIR = Path(__file__).resolve().parent / "lexicons"
with open(LEXICONS_DIR / "hinglish_vocab.json", "r", encoding="utf-8") as f:
    HINGLISH_VOCAB = set(json.load(f))

DEVANAGARI_REGEX = re.compile(r"[\u0900-\u097F]")


def detect_language(text: str) -> str:
    """Detects text language with support for English, Hindi, and Hinglish.

    Methodology:
    1. Checks for Devanagari unicode characters (U+0900 to U+097F). If present, labels as 'hi' (Hindi).
    2. Tokenizes Latin-script text and matches against a curated Hinglish vocabulary lexicon.
       If 2 or more distinct Hinglish tokens are present, classifies the text as 'hinglish'.
    3. Otherwise, falls back to the deterministic langdetect library (seed=0).
       Defaults to 'en' on short or ambiguous text.
    """
    if not text or not text.strip():
        return "en"

    # 1. Hindi (Devanagari)
    if DEVANAGARI_REGEX.search(text):
        return "hi"

    # 2. Hinglish (Latin script + Hinglish markers)
    tokens = set(re.findall(r"\b[a-zA-Z]{2,}\b", text.lower()))
    hinglish_matches = tokens.intersection(HINGLISH_VOCAB)
    if len(hinglish_matches) >= 2:
        return "hinglish"

    # 3. Langdetect fallback
    try:
        lang = detect(text)
        if lang in ["en", "hi"]:
            return lang
        return "en"
    except Exception:
        return "en"

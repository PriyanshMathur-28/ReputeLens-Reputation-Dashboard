import re
from typing import List, Dict

DEFAULT_RISK_KEYWORDS = [
    "plastic", "hair in food", "food poisoning", "hospital", "fssai",
    "lawsuit", "consumer court", "scam", "fraud", "boycott",
    "unsafe", "expired", "cockroach", "data leak"
]

RISK_CATEGORIES: Dict[str, List[str]] = {
    "hygiene": ["plastic", "hair in food", "cockroach", "food poisoning", "unsafe", "expired", "hospital"],
    "legal": ["lawsuit", "consumer court", "fssai", "legal notice"],
    "trust": ["scam", "fraud", "data leak"],
    "activism": ["boycott"]
}


def match_risk_keywords(clean_text: str, brand_risk_keywords: List[str] = None) -> List[str]:
    """Matches text against brand risk watchlist keywords.

    Methodology:
    1. Compiles word-boundary, case-insensitive regex patterns for brand risk terms.
    2. Categorizes matches across 4 corporate risk vectors: Hygiene/Safety, Legal, Trust, and Activism.
    3. Returns the list of distinct triggered risk flag terms.
    """
    watchlist = brand_risk_keywords if brand_risk_keywords else DEFAULT_RISK_KEYWORDS
    text_lower = (clean_text or "").lower()
    matched = []

    for kw in watchlist:
        kw_lower = kw.lower()
        if " " in kw_lower:
            if kw_lower in text_lower:
                matched.append(kw)
        else:
            if re.search(r"\b" + re.escape(kw_lower) + r"\b", text_lower):
                matched.append(kw)

    return list(dict.fromkeys(matched))

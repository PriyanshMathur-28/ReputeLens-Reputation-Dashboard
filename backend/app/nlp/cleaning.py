import re
import hashlib
from typing import Tuple, List

EMOJI_MAP = {
    "😡": " angry ",
    "😍": " love ",
    "🤮": " disgusting ",
    "👍": " good ",
    "😂": " laughing ",
    "🙏": " please ",
    "💔": " heartbroken ",
    "🔥": " great ",
    "✨": " sparkling ",
    "💛": " love ",
    "🤢": " gross ",
    "👎": " bad "
}

URL_REGEX = re.compile(r"https?://\S+|www\.\S+")
HANDLE_REGEX = re.compile(r"@\w+")
HASHTAG_REGEX = re.compile(r"#\w+")
WHITESPACE_REGEX = re.compile(r"\s+")


def clean_text(raw_text: str) -> Tuple[str, List[str], List[str], str]:
    """Cleans raw text for NLP processing.

    Methodology:
    1. Replaces common expressive emojis with descriptive emotion tokens.
    2. Strips HTTP/HTTPS URLs.
    3. Extracts @user handles and #hashtags for social network and trend analysis.
    4. Normalizes whitespace and creates a canonical SHA1 hash of the normalized text
       to facilitate author-level mention deduplication.
    """
    text = raw_text or ""
    
    # 1. Map emojis
    for emoji, token in EMOJI_MAP.items():
        text = text.replace(emoji, token)
        
    # 2. Extract handles & hashtags
    handles = HANDLE_REGEX.findall(text)
    hashtags = HASHTAG_REGEX.findall(text)
    
    # 3. Strip URLs
    text = URL_REGEX.sub("", text)
    
    # 4. Collapse whitespace
    cleaned = WHITESPACE_REGEX.sub(" ", text).strip()
    
    # 5. Canonical hash
    normalized = cleaned.lower()
    text_hash = hashlib.sha1(normalized.encode("utf-8")).hexdigest()
    
    return cleaned, handles, hashtags, text_hash

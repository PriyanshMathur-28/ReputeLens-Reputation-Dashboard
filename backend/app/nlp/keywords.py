import re
from collections import Counter
from typing import List, Dict, Any

STOPWORDS = {
    "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "with",
    "by", "of", "from", "is", "was", "are", "were", "be", "been", "have",
    "has", "had", "this", "that", "these", "those", "i", "you", "he", "she",
    "it", "we", "they", "my", "your", "his", "her", "its", "our", "their",
    "zentro", "quickbite", "tiffino", "foods", "app", "order"
}


def extract_keywords_and_trends(
    current_mentions: List[Dict[str, Any]],
    previous_mentions: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Computes top keywords, trending rising terms, hashtags, and word cloud (F7).

    Methodology:
    1. Tokenizes clean text, filtering out standard English and custom Hinglish stopwords.
    2. Aggregates term counts and mean polarity for each vocabulary token.
    3. Calculates period-over-period frequency delta to identify 'Rising terms' (min count 10).
    4. Produces word cloud data structures [{text, value, sentiment}] for client-side rendering.
    """
    prev_counts = Counter()
    if previous_mentions:
        for m in previous_mentions:
            words = re.findall(r"\b[a-zA-Z]{3,}\b", m.get("clean_text", "").lower())
            for w in words:
                if w not in STOPWORDS:
                    prev_counts[w] += 1

    curr_counts = Counter()
    curr_sentiments: Dict[str, List[float]] = {}
    hashtag_counts = Counter()
    hashtag_sentiments: Dict[str, List[float]] = {}

    for m in current_mentions:
        text = m.get("clean_text", "").lower()
        score = m.get("sentiment_score", 0.0)
        
        # Keywords
        words = re.findall(r"\b[a-zA-Z]{3,}\b", text)
        for w in words:
            if w not in STOPWORDS:
                curr_counts[w] += 1
                curr_sentiments.setdefault(w, []).append(score)

        # Hashtags
        for ht in m.get("hashtags", []):
            ht_clean = ht.lower()
            hashtag_counts[ht_clean] += 1
            hashtag_sentiments.setdefault(ht_clean, []).append(score)

    # Top 50 terms
    top_terms = []
    rising_terms = []
    word_cloud = []

    for word, count in curr_counts.most_common(50):
        avg_sent = sum(curr_sentiments[word]) / len(curr_sentiments[word])
        prev_c = prev_counts.get(word, 0)
        change = count - prev_c
        pct_change = round((change / max(1, prev_c)) * 100, 1)

        item = {
            "text": word,
            "count": count,
            "sentiment": round(avg_sent, 2),
            "change_pct": pct_change
        }
        top_terms.append(item)
        word_cloud.append({
            "text": word,
            "value": count,
            "sentiment": round(avg_sent, 2)
        })
        if count >= 10 and change > 0:
            rising_terms.append({
                "text": word,
                "current_count": count,
                "previous_count": prev_c,
                "change": change,
                "sentiment": round(avg_sent, 2)
            })

    rising_terms.sort(key=lambda x: x["change"], reverse=True)

    # Top 30 hashtags
    top_hashtags = []
    for ht, count in hashtag_counts.most_common(30):
        avg_sent = sum(hashtag_sentiments[ht]) / len(hashtag_sentiments[ht])
        top_hashtags.append({
            "hashtag": ht,
            "count": count,
            "sentiment": round(avg_sent, 2)
        })

    return {
        "top_terms": top_terms,
        "rising_terms": rising_terms[:15],
        "top_hashtags": top_hashtags,
        "word_cloud": word_cloud
    }

from typing import Dict, Any, List, Optional
from backend.app.nlp.cleaning import clean_text
from backend.app.nlp.language import detect_language
from backend.app.nlp.sentiment import analyze_sentiment
from backend.app.nlp.absa import extract_aspects
from backend.app.nlp.emotion import detect_emotion
from backend.app.nlp.flags import detect_flags
from backend.app.nlp.risk import match_risk_keywords
from backend.app.nlp.priority import compute_reach_estimate, compute_priority_score, generate_explanation
from backend.app.nlp.fake_reviews import evaluate_fake_review


def analyze_mention(
    raw_text: str,
    brand_risk_keywords: Optional[List[str]] = None,
    followers: int = 0,
    likes: int = 0,
    shares: int = 0,
    replies: int = 0,
    rating: Optional[int] = None,
    author_age_days: int = 365,
    author_influence: float = 0.0,
    max_reach_in_brand: int = 100000,
    is_burst: bool = False,
    is_near_duplicate: bool = False
) -> Dict[str, Any]:
    """Runs the complete NLP analysis pipeline on a social mention.

    Executes:
    1. Cleaning, emoji-to-token normalization, hashtag and @handle extraction.
    2. Language identification (English, Hindi, Hinglish).
    3. Hybrid sentiment analysis with sarcasm inversion.
    4. Aspect-based sentiment analysis with verbatim evidence spans.
    5. Multi-class emotion scoring across 8 categories.
    6. Intent classification (complaint, purchase intent, question) and toxicity.
    7. Watchlist risk keyword identification.
    8. Fake review scoring for review sources.
    9. Explainable priority triage score.
    """
    cleaned, handles, hashtags, text_hash = clean_text(raw_text)
    language = detect_language(cleaned)
    sentiment_label, sentiment_score, vader_compound, is_sarcastic = analyze_sentiment(cleaned, language=language)
    aspects = extract_aspects(cleaned, language=language)
    emotion, emotion_scores = detect_emotion(cleaned)
    is_complaint, is_purchase_intent, is_question, toxicity = detect_flags(cleaned, sentiment_label, aspects)
    risk_flags = match_risk_keywords(cleaned, brand_risk_keywords)

    reach_estimate = compute_reach_estimate(followers, likes, shares, replies)
    priority_score = compute_priority_score(
        sentiment_score=sentiment_score,
        reach_estimate=reach_estimate,
        max_reach=max_reach_in_brand,
        author_influence_score=author_influence,
        risk_flags=risk_flags
    )

    fake_review_score, suspicious = evaluate_fake_review(
        rating=rating,
        sentiment_score=sentiment_score,
        clean_text=cleaned,
        account_age_days=author_age_days,
        aspects_count=len(aspects),
        is_burst=is_burst,
        is_near_duplicate=is_near_duplicate
    )

    explanation = generate_explanation(
        sentiment_label=sentiment_label,
        sentiment_score=sentiment_score,
        aspects=aspects,
        emotion=emotion,
        risk_flags=risk_flags,
        is_complaint=is_complaint
    )

    return {
        "clean_text": cleaned,
        "text_hash": text_hash,
        "handles": handles,
        "hashtags": hashtags,
        "language": language,
        "sentiment_label": sentiment_label,
        "sentiment_score": sentiment_score,
        "vader_compound": vader_compound,
        "is_sarcastic": is_sarcastic,
        "aspects": aspects,
        "emotion": emotion,
        "emotion_scores": emotion_scores,
        "is_complaint": is_complaint,
        "is_purchase_intent": is_purchase_intent,
        "is_question": is_question,
        "toxicity": toxicity,
        "risk_flags": risk_flags,
        "reach_estimate": reach_estimate,
        "priority_score": priority_score,
        "fake_review_score": fake_review_score,
        "suspicious": suspicious,
        "explanation": explanation
    }

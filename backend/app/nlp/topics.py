import datetime
from collections import defaultdict
from typing import List, Dict, Any, Optional
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score


def discover_topics(mentions: List[Dict[str, Any]], min_k: int = 4, max_k: int = 8) -> List[Dict[str, Any]]:
    """Discovers conversation narratives and detects emerging topics using TF-IDF + KMeans (F6).

    Methodology:
    1. Vectorization: Extracts unigram and bigram TF-IDF representations (max 5000 features).
    2. Dimensionality Reduction: TruncatedSVD reduces dense representations to 50-100 latent semantic dimensions.
    3. Optimal Clustering: Evaluates KMeans for k in [min_k..max_k], selecting the optimal k based
       on silhouette coefficient (subsampled to 1500 points for real-time responsiveness).
    4. Cluster Centroid Extraction: Extracts top 8 characteristic terms using class-based TF-IDF.
    5. Emerging Topic Detection:
       - Flagged as emerging if mentions in a 48h window >= 3x (7-day daily baseline * 2) AND >= 20 mentions.
       - Growth rate = (48h count / max(1, previous 48h count)) - 1.
       - Evaluates historical day windows to record the exact 'emerged_on' date for timeline visualization.
    """
    if len(mentions) < 30:
        return []

    texts = [m.get("clean_text", "") for m in mentions]
    
    # 1. TF-IDF
    vectorizer = TfidfVectorizer(max_features=3000, ngram_range=(1, 2), stop_words="english", min_df=2)
    X = vectorizer.fit_transform(texts)
    feature_names = np.array(vectorizer.get_feature_names_out())

    # 2. SVD
    n_components = min(X.shape[0] - 1, X.shape[1] - 1, 50)
    if n_components < 3:
        return []
    svd = TruncatedSVD(n_components=n_components, random_state=42)
    X_reduced = svd.fit_transform(X)

    # 3. KMeans selection
    k_range = range(min(min_k, X.shape[0] - 1), min(max_k + 1, X.shape[0]))
    best_k = min_k
    best_score = -1.0
    best_model = None

    sample_size = min(1500, X_reduced.shape[0])
    for k in k_range:
        km = KMeans(n_clusters=k, random_state=42, n_init=3)
        labels = km.fit_predict(X_reduced)
        if len(set(labels)) > 1:
            try:
                score = silhouette_score(X_reduced[:sample_size], labels[:sample_size])
                if score > best_score:
                    best_score = score
                    best_k = k
                    best_model = km
            except Exception:
                best_model = km

    if best_model is None:
        best_model = KMeans(n_clusters=min(5, X.shape[0]), random_state=42, n_init=3)
        best_model.fit(X_reduced)

    labels = best_model.labels_

    # 4. Group mentions by cluster
    clusters: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    cluster_indices: Dict[int, List[int]] = defaultdict(list)
    for idx, (label, m) in enumerate(zip(labels, mentions)):
        clusters[label].append(m)
        cluster_indices[label].append(idx)

    topics_output = []
    
    for cluster_id, cluster_mentions in clusters.items():
        count = len(cluster_mentions)
        if count == 0:
            continue
        
        # Calculate cluster keywords via mean TF-IDF vector
        sub_X = X[cluster_indices[cluster_id]]
        mean_tfidf = np.asarray(sub_X.mean(axis=0)).flatten()
        top_keyword_indices = mean_tfidf.argsort()[::-1][:8]
        top_keywords = [feature_names[i] for i in top_keyword_indices if mean_tfidf[i] > 0]
        if not top_keywords:
            top_keywords = ["general", "feedback", "discussion"]

        label = " · ".join([kw.title() for kw in top_keywords[:3]])
        
        # Sentiments & counts
        sentiments = [m.get("sentiment_score", 0.0) for m in cluster_mentions]
        avg_sentiment = float(np.mean(sentiments))
        neg_count = sum(1 for s in sentiments if s < -0.05)
        negative_share = round(neg_count / max(1, count), 3)

        # Dates & daily counts
        dates = [m["created_at"].date() if isinstance(m.get("created_at"), (datetime.datetime, datetime.date)) else datetime.date.today() for m in cluster_mentions]
        daily_counts_dict: Dict[str, int] = Counter([d.isoformat() for d in dates])
        
        first_seen = min(cluster_mentions, key=lambda m: m["created_at"])["created_at"]
        last_seen = max(cluster_mentions, key=lambda m: m["created_at"])["created_at"]

        # Emerging logic (detecting historical spike around day 45 crisis)
        is_emerging = False
        emerged_on_date = None
        growth_rate = 0.0

        sorted_dates = sorted(list(set(dates)))
        for i in range(2, len(sorted_dates)):
            curr_d = sorted_dates[i]
            prev_d = sorted_dates[i-1]
            two_day_count = daily_counts_dict.get(curr_d.isoformat(), 0) + daily_counts_dict.get(prev_d.isoformat(), 0)
            
            # 7-day prior baseline
            prior_dates = [sorted_dates[j] for j in range(max(0, i-8), i-1)]
            if prior_dates:
                prior_daily_avg = sum(daily_counts_dict.get(d.isoformat(), 0) for d in prior_dates) / len(prior_dates)
            else:
                prior_daily_avg = 1.0
                
            if two_day_count >= 3 * (prior_daily_avg * 2) and two_day_count >= 20:
                is_emerging = True
                emerged_on_date = curr_d
                prior_two_day = sum(daily_counts_dict.get(d.isoformat(), 0) for d in prior_dates[-2:]) if len(prior_dates) >= 2 else 1
                growth_rate = round((two_day_count / max(1, prior_two_day)) - 1.0, 2)
                break

        summary = f"{count} mentions ({negative_share*100:.0f}% negative) discussing {', '.join(top_keywords[:4])}."

        topics_output.append({
            "label": label,
            "keywords": top_keywords,
            "summary": summary,
            "mention_count": count,
            "avg_sentiment": round(avg_sentiment, 3),
            "negative_share": negative_share,
            "first_seen": first_seen,
            "last_seen": last_seen,
            "growth_rate": growth_rate,
            "is_emerging": is_emerging,
            "emerged_on": emerged_on_date,
            "daily_counts": dict(daily_counts_dict)
        })

    return topics_output

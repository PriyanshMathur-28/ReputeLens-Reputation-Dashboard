import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Text, DateTime, Date,
    ForeignKey, UniqueConstraint, Index, JSON
)
from sqlalchemy.orm import relationship
from backend.app.db import Base


class Brand(Base):
    __tablename__ = "brands"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    keywords = Column(JSON, default=list, nullable=False)
    hashtags = Column(JSON, default=list, nullable=False)
    risk_keywords = Column(JSON, default=list, nullable=False)
    is_primary = Column(Boolean, default=False, nullable=False)
    competitor_ids = Column(JSON, default=list, nullable=False)
    color = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    mentions = relationship("Mention", back_populates="brand", cascade="all, delete-orphan")
    topics = relationship("Topic", back_populates="brand", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="brand", cascade="all, delete-orphan")
    daily_metrics = relationship("DailyMetric", back_populates="brand", cascade="all, delete-orphan")
    response_actions = relationship("ResponseAction", back_populates="brand", cascade="all, delete-orphan")
    annotations = relationship("EventAnnotation", back_populates="brand", cascade="all, delete-orphan")


class Author(Base):
    __tablename__ = "authors"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(50), nullable=False)
    handle = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=False)
    followers = Column(Integer, default=0, nullable=False)
    following = Column(Integer, default=0, nullable=False)
    account_age_days = Column(Integer, default=365, nullable=False)
    post_count = Column(Integer, default=1, nullable=False)
    city = Column(String(100), nullable=True)
    is_verified = Column(Boolean, default=False, nullable=False)

    # Computed SNA fields
    pagerank = Column(Float, default=0.0, nullable=False)
    betweenness = Column(Float, default=0.0, nullable=False)
    in_degree = Column(Integer, default=0, nullable=False)
    out_degree = Column(Integer, default=0, nullable=False)
    community_id = Column(Integer, nullable=True)
    influence_score = Column(Float, default=0.0, nullable=False)
    bot_likelihood = Column(Float, default=0.0, nullable=False)
    role = Column(String(50), default="regular", nullable=False)  # influencer, amplifier, bridge, regular, suspected_bot
    avg_sentiment = Column(Float, default=0.0, nullable=False)

    __table_args__ = (
        UniqueConstraint("source", "handle", name="uq_author_source_handle"),
    )

    mentions = relationship("Mention", back_populates="author", cascade="all, delete-orphan")


class Mention(Base):
    __tablename__ = "mentions"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    source = Column(String(50), nullable=False)  # reddit, youtube, news, hackernews, twitter_csv, review_csv, demo
    external_id = Column(String(255), nullable=False)
    author_id = Column(Integer, ForeignKey("authors.id", ondelete="CASCADE"), nullable=False)
    text = Column(Text, nullable=False)
    clean_text = Column(Text, nullable=False)
    url = Column(String(1000), nullable=True)
    created_at = Column(DateTime, nullable=False, index=True)
    likes = Column(Integer, default=0, nullable=False)
    shares = Column(Integer, default=0, nullable=False)
    replies = Column(Integer, default=0, nullable=False)
    reach_estimate = Column(Integer, default=0, nullable=False)
    language = Column(String(50), default="en", nullable=False)  # en, hi, hinglish, other
    city = Column(String(100), nullable=True)
    rating = Column(Integer, nullable=True)  # 1-5 for reviews
    parent_external_id = Column(String(255), nullable=True)
    mentioned_handles = Column(JSON, default=list, nullable=False)
    hashtags = Column(JSON, default=list, nullable=False)
    text_hash = Column(String(64), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_mention_source_ext_id"),
        Index("ix_mentions_brand_created", "brand_id", "created_at"),
    )

    brand = relationship("Brand", back_populates="mentions")
    author = relationship("Author", back_populates="mentions")
    analysis = relationship("MentionAnalysis", back_populates="mention", uselist=False, cascade="all, delete-orphan")


class MentionAnalysis(Base):
    __tablename__ = "mention_analyses"

    mention_id = Column(Integer, ForeignKey("mentions.id", ondelete="CASCADE"), primary_key=True)
    sentiment_label = Column(String(50), nullable=False, index=True)  # positive, neutral, negative
    sentiment_score = Column(Float, nullable=False)
    vader_compound = Column(Float, nullable=False)
    llm_sentiment_score = Column(Float, nullable=True)
    emotion = Column(String(50), nullable=False)  # joy, anger, fear, sadness, surprise, disgust, trust, neutral
    emotion_scores = Column(JSON, default=dict, nullable=False)
    aspects = Column(JSON, default=list, nullable=False)
    is_sarcastic = Column(Boolean, default=False, nullable=False)
    is_complaint = Column(Boolean, default=False, nullable=False)
    is_purchase_intent = Column(Boolean, default=False, nullable=False)
    is_question = Column(Boolean, default=False, nullable=False)
    toxicity = Column(Float, default=0.0, nullable=False)
    risk_flags = Column(JSON, default=list, nullable=False)
    fake_review_score = Column(Float, nullable=True)
    topic_id = Column(Integer, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True)
    embedding = Column(JSON, nullable=True)
    priority_score = Column(Float, default=0.0, nullable=False)
    analyzed_by = Column(String(50), default="lexicon", nullable=False)  # vader | lexicon | llm | hybrid
    explanation = Column(Text, default="", nullable=False)
    analyzed_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    mention = relationship("Mention", back_populates="analysis")
    topic = relationship("Topic")


class Interaction(Base):
    __tablename__ = "interactions"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    source_author_id = Column(Integer, ForeignKey("authors.id", ondelete="CASCADE"), nullable=False)
    target_author_id = Column(Integer, ForeignKey("authors.id", ondelete="CASCADE"), nullable=False)
    mention_id = Column(Integer, ForeignKey("mentions.id", ondelete="CASCADE"), nullable=True)
    type = Column(String(50), nullable=False)  # reply, mention, share, quote
    weight = Column(Float, default=1.0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String(255), nullable=False)
    keywords = Column(JSON, default=list, nullable=False)
    summary = Column(Text, nullable=False)
    mention_count = Column(Integer, default=0, nullable=False)
    avg_sentiment = Column(Float, default=0.0, nullable=False)
    negative_share = Column(Float, default=0.0, nullable=False)
    first_seen = Column(DateTime, nullable=True)
    last_seen = Column(DateTime, nullable=True)
    growth_rate = Column(Float, default=0.0, nullable=False)
    is_emerging = Column(Boolean, default=False, nullable=False)
    emerged_on = Column(Date, nullable=True)
    daily_counts = Column(JSON, default=dict, nullable=False)
    computed_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    brand = relationship("Brand", back_populates="topics")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(100), nullable=False)  # negative_spike, volume_spike, emerging_narrative, influencer_negative, coordinated_activity, score_drop, risk_keyword
    severity = Column(String(50), nullable=False)  # low, medium, high, critical
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    metric_value = Column(Float, default=0.0, nullable=False)
    threshold = Column(Float, default=0.0, nullable=False)
    evidence_mention_ids = Column(JSON, default=list, nullable=False)
    related_topic_id = Column(Integer, nullable=True)
    related_author_ids = Column(JSON, default=list, nullable=False)
    status = Column(String(50), default="open", nullable=False)  # open, acknowledged, resolved
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    brand = relationship("Brand", back_populates="alerts")


class DailyMetric(Base):
    __tablename__ = "daily_metrics"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    volume = Column(Integer, default=0, nullable=False)
    positive = Column(Integer, default=0, nullable=False)
    neutral = Column(Integer, default=0, nullable=False)
    negative = Column(Integer, default=0, nullable=False)
    net_sentiment = Column(Float, default=0.0, nullable=False)
    avg_sentiment = Column(Float, default=0.0, nullable=False)
    share_of_voice = Column(Float, default=0.0, nullable=False)
    engagement = Column(Integer, default=0, nullable=False)
    reach = Column(Integer, default=0, nullable=False)
    influencer_sentiment = Column(Float, default=0.0, nullable=False)
    health_score = Column(Float, default=50.0, nullable=False)
    health_components = Column(JSON, default=dict, nullable=False)
    crisis_risk = Column(Float, default=0.0, nullable=False)
    crisis_components = Column(JSON, default=dict, nullable=False)

    __table_args__ = (
        UniqueConstraint("brand_id", "date", name="uq_daily_metric_brand_date"),
    )

    brand = relationship("Brand", back_populates="daily_metrics")


class ResponseAction(Base):
    __tablename__ = "response_actions"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    alert_id = Column(Integer, nullable=True)
    topic_id = Column(Integer, nullable=True)
    action_type = Column(String(100), nullable=False)  # public_statement, reply, influencer_outreach, product_fix, other
    description = Column(Text, nullable=False)
    responded_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    brand = relationship("Brand", back_populates="response_actions")


class EventAnnotation(Base):
    __tablename__ = "event_annotations"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    kind = Column(String(50), nullable=False)  # launch, campaign, incident, response, other

    brand = relationship("Brand", back_populates="annotations")


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    content_markdown = Column(Text, nullable=False)
    generated_by = Column(String(50), default="template", nullable=False)  # llm | template
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class LLMCache(Base):
    __tablename__ = "llm_cache"

    key = Column(String(64), primary_key=True)  # sha256
    task = Column(String(100), nullable=False)
    response = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True)  # uuid
    type = Column(String(100), nullable=False)
    status = Column(String(50), default="queued", nullable=False)  # queued, running, done, failed
    progress = Column(Integer, default=0, nullable=False)
    message = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    finished_at = Column(DateTime, nullable=True)

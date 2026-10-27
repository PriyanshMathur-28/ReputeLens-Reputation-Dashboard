from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field
import datetime


class ErrorResponse(BaseModel):
    error: Dict[str, str]


class HealthResponse(BaseModel):
    status: str = "ok"


class SystemStatusResponse(BaseModel):
    provider: str
    model: str = "offline"
    connectors: List[str]
    mention_count: int
    last_ingestion: Optional[str] = None


class BrandBase(BaseModel):
    name: str
    keywords: List[str] = []
    hashtags: List[str] = []
    risk_keywords: List[str] = []
    is_primary: bool = False
    competitor_ids: List[int] = []
    color: str = "#6366F1"


class BrandCreate(BrandBase):
    pass


class BrandOut(BrandBase):
    id: int
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class AuthorOut(BaseModel):
    id: int
    source: str
    handle: str
    display_name: str
    followers: int
    following: int
    account_age_days: int
    post_count: int
    city: Optional[str] = None
    is_verified: bool
    pagerank: float
    betweenness: float
    in_degree: int
    out_degree: int
    community_id: Optional[int] = None
    influence_score: float
    bot_likelihood: float
    role: str
    avg_sentiment: float

    class Config:
        from_attributes = True


class AspectItem(BaseModel):
    aspect: str
    sentiment: str
    score: float
    evidence: str


class MentionAnalysisOut(BaseModel):
    sentiment_label: str
    sentiment_score: float
    vader_compound: float
    llm_sentiment_score: Optional[float] = None
    emotion: str
    emotion_scores: Dict[str, float] = {}
    aspects: List[AspectItem] = []
    is_sarcastic: bool = False
    is_complaint: bool = False
    is_purchase_intent: bool = False
    is_question: bool = False
    toxicity: float = 0.0
    risk_flags: List[str] = []
    fake_review_score: Optional[float] = None
    topic_id: Optional[int] = None
    priority_score: float = 0.0
    analyzed_by: str
    explanation: str

    class Config:
        from_attributes = True


class MentionOut(BaseModel):
    id: int
    brand_id: int
    source: str
    external_id: str
    author_id: int
    author_handle: Optional[str] = None
    text: str
    clean_text: str
    url: Optional[str] = None
    created_at: datetime.datetime
    likes: int
    shares: int
    replies: int
    reach_estimate: int
    language: str
    city: Optional[str] = None
    rating: Optional[int] = None
    hashtags: List[str] = []
    sentiment: Optional[str] = None
    sentiment_score: Optional[float] = None
    emotion: Optional[str] = None
    aspects: List[str] = []
    priority_score: float = 0.0
    risk_flags: List[str] = []
    suspicious: bool = False
    is_sarcastic: bool = False
    is_complaint: bool = False

    class Config:
        from_attributes = True


class MentionDetailOut(MentionOut):
    analysis: Optional[MentionAnalysisOut] = None
    author: Optional[AuthorOut] = None


class MentionsPageOut(BaseModel):
    items: List[MentionOut]
    page: int
    page_size: int
    total: int


class KPICard(BaseModel):
    value: Union[int, float]
    delta_pct: float = 0.0


class HealthComponents(BaseModel):
    net_sentiment: float = 50.0
    trend: float = 50.0
    crisis_safety: float = 100.0
    influencer_sentiment: float = 50.0
    share_of_voice: float = 50.0


class HealthScoreOut(BaseModel):
    score: float
    delta: float = 0.0
    components: HealthComponents


class CrisisComponents(BaseModel):
    spike: float = 0.0
    narrative: float = 0.0
    influencer: float = 0.0
    coordinated: float = 0.0
    risk_keywords: float = 0.0


class CrisisRiskOut(BaseModel):
    risk: float
    band: str  # Low, Elevated, High, Critical
    components: CrisisComponents


class OverviewOut(BaseModel):
    brand_id: int
    brand_name: str
    period: Dict[str, Any]
    kpis: Dict[str, KPICard]
    health: HealthScoreOut
    crisis: CrisisRiskOut
    llm: Dict[str, str] = {"provider": "offline"}


class SentimentPoint(BaseModel):
    date: str
    volume: int
    positive: int
    neutral: int
    negative: int
    net_sentiment: float
    health_score: float
    crisis_risk: float
    event: Optional[str] = None


class ForecastPoint(BaseModel):
    date: str
    forecast: float
    lower: float
    upper: float


class AlertOut(BaseModel):
    id: int
    brand_id: int
    type: str
    severity: str
    title: str
    description: str
    status: str
    created_at: datetime.datetime
    metric_value: float
    threshold: float
    evidence_ids: List[int] = []
    evidence: List[MentionOut] = []

    class Config:
        from_attributes = True


class AlertUpdate(BaseModel):
    status: str  # open, acknowledged, resolved


class TopicOut(BaseModel):
    id: int
    label: str
    summary: str
    keywords: List[str]
    mention_count: int
    avg_sentiment: float
    negative_share: float
    growth_rate: float
    is_emerging: bool
    emerged_on: Optional[str] = None

    class Config:
        from_attributes = True


class NetworkNode(BaseModel):
    id: int
    handle: str
    followers: int
    influence_score: float
    community_id: Optional[int] = None
    role: str
    avg_sentiment: float
    bot_likelihood: float


class NetworkLink(BaseModel):
    source: int
    target: int
    weight: float
    type: str


class NetworkGraphOut(BaseModel):
    nodes: List[NetworkNode]
    links: List[NetworkLink]


class AskReputeLensRequest(BaseModel):
    brand_id: int
    question: str


class AskReputeLensResponse(BaseModel):
    answer_markdown: str
    citations: List[MentionOut]
    facts_used: List[str]
    suggested_followups: List[str]
    provider: str = "offline"


class ExplainSpikeRequest(BaseModel):
    brand_id: int
    date: str


class ExplainSpikeResponse(BaseModel):
    headline: str
    what_happened: str
    main_drivers: List[str]
    who_drove_it: List[str]
    is_organic: str  # organic | coordinated | mixed
    recommended_next_step: str


class SimulateRequest(BaseModel):
    brand_id: int
    steps: int = 10
    runs: int = 200
    seed: str = "negative_influencers"


class SimulateScenario(BaseModel):
    scenario: str
    steps: List[float]
    expected_reach: float


class SimulateResponse(BaseModel):
    series: List[SimulateScenario]


class ResponseActionCreate(BaseModel):
    brand_id: int
    action_type: str
    description: str
    responded_at: str


class ResponseActionOut(BaseModel):
    id: int
    brand_id: int
    action_type: str
    description: str
    responded_at: datetime.datetime
    before_sentiment: float
    after_sentiment: float
    before_negative_per_day: float
    after_negative_per_day: float
    verdict: str

    class Config:
        from_attributes = True


class AnnotationCreate(BaseModel):
    brand_id: int
    date: str
    title: str
    description: str
    kind: str


class AnnotationOut(BaseModel):
    id: int
    brand_id: int
    date: datetime.date
    title: str
    description: str
    kind: str

    class Config:
        from_attributes = True


class EvaluationModelMetrics(BaseModel):
    model: str
    accuracy: float
    precision: float
    recall: float
    f1: float


class EvaluationOut(BaseModel):
    models: List[EvaluationModelMetrics]
    sarcasm_accuracy: float
    hinglish_accuracy: float
    labeled_count: int


class JobStatusOut(BaseModel):
    id: str
    type: str
    status: str
    progress: int
    message: str
    created_at: datetime.datetime
    finished_at: Optional[datetime.datetime] = None

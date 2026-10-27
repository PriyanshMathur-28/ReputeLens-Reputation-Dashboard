import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { providerName } from "../../lib/llm.js";
import {
  GetAlertsQueryParams,
  GetAlertsResponse,
  GetBrandsResponse,
  GetCompetitorBenchmarkResponse,
  GetGeographyQueryParams,
  GetGeographyResponse,
  GetMentionsQueryParams,
  GetMentionsResponse,
  GetNetworkGraphQueryParams,
  GetNetworkGraphResponse,
  GetOverviewQueryParams,
  GetOverviewResponse,
  GetSentimentTimeseriesQueryParams,
  GetSentimentTimeseriesResponse,
  GetSystemStatusResponse,
  GetTopicsQueryParams,
  GetTopicsResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  alertsTable,
  authorsTable,
  brandsTable,
  interactionsTable,
  mentionsTable,
  topicsTable,
} from "@workspace/db";
import {
  getDailySeries,
  getPrimaryBrandId,
  getMentionsSince,
  loadAnalytics,
  type DailyMetrics,
  type JoinedMention,
} from "../../lib/reputation-metrics";

const router: IRouter = Router();

function dateAtStart(daysAgo: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date;
}

function toMention(row: JoinedMention) {
  const mention = row.mention;
  return {
    id: mention.id,
    brand_id: mention.brandId,
    text: mention.text,
    author: row.author.handle,
    source: mention.source,
    created_at: mention.createdAt.toISOString(),
    sentiment: mention.sentimentLabel,
    sentiment_score: mention.sentimentScore,
    emotion: mention.emotion,
    aspects: mention.aspects,
    priority_score: mention.priorityScore,
    risk_flags: mention.riskFlags,
    language: mention.language,
    city: mention.city,
    suspicious: mention.suspicious,
    is_sarcastic: mention.isSarcastic,
    is_complaint: mention.isComplaint,
    reach_estimate: mention.reachEstimate,
  };
}

function summarize(rows: JoinedMention[]) {
  const positive = rows.filter((row) => row.mention.sentimentLabel === "positive").length;
  const negative = rows.filter((row) => row.mention.sentimentLabel === "negative").length;
  const volume = rows.length;
  return {
    volume,
    positive,
    negative,
    neutral: volume - positive - negative,
    net: ((positive - negative) / Math.max(1, volume)) * 100,
    sentiment: rows.reduce((sum, row) => sum + row.mention.sentimentScore, 0) / Math.max(1, volume),
    reach: rows.reduce((sum, row) => sum + row.mention.reachEstimate, 0),
  };
}

router.get("/system/status", async (_req, res): Promise<void> => {
  const [brands, mentionCount, latest] = await Promise.all([
    db.select({ id: brandsTable.id }).from(brandsTable),
    db.select({ id: mentionsTable.id }).from(mentionsTable),
    db.select({ createdAt: mentionsTable.createdAt }).from(mentionsTable).orderBy(desc(mentionsTable.createdAt)).limit(1),
  ]);
  const connectors = [
    "Google News RSS",
    "Hacker News",
    ...(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET ? ["Reddit"] : []),
    ...(process.env.YOUTUBE_API_KEY ? ["YouTube"] : []),
  ];
  res.json(GetSystemStatusResponse.parse({
    provider: providerName(),
    mention_count: mentionCount.length,
    last_ingestion: latest[0]?.createdAt?.toISOString() ?? null,
    connectors,
  }));
  void brands;
});

router.get("/brands", async (_req, res): Promise<void> => {
  const brands = await db.select().from(brandsTable).orderBy(brandsTable.id);
  res.json(GetBrandsResponse.parse(brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    color: brand.color,
    is_primary: brand.isPrimary,
  }))));
});

router.get("/overview", async (req, res): Promise<void> => {
  const params = GetOverviewQueryParams.parse(req.query);
  const brandId = params.brand_id ?? await getPrimaryBrandId();
  const days = params.days ?? 30;
  const end = dateAtStart(0);
  const currentStart = dateAtStart(days - 1);
  const previousStart = dateAtStart(days * 2 - 1);
  const allRows = await getMentionsSince(previousStart);
  const currentRows = allRows.filter((row) => row.mention.brandId === brandId && row.mention.createdAt >= currentStart && row.mention.createdAt <= new Date(end.getTime() + 86_399_999));
  const previousRows = allRows.filter((row) => row.mention.brandId === brandId && row.mention.createdAt >= previousStart && row.mention.createdAt < currentStart);
  const otherCurrent = allRows.filter((row) => row.mention.createdAt >= currentStart && row.mention.createdAt <= new Date(end.getTime() + 86_399_999));
  const current = summarize(currentRows);
  const previous = summarize(previousRows);
  const shareOfVoice = current.volume / Math.max(1, otherCurrent.length);
  const previousShare = previous.volume / Math.max(
    1,
    allRows.filter((row) => row.mention.createdAt >= previousStart && row.mention.createdAt < currentStart).length,
  );
  const series = await getDailySeries(brandId);
  const last = series.at(-1);
  const previousHealth = series[Math.max(0, series.length - 8)];
  const [brand, alertRows] = await Promise.all([
    db.select().from(brandsTable).where(eq(brandsTable.id, brandId)).limit(1),
    db.select({ id: alertsTable.id }).from(alertsTable).where(and(eq(alertsTable.brandId, brandId), eq(alertsTable.status, "open"))),
  ]);
  const delta = (now: number, before: number) => before === 0 ? 0 : ((now - before) / Math.abs(before)) * 100;
  const result = {
    brand_id: brandId,
    brand_name: brand[0]?.name ?? "Zentro Foods",
    period: { days },
    health: {
      score: last?.healthScore ?? 0,
      delta: (last?.healthScore ?? 0) - (previousHealth?.healthScore ?? 0),
      components: last?.healthComponents ?? {},
    },
    crisis: {
      risk: last?.crisisRisk ?? 0,
      band: (last?.crisisRisk ?? 0) >= 75 ? "Critical" : (last?.crisisRisk ?? 0) >= 50 ? "High" : (last?.crisisRisk ?? 0) >= 25 ? "Elevated" : "Low",
      components: last?.crisisComponents ?? {},
    },
    kpis: {
      mentions: { value: current.volume, delta_pct: delta(current.volume, previous.volume) },
      net_sentiment: { value: Math.round(current.net * 10) / 10, delta_pct: delta(current.net, previous.net) },
      share_of_voice: { value: Math.round(shareOfVoice * 1000) / 1000, delta_pct: delta(shareOfVoice, previousShare) },
      reach: { value: current.reach, delta_pct: delta(current.reach, previous.reach) },
      open_alerts: { value: alertRows.length, delta_pct: 0 },
    },
  };
  res.json(GetOverviewResponse.parse(result));
});

router.get("/timeseries/sentiment", async (req, res): Promise<void> => {
  const params = GetSentimentTimeseriesQueryParams.parse(req.query);
  const days = params.days ?? 30;
  const brandId = params.brand_id ?? await getPrimaryBrandId();
  const series = await getDailySeries(brandId);
  const selected = series.slice(-days).map((item) => ({
    date: item.date,
    volume: item.volume,
    positive: item.positive,
    neutral: item.neutral,
    negative: item.negative,
    net_sentiment: item.netSentiment,
    health_score: item.healthScore,
    crisis_risk: item.crisisRisk,
    event: item.event,
  }));
  res.json(GetSentimentTimeseriesResponse.parse(selected));
});

router.get("/mentions", async (req, res): Promise<void> => {
  const params = GetMentionsQueryParams.parse(req.query);
  const brandId = params.brand_id ?? await getPrimaryBrandId();
  const page = params.page ?? 1;
  const pageSize = params.page_size ?? 25;
  const since = dateAtStart(59);
  let rows = await getMentionsSince(since, brandId);
  if (params.sentiment) rows = rows.filter((row) => row.mention.sentimentLabel === params.sentiment);
  if (params.aspect) rows = rows.filter((row) => row.mention.aspects.includes(params.aspect!));
  if (params.q) {
    const query = params.q.toLowerCase();
    rows = rows.filter((row) => row.mention.text.toLowerCase().includes(query) || row.author.handle.toLowerCase().includes(query));
  }
  rows.sort((a, b) => params.sort === "date"
    ? b.mention.createdAt.getTime() - a.mention.createdAt.getTime()
    : b.mention.priorityScore - a.mention.priorityScore);
  const total = rows.length;
  const offset = (page - 1) * pageSize;
  res.json(GetMentionsResponse.parse({
    items: rows.slice(offset, offset + pageSize).map(toMention),
    page,
    page_size: pageSize,
    total,
  }));
});

router.get("/topics", async (req, res): Promise<void> => {
  const params = GetTopicsQueryParams.parse(req.query);
  const brandId = params.brand_id ?? await getPrimaryBrandId();
  const topics = await db.select().from(topicsTable).where(eq(topicsTable.brandId, brandId));
  res.json(GetTopicsResponse.parse(topics.map((topic) => ({
    id: topic.id,
    label: topic.label,
    summary: topic.summary,
    mention_count: topic.mentionCount,
    avg_sentiment: topic.avgSentiment,
    negative_share: topic.negativeShare,
    growth_rate: topic.growthRate,
    is_emerging: topic.isEmerging || Boolean(topic.emergedOn),
    emerged_on: topic.emergedOn,
    keywords: topic.keywords,
  }))));
});

router.get("/alerts", async (req, res): Promise<void> => {
  const params = GetAlertsQueryParams.parse(req.query);
  const brandId = params.brand_id ?? await getPrimaryBrandId();
  const alertRows = await db.select().from(alertsTable).where(eq(alertsTable.brandId, brandId)).orderBy(desc(alertsTable.createdAt));
  const filtered = params.status ? alertRows.filter((alert) => alert.status === params.status) : alertRows;
  const evidenceRows = await getMentionsSince(dateAtStart(59), brandId);
  const byId = new Map<number, JoinedMention>(evidenceRows.map((row) => [row.mention.id, row]));
  res.json(GetAlertsResponse.parse(filtered.map((alert) => ({
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    status: alert.status,
    created_at: alert.createdAt.toISOString(),
    metric_value: alert.metricValue,
    threshold: alert.threshold,
    evidence: alert.evidenceIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toMention(row)] : [];
    }),
  }))));
});

router.get("/network/graph", async (req, res): Promise<void> => {
  const params = GetNetworkGraphQueryParams.parse(req.query);
  const brandId = params.brand_id ?? await getPrimaryBrandId();
  const limit = params.limit ?? 200;
  const authors = await db.select().from(authorsTable).orderBy(desc(authorsTable.influenceScore)).limit(limit);
  const ids = new Set(authors.map((author) => author.id));
  const interactions = await db.select().from(interactionsTable).where(eq(interactionsTable.brandId, brandId));
  const links = interactions.filter((link) => ids.has(link.sourceAuthorId) && ids.has(link.targetAuthorId)).slice(0, 2400);
  const response = {
    nodes: authors.map((author) => ({
      id: author.id,
      handle: author.handle,
      followers: author.followers,
      influence_score: author.influenceScore,
      sentiment: author.avgSentiment,
      community: author.communityId,
      role: author.role,
      bot_likelihood: author.botLikelihood,
    })),
    links: links.map((link) => ({ source: link.sourceAuthorId, target: link.targetAuthorId, weight: link.weight })),
    coordinated_accounts: authors.filter((author) => author.botLikelihood >= 0.5).length,
  };
  res.json(GetNetworkGraphResponse.parse(response));
});

router.get("/competitors/benchmark", async (_req, res): Promise<void> => {
  const snapshot = await loadAnalytics();
  const rows = await getMentionsSince(dateAtStart(29));
  const totals = rows.length;
  const response = await Promise.all(snapshot.brands.map(async (brand) => {
    const brandRows = rows.filter((row) => row.mention.brandId === brand.id);
    const summary = summarize(brandRows);
    const series: DailyMetrics[] = await getDailySeries(brand.id);
    const end = series.at(-1);
    return {
      brand_id: brand.id,
      name: brand.name,
      color: brand.color,
      volume: summary.volume,
      net_sentiment: Math.round(summary.net * 10) / 10,
      share_of_voice: summary.volume / Math.max(1, totals),
      health_score: end?.healthScore ?? 0,
      suspicious_reviews: brandRows.filter((row) => row.mention.suspicious).length,
    };
  }));
  res.json(GetCompetitorBenchmarkResponse.parse(response));
});

router.get("/geography", async (req, res): Promise<void> => {
  const params = GetGeographyQueryParams.parse(req.query);
  const brandId = params.brand_id ?? await getPrimaryBrandId();
  const rows = await getMentionsSince(dateAtStart(59), brandId);
  const previousStart = dateAtStart(59);
  previousStart.setUTCDate(previousStart.getUTCDate() - 60);
  const previous = await getMentionsSince(previousStart, brandId);
  const currentByCity = new Map<string, JoinedMention[]>();
  const previousByCity = new Map<string, JoinedMention[]>();
  for (const row of rows) {
    const city = row.mention.city ?? "Unknown";
    const cityRows = currentByCity.get(city) ?? [];
    cityRows.push(row);
    currentByCity.set(city, cityRows);
  }
  for (const row of previous) {
    if (row.mention.createdAt >= dateAtStart(59)) continue;
    const city = row.mention.city ?? "Unknown";
    const cityRows = previousByCity.get(city) ?? [];
    cityRows.push(row);
    previousByCity.set(city, cityRows);
  }
  const response = Array.from(currentByCity.entries()).map(([city, cityRows]) => {
    const summary = summarize(cityRows);
    const oldRows = previousByCity.get(city) ?? [];
    const oldVolume = oldRows.length;
    return {
      city,
      volume: summary.volume,
      net_sentiment: Math.round(summary.net * 10) / 10,
      top_negative_aspect: cityRows
        .filter((row) => row.mention.sentimentLabel === "negative")
        .flatMap((row) => row.mention.aspects)
        .reduce<string>((top, aspect, _index, all) => all.filter((value) => value === aspect).length > all.filter((value) => value === top).length ? aspect : top, "delivery"),
      delta_pct: oldVolume ? ((summary.volume - oldVolume) / oldVolume) * 100 : 0,
    };
  }).sort((a, b) => b.volume - a.volume);
  res.json(GetGeographyResponse.parse(response));
});

export default router;

import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  alertsTable,
  annotationsTable,
  authorsTable,
  brandsTable,
  mentionsTable,
  topicsTable,
} from "@workspace/db";

const WINDOW_DAYS = 60;
const HEALTH_WEIGHTS = {
  netSentiment: 0.35,
  trend: 0.15,
  crisisSafety: 0.2,
  influencerSentiment: 0.15,
  shareOfVoice: 0.15,
};

export type DailyMetrics = {
  date: string;
  volume: number;
  positive: number;
  neutral: number;
  negative: number;
  netSentiment: number;
  avgSentiment: number;
  shareOfVoice: number;
  reach: number;
  engagement: number;
  influencerSentiment: number;
  riskMentions: number;
  negativeInfluencerMentions: number;
  coordinatedAuthors: number;
  healthScore: number;
  crisisRisk: number;
  healthComponents: Record<string, number>;
  crisisComponents: Record<string, number>;
  event: string | null;
};

export type JoinedMention = {
  mention: typeof mentionsTable.$inferSelect;
  author: typeof authorsTable.$inferSelect;
};

export type AnalyticsSnapshot = {
  brands: typeof brandsTable.$inferSelect[];
  authors: typeof authorsTable.$inferSelect[];
  mentions: JoinedMention[];
  daily: DailyMetrics[];
  topics: typeof topicsTable.$inferSelect[];
  alerts: typeof alertsTable.$inferSelect[];
  annotations: typeof annotationsTable.$inferSelect[];
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function netSentiment(positive: number, negative: number, volume: number): number {
  return ((positive - negative) / Math.max(1, volume)) * 100;
}

function linearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const xMean = (values.length - 1) / 2;
  const yMean = average(values);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    numerator += (index - xMean) * (values[index]! - yMean);
    denominator += (index - xMean) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

function dateRangeDays(count: number): string[] {
  const start = daysAgo(count - 1);
  return Array.from({ length: count }, (_, index) => {
    const value = new Date(start);
    value.setUTCDate(value.getUTCDate() + index);
    return isoDate(value);
  });
}

/**
 * Computes a reputation health score from the trailing seven-day components.
 * The formula normalizes net sentiment, trend, crisis safety, influencer
 * sentiment, and share of voice before applying their documented weights.
 */
function computeHealthScore(
  trailing: DailyMetrics[],
  fairShare: number,
): { score: number; components: Record<string, number> } {
  const volume = trailing.reduce((sum, day) => sum + day.volume, 0);
  const positive = trailing.reduce((sum, day) => sum + day.positive, 0);
  const negative = trailing.reduce((sum, day) => sum + day.negative, 0);
  const c1 = clamp((netSentiment(positive, negative, volume) + 100) / 2, 0, 100);
  const c2 = clamp(50 + 500 * linearSlope(trailing.map((day) => day.avgSentiment)), 0, 100);
  const c3 = 100 - average(trailing.map((day) => day.crisisRisk));
  const c4 = clamp((average(trailing.map((day) => day.influencerSentiment)) + 1) * 50, 0, 100);
  const c5 = clamp(
    100 * average(trailing.map((day) => day.shareOfVoice)) / Math.max(fairShare, 0.0001),
    0,
    100,
  );
  const components = {
    net_sentiment: Math.round(c1 * 10) / 10,
    trend: Math.round(c2 * 10) / 10,
    crisis_safety: Math.round(c3 * 10) / 10,
    influencer_sentiment: Math.round(c4 * 10) / 10,
    share_of_voice: Math.round(c5 * 10) / 10,
  };
  const score =
    HEALTH_WEIGHTS.netSentiment * c1 +
    HEALTH_WEIGHTS.trend * c2 +
    HEALTH_WEIGHTS.crisisSafety * c3 +
    HEALTH_WEIGHTS.influencerSentiment * c4 +
    HEALTH_WEIGHTS.shareOfVoice * c5;
  return { score: Math.round(score * 10) / 10, components };
}

/**
 * Computes daily crisis risk using a trailing 14-day negative-volume z-score
 * and adds narrative, influencer, coordination, and watchlist signals.
 */
function computeCrisisRisk(
  dayIndex: number,
  daily: DailyMetrics[],
  emergingDates: Set<string>,
): { score: number; components: Record<string, number> } {
  const day = daily[dayIndex]!;
  const previous = daily.slice(Math.max(0, dayIndex - 14), dayIndex).map((item) => item.negative);
  const mean = average(previous);
  const std = previous.length > 1
    ? Math.sqrt(average(previous.map((value) => (value - mean) ** 2)))
    : 1;
  const z = (day.negative - mean) / Math.max(std, 1);
  const components = {
    spike: clamp(20 * z, 0, 50),
    narrative: emergingDates.has(day.date) ? 15 : 0,
    influencer: day.negativeInfluencerMentions > 0 ? 15 : 0,
    coordinated: day.coordinatedAuthors >= 5 ? 10 : 0,
    risk_keywords: day.riskMentions >= 10 ? 10 : 0,
  };
  return {
    score: Math.min(100, Math.round(Object.values(components).reduce((sum, value) => sum + value, 0))),
    components,
  };
}

/**
 * Reads the stored demo/import data and recomputes daily metrics from mention
 * records. These outputs are deliberately not stored as hardcoded UI values.
 */
export async function loadAnalytics(): Promise<AnalyticsSnapshot> {
  const since = daysAgo(WINDOW_DAYS - 1);
  const [brands, authorRows, mentionRows, topics, alerts, annotations] = await Promise.all([
    db.select().from(brandsTable).orderBy(asc(brandsTable.id)),
    db.select().from(authorsTable),
    db.select().from(mentionsTable).where(gte(mentionsTable.createdAt, since)).orderBy(asc(mentionsTable.createdAt)),
    db.select().from(topicsTable),
    db.select().from(alertsTable).orderBy(asc(alertsTable.createdAt)),
    db.select().from(annotationsTable),
  ]);
  const authorById = new Map(authorRows.map((author) => [author.id, author]));
  const mentions: JoinedMention[] = mentionRows.flatMap((mention) => {
    const author = authorById.get(mention.authorId);
    return author ? [{ mention, author }] : [];
  });
  const dates = dateRangeDays(WINDOW_DAYS);
  const allBrandsByDate = new Map<string, number>();
  const base = new Map<string, DailyMetrics>();
  const mentionsByBrandDay = new Map<string, JoinedMention[]>();
  for (const date of dates) {
    for (const brand of brands) {
      const dailyKey = `${brand.id}:${date}`;
      base.set(dailyKey, {
        date,
        volume: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
        netSentiment: 0,
        avgSentiment: 0,
        shareOfVoice: 0,
        reach: 0,
        engagement: 0,
        influencerSentiment: 0,
        riskMentions: 0,
        negativeInfluencerMentions: 0,
        coordinatedAuthors: 0,
        healthScore: 0,
        crisisRisk: 0,
        healthComponents: {},
        crisisComponents: {},
        event: null,
      });
    }
  }
  for (const row of mentions) {
    const date = isoDate(row.mention.createdAt);
    const key = `${row.mention.brandId}:${date}`;
    const day = base.get(key);
    if (!day) continue;
    day.volume += 1;
    if (row.mention.sentimentLabel === "positive") day.positive += 1;
    else if (row.mention.sentimentLabel === "negative") day.negative += 1;
    else day.neutral += 1;
    day.avgSentiment += row.mention.sentimentScore;
    day.reach += row.mention.reachEstimate;
    day.engagement += Math.round(row.mention.reachEstimate / 3);
    if (row.author.role === "influencer") {
      day.influencerSentiment += row.mention.sentimentScore;
      if (row.mention.sentimentScore <= -0.5) day.negativeInfluencerMentions += 1;
    }
    if (row.mention.riskFlags.length > 0) day.riskMentions += 1;
    if (row.author.botLikelihood >= 0.5) day.coordinatedAuthors += 1;
    const list = mentionsByBrandDay.get(key) ?? [];
    list.push(row);
    mentionsByBrandDay.set(key, list);
    allBrandsByDate.set(date, (allBrandsByDate.get(date) ?? 0) + 1);
  }
  for (const brand of brands) {
    for (const date of dates) {
      const key = `${brand.id}:${date}`;
      const day = base.get(key)!;
      const allVolume = allBrandsByDate.get(date) ?? 0;
      day.netSentiment = netSentiment(day.positive, day.negative, day.volume);
      day.avgSentiment = day.volume ? day.avgSentiment / day.volume : 0;
      day.influencerSentiment = day.volume
        ? day.influencerSentiment / Math.max(1, (mentionsByBrandDay.get(key) ?? []).filter((item) => item.author.role === "influencer").length)
        : 0;
      day.shareOfVoice = allVolume ? day.volume / allVolume : 0;
    }
  }
  for (const annotation of annotations) {
    for (const day of brands.filter((brand) => brand.id === annotation.brandId)) {
      const metric = base.get(`${day.id}:${annotation.date}`);
      if (metric) metric.event = annotation.title;
    }
  }

  const dailyByBrand = new Map<number, DailyMetrics[]>();
  for (const brand of brands) {
    const series = dates.map((date) => base.get(`${brand.id}:${date}`)!);
    const emergingDates = new Set<string>();
    for (const topic of topics.filter((item) => item.brandId === brand.id && item.negativeShare >= 0.6 && item.emergedOn)) {
      const emerged = topic.emergedOn!;
      const end = new Date(`${emerged}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      for (const date of dates) if (date >= emerged && date <= isoDate(end)) emergingDates.add(date);
    }
    for (let index = 0; index < series.length; index += 1) {
      const risk = computeCrisisRisk(index, series, emergingDates);
      series[index]!.crisisRisk = risk.score;
      series[index]!.crisisComponents = risk.components;
      const health = computeHealthScore(series.slice(Math.max(0, index - 6), index + 1), 1 / Math.max(brands.length, 1));
      series[index]!.healthScore = health.score;
      series[index]!.healthComponents = health.components;
    }
    dailyByBrand.set(brand.id, series);
  }
  const primaryBrand = brands.find((brand) => brand.isPrimary) ?? brands[0];
  return {
    brands,
    authors: authorRows,
    mentions,
    daily: primaryBrand ? dailyByBrand.get(primaryBrand.id) ?? [] : [],
    topics,
    alerts,
    annotations,
  };
}

export async function getDailySeries(brandId: number): Promise<DailyMetrics[]> {
  const snapshot = await loadAnalytics();
  const brand = snapshot.brands.find((item) => item.id === brandId) ?? snapshot.brands[0];
  if (!brand) return [];
  // Calculate the requested brand on the same source rows as the default series.
  const days = dateRangeDays(WINDOW_DAYS);
  const entries = new Map<string, DailyMetrics>(days.map((date) => [date, {
    date,
    volume: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    netSentiment: 0,
    avgSentiment: 0,
    shareOfVoice: 0,
    reach: 0,
    engagement: 0,
    influencerSentiment: 0,
    riskMentions: 0,
    negativeInfluencerMentions: 0,
    coordinatedAuthors: 0,
    healthScore: 0,
    crisisRisk: 0,
    healthComponents: {},
    crisisComponents: {},
    event: null,
    } satisfies DailyMetrics]));
  const brands = snapshot.brands;
  const allVolume = new Map<string, number>();
  for (const row of snapshot.mentions) {
    const date = isoDate(row.mention.createdAt);
    allVolume.set(date, (allVolume.get(date) ?? 0) + 1);
    if (row.mention.brandId !== brand.id) continue;
    const day = entries.get(date);
    if (!day) continue;
    day.volume += 1;
    if (row.mention.sentimentLabel === "positive") day.positive += 1;
    else if (row.mention.sentimentLabel === "negative") day.negative += 1;
    else day.neutral += 1;
    day.avgSentiment += row.mention.sentimentScore;
    day.reach += row.mention.reachEstimate;
    if (row.author.role === "influencer") {
      day.influencerSentiment += row.mention.sentimentScore;
      if (row.mention.sentimentScore <= -0.5) day.negativeInfluencerMentions += 1;
    }
    if (row.mention.riskFlags.length) day.riskMentions += 1;
    if (row.author.botLikelihood >= 0.5) day.coordinatedAuthors += 1;
  }
  const emergingDates = new Set<string>();
  for (const topic of snapshot.topics.filter((item) => item.brandId === brand.id && item.negativeShare >= 0.6 && item.emergedOn)) {
    const end = new Date(`${topic.emergedOn}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    for (const date of days) if (date >= topic.emergedOn! && date <= isoDate(end)) emergingDates.add(date);
  }
  for (const annotation of snapshot.annotations.filter((item) => item.brandId === brand.id)) {
    const daily = entries.get(annotation.date);
    if (daily) daily.event = annotation.title;
  }
  const series = days.map((date) => {
    const day = entries.get(date)!;
    day.netSentiment = netSentiment(day.positive, day.negative, day.volume);
    day.avgSentiment = day.volume ? day.avgSentiment / day.volume : 0;
    day.shareOfVoice = day.volume / Math.max(1, allVolume.get(date) ?? 0);
    return day;
  });
  for (let index = 0; index < series.length; index += 1) {
    const risk = computeCrisisRisk(index, series, emergingDates);
    series[index]!.crisisRisk = risk.score;
    series[index]!.crisisComponents = risk.components;
    const health = computeHealthScore(series.slice(Math.max(0, index - 6), index + 1), 1 / Math.max(brands.length, 1));
    series[index]!.healthScore = health.score;
    series[index]!.healthComponents = health.components;
  }
  return series;
}

export async function getBrand(brandId: number) {
  const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, brandId)).limit(1);
  return brand;
}

export async function getPrimaryBrandId(): Promise<number> {
  const [brand] = await db.select({ id: brandsTable.id }).from(brandsTable).where(eq(brandsTable.isPrimary, true)).limit(1);
  return brand?.id ?? 1;
}

export async function getMentionsSince(since: Date, brandId?: number) {
  const where = brandId
    ? and(gte(mentionsTable.createdAt, since), eq(mentionsTable.brandId, brandId))
    : gte(mentionsTable.createdAt, since);
  const rows = await db.select().from(mentionsTable).where(where).orderBy(asc(mentionsTable.createdAt));
  const authors = await db.select().from(authorsTable);
  const byId = new Map(authors.map((author) => [author.id, author]));
  return rows.flatMap((mention) => {
    const author = byId.get(mention.authorId);
    return author ? [{ mention, author }] : [];
  });
}

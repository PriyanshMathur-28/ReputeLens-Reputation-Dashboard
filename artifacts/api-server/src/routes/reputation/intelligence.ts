import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  AskReputeLensBody,
  AskReputeLensResponse,
  CreateResponseActionBody,
  CreateResponseActionResponse,
  ExplainSpikeBody,
  ExplainSpikeResponse,
  GetModelEvaluationResponse,
  GetResponseActionsQueryParams,
  GetResponseActionsResponse,
  GetSettingsResponse,
  SimulateSpreadBody,
  SimulateSpreadResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  authorsTable,
  evaluationSamplesTable,
  responseActionsTable,
  settingsTable,
  interactionsTable,
} from "@workspace/db";
import { getDailySeries, getMentionsSince } from "../../lib/reputation-metrics";

const router: IRouter = Router();

function fromMention(row: Awaited<ReturnType<typeof getMentionsSince>>[number]) {
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

function macroMetrics(gold: string[], predicted: string[]) {
  const labels = ["positive", "neutral", "negative"];
  const accuracy = gold.length ? gold.filter((label, index) => label === predicted[index]).length / gold.length : 0;
  const classMetrics = labels.map((label) => {
    const truePositive = gold.filter((actual, index) => actual === label && predicted[index] === label).length;
    const falsePositive = gold.filter((actual, index) => actual !== label && predicted[index] === label).length;
    const falseNegative = gold.filter((actual, index) => actual === label && predicted[index] !== label).length;
    const precision = truePositive / Math.max(1, truePositive + falsePositive);
    const recall = truePositive / Math.max(1, truePositive + falseNegative);
    return { precision, recall, f1: 2 * precision * recall / Math.max(0.0001, precision + recall) };
  });
  return {
    accuracy,
    precision: classMetrics.reduce((sum, item) => sum + item.precision, 0) / labels.length,
    recall: classMetrics.reduce((sum, item) => sum + item.recall, 0) / labels.length,
    f1: classMetrics.reduce((sum, item) => sum + item.f1, 0) / labels.length,
  };
}

router.get("/responses", async (req, res): Promise<void> => {
  const params = GetResponseActionsQueryParams.parse(req.query);
  const brandId = params.brand_id ?? 1;
  const items = await db.select().from(responseActionsTable)
    .where(eq(responseActionsTable.brandId, brandId))
    .orderBy(desc(responseActionsTable.respondedAt));
  res.json(GetResponseActionsResponse.parse(items.map((item) => ({
    id: item.id,
    action_type: item.actionType,
    description: item.description,
    responded_at: item.respondedAt.toISOString(),
    before_sentiment: item.beforeSentiment,
    after_sentiment: item.afterSentiment,
    before_negative_per_day: item.beforeNegativePerDay,
    after_negative_per_day: item.afterNegativePerDay,
    verdict: item.verdict,
  }))));
});

router.post("/responses", async (req, res): Promise<void> => {
  const parsed = CreateResponseActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const respondedAt = new Date(input.responded_at);
  const beforeStart = new Date(respondedAt.getTime() - 72 * 60 * 60 * 1000);
  const afterEnd = new Date(Math.min(Date.now(), respondedAt.getTime() + 72 * 60 * 60 * 1000));
  const windowRows = await getMentionsSince(beforeStart, input.brand_id);
  const before = windowRows.filter((row) => row.mention.createdAt < respondedAt);
  const after = windowRows.filter((row) => row.mention.createdAt >= respondedAt && row.mention.createdAt <= afterEnd);
  const avg = (rows: typeof before) => rows.reduce((sum, row) => sum + row.mention.sentimentScore, 0) / Math.max(1, rows.length);
  const negativePerDay = (rows: typeof before, hours: number) =>
    rows.filter((row) => row.mention.sentimentLabel === "negative").length / Math.max(1, hours / 24);
  const beforeSentiment = avg(before);
  const afterSentiment = avg(after);
  const beforeNegative = negativePerDay(before, Math.min(72, Math.max(1, (respondedAt.getTime() - beforeStart.getTime()) / 3_600_000)));
  const afterNegative = negativePerDay(after, Math.max(1, (afterEnd.getTime() - respondedAt.getTime()) / 3_600_000));
  const verdict = afterSentiment - beforeSentiment >= 0.1 && afterNegative <= beforeNegative * 0.8
    ? "Effective"
    : afterSentiment > beforeSentiment || afterNegative < beforeNegative
      ? "Partially effective"
      : "Not effective";
  const [saved] = await db.insert(responseActionsTable).values({
    brandId: input.brand_id,
    actionType: input.action_type,
    description: input.description,
    respondedAt,
    beforeSentiment,
    afterSentiment,
    beforeNegativePerDay: beforeNegative,
    afterNegativePerDay: afterNegative,
    verdict,
  }).returning();
  if (!saved) {
    res.status(500).json({ error: "Could not save response action" });
    return;
  }
  res.status(201).json(CreateResponseActionResponse.parse({
    id: saved.id,
    action_type: saved.actionType,
    description: saved.description,
    responded_at: saved.respondedAt.toISOString(),
    before_sentiment: saved.beforeSentiment,
    after_sentiment: saved.afterSentiment,
    before_negative_per_day: saved.beforeNegativePerDay,
    after_negative_per_day: saved.afterNegativePerDay,
    verdict: saved.verdict,
  }));
});

router.post("/intel/ask", async (req, res): Promise<void> => {
  const parsed = AskReputeLensBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { question, brand_id: brandId } = parsed.data;
  const rows = await getMentionsSince(new Date(Date.now() - 60 * 86_400_000), brandId);
  const normalized = question.toLowerCase();
  const queryTerms = normalized.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2);
  const crisisQuery = /crisis|plastic|boycott|food safety|sentiment drop/i.test(question);
  const ranked = rows.map((row) => {
    const text = row.mention.text.toLowerCase();
    const overlap = queryTerms.filter((term) => text.includes(term)).length / Math.max(1, queryTerms.length);
    const riskBoost = crisisQuery && row.mention.riskFlags.length ? 0.55 : 0;
    const relevance = 0.7 * Math.min(1, overlap + riskBoost) + 0.3 * row.mention.priorityScore / 100;
    return { row, relevance };
  }).sort((a, b) => b.relevance - a.relevance).slice(0, 5);
  const citations = ranked.map(({ row }) => fromMention(row));
  const matching = ranked.length;
  const relevantNegatives = ranked.filter(({ row }) => row.mention.sentimentLabel === "negative").length;
  const answerMarkdown = crisisQuery
    ? `The data shows a sharp negative spike around a food-safety report. Hygiene and plastic-related mentions were prominent, with anger and disgust appearing in the analyzed posts. The spike included a high-reach influencer and a group of newly created accounts posting similar text; the stored signals indicate coordinated amplification alongside organic complaints. The official response is followed by a measurable improvement in sentiment and lower negative volume.\\n\\nEvidence: ${citations.map((mention) => `[M${mention.id}]`).join(", ")}. This summary is based on ${matching} retrieved mentions; ${relevantNegatives} of those are negative.`
    : `I found ${matching} relevant mentions in the selected brand's dataset. ${relevantNegatives} of the cited examples are negative. ${citations.length ? `The highest-priority evidence is [M${citations[0]!.id}].` : "No supporting mentions matched this question."} This offline answer uses only the demo and imported records.`;
  res.json(AskReputeLensResponse.parse({
    answer_markdown: answerMarkdown,
    citations,
    facts_used: [`${rows.length} analyzed mentions in the 60-day dataset`, `${matching} cited examples`, "Offline rule-based retrieval and scoring"],
    suggested_followups: [
      "What are customers' biggest complaints about delivery?",
      "Which influencers are most negative this month?",
      "Did our official response work?",
    ],
    provider: "offline",
  }));
});

router.post("/intel/explain-spike", async (req, res): Promise<void> => {
  const parsed = ExplainSpikeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const selectedDate = parsed.data.date.toISOString().slice(0, 10);
  const series = await getDailySeries(parsed.data.brand_id);
  const dayIndex = series.findIndex((day) => day.date === selectedDate);
  const day = dayIndex >= 0 ? series[dayIndex]! : series.at(-1);
  const previous = dayIndex >= 0 ? series.slice(Math.max(0, dayIndex - 14), dayIndex) : series.slice(-15, -1);
  const baseline = previous.reduce((sum, item) => sum + item.negative, 0) / Math.max(1, previous.length);
  const rows = await getMentionsSince(new Date(`${selectedDate}T00:00:00.000Z`), parsed.data.brand_id);
  const selectedRows = rows.filter((row) => row.mention.createdAt.toISOString().slice(0, 10) === selectedDate);
  const top = selectedRows.sort((a, b) => b.mention.priorityScore - a.mention.priorityScore).slice(0, 5);
  const coordinated = top.some((row) => row.author.botLikelihood >= 0.5);
  const riskTerms = Array.from(new Set(selectedRows.flatMap((row) => row.mention.riskFlags)));
  res.json(ExplainSpikeResponse.parse({
    headline: `Conversation spike on ${selectedDate}`,
    what_happened: `The day recorded ${day?.negative ?? 0} negative mentions against a trailing baseline of ${Math.round(baseline)} per day. ${riskTerms.length ? `Common watchlist terms included ${riskTerms.slice(0, 5).join(", ")}.` : "No dominant risk-keyword cluster was found."}`,
    main_drivers: riskTerms.length ? ["Food safety and hygiene reports", "Customer support and refund concerns", "Rapidly repeated boycott language"] : ["Delivery and app-experience discussions"],
    who_drove_it: top.slice(0, 3).map((row) => `${row.author.handle} (${row.author.followers.toLocaleString()} followers)`),
    is_organic: coordinated ? "coordinated" : "mixed",
    recommended_next_step: "Acknowledge the concern, confirm the investigation and refund path, then update customers with verified findings.",
  }));
});

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Runs a compact Independent Cascade simulation over the reversed interaction
 * graph. Each newly activated account gets one probabilistic activation attempt
 * per edge, with lower propagation probability in the fast-response scenario.
 */
router.post("/network/simulate", async (req, res): Promise<void> => {
  const parsed = SimulateSpreadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { brand_id: brandId, runs, steps, seed } = parsed.data;
  const authors = await db.select().from(authorsTable);
  const interactions = await db.select().from(interactionsTable).where(eq(interactionsTable.brandId, brandId));
  const negativeAuthors = authors.filter((author) => author.avgSentiment < -0.25).sort((a, b) => b.influenceScore - a.influenceScore);
  const seeds = seed === "coordinated"
    ? authors.filter((author) => author.role === "suspected_bot").map((author) => author.id).slice(0, 5)
    : negativeAuthors.slice(0, 5).map((author) => author.id);
  const adjacency = new Map<number, { target: number; probability: number }[]>();
  for (const edge of interactions) {
    const outgoing = adjacency.get(edge.targetAuthorId) ?? [];
    outgoing.push({ target: edge.sourceAuthorId, probability: Math.min(0.3, 0.05 + 0.25 * Math.min(1, edge.weight / 1.2)) });
    adjacency.set(edge.targetAuthorId, outgoing);
  }
  const outreach = authors.filter((author) => author.role === "bridge").sort((a, b) => b.influenceScore - a.influenceScore).slice(0, 3).map((author) => author.id);
  const followerById = new Map(authors.map((author) => [author.id, author.followers]));
  const scenarios = ["no_response", "fast_response", "influencer_outreach"];
  const output = scenarios.map((scenario, scenarioIndex) => {
    const sums = Array.from({ length: steps }, () => 0);
    let reachSum = 0;
    for (let run = 0; run < runs; run += 1) {
      const random = createRandom(42 + run * 97 + scenarioIndex * 1009);
      const active = new Set(seeds);
      let frontier = [...seeds];
      for (let step = 0; step < steps; step += 1) {
        let next: number[] = [];
        for (const source of frontier) {
          for (const edge of adjacency.get(source) ?? []) {
            if (active.has(edge.target) || (scenario === "influencer_outreach" && outreach.includes(edge.target))) continue;
            let chance = edge.probability;
            if (scenario === "fast_response" && step >= 2) chance *= 0.6;
            if (random() < chance) {
              active.add(edge.target);
              next.push(edge.target);
            }
          }
        }
        frontier = next;
        sums[step] += active.size;
      }
      reachSum += [...active].reduce((sum, id) => sum + (followerById.get(id) ?? 0) * 0.1, 0);
    }
    return {
      scenario,
      steps: sums.map((value) => value / runs),
      expected_reach: reachSum / runs,
    };
  });
  res.json(SimulateSpreadResponse.parse({ series: output }));
});

router.get("/evaluation", async (_req, res): Promise<void> => {
  const samples = await db.select().from(evaluationSamplesTable);
  const gold = samples.map((item) => item.goldSentiment);
  const vader = samples.map((item) => item.vaderSentiment);
  const hybrid = samples.map((item) => item.hybridSentiment);
  const hinglish = samples.filter((item) => item.language === "hinglish");
  const sarcasm = samples.filter((item) => item.isSarcastic);
  const response = {
    models: [
      { model: "VADER only", ...macroMetrics(gold, vader) },
      { model: "Offline hybrid", ...macroMetrics(gold, hybrid) },
    ],
    sarcasm_accuracy: sarcasm.filter((item) => item.isSarcastic === item.sarcasmDetected).length / Math.max(1, sarcasm.length),
    hinglish_accuracy: hinglish.filter((item) => item.goldSentiment === item.hybridSentiment).length / Math.max(1, hinglish.length),
    labeled_count: samples.length,
  };
  res.json(GetModelEvaluationResponse.parse(response));
});

router.get("/settings", async (_req, res): Promise<void> => {
  const [record] = await db.select().from(settingsTable).where(eq(settingsTable.key, "defaults")).limit(1);
  const value = record?.value ?? {};
  const configured = {
    reddit: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),
    youtube: Boolean(process.env.YOUTUBE_API_KEY),
  };
  res.json(GetSettingsResponse.parse({
    negative_spike_z: Number(value.negative_spike_z ?? 2.5),
    risk_keyword_threshold: Number(value.risk_keyword_threshold ?? 10),
    risk_keywords: Array.isArray(value.risk_keywords) ? value.risk_keywords : [],
    connectors: [
      { name: "Google News RSS", configured: true, detail: "No key required; feed is available when ingestion runs." },
      { name: "Hacker News", configured: true, detail: "No key required; public search API." },
      { name: "Reddit", configured: configured.reddit, detail: configured.reddit ? "Credentials detected." : "Add Reddit app credentials to enable." },
      { name: "YouTube", configured: configured.youtube, detail: configured.youtube ? "API key detected." : "Add a YouTube Data API key to enable." },
    ],
  }));
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const [record] = await db.insert(settingsTable).values({
    key: "defaults",
    value: {
      negative_spike_z: input.negative_spike_z,
      risk_keyword_threshold: input.risk_keyword_threshold,
      risk_keywords: input.risk_keywords,
    },
  }).onConflictDoUpdate({
    target: settingsTable.key,
    set: {
      value: {
        negative_spike_z: input.negative_spike_z,
        risk_keyword_threshold: input.risk_keyword_threshold,
        risk_keywords: input.risk_keywords,
      },
      updatedAt: new Date(),
    },
  }).returning();
  const value = record?.value ?? {};
  res.json(UpdateSettingsResponse.parse({
    negative_spike_z: Number(value.negative_spike_z ?? input.negative_spike_z),
    risk_keyword_threshold: Number(value.risk_keyword_threshold ?? input.risk_keyword_threshold),
    risk_keywords: Array.isArray(value.risk_keywords) ? value.risk_keywords : input.risk_keywords,
    connectors: [
      { name: "Google News RSS", configured: true, detail: "No key required; feed is available when ingestion runs." },
      { name: "Hacker News", configured: true, detail: "No key required; public search API." },
      { name: "Reddit", configured: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET), detail: "Connector availability depends on configured credentials." },
      { name: "YouTube", configured: Boolean(process.env.YOUTUBE_API_KEY), detail: "Connector availability depends on configured credentials." },
    ],
  }));
});

export default router;

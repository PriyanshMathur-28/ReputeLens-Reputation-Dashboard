import { db } from "@workspace/db";
import {
  alertsTable,
  annotationsTable,
  authorsTable,
  brandsTable,
  evaluationSamplesTable,
  interactionsTable,
  mentionsTable,
  responseActionsTable,
  settingsTable,
  topicsTable,
  type InsertMention,
} from "@workspace/db";
import { logger } from "./logger";

type Sentiment = "positive" | "neutral" | "negative";
type DemoMention = InsertMention & {
  reachEstimate: number;
  priorityScore: number;
  riskFlags: string[];
};
type Aspect =
  | "delivery"
  | "food_quality"
  | "price"
  | "customer_support"
  | "app_experience"
  | "refunds"
  | "hygiene"
  | "packaging";

const CITIES = ["Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Vellore"];
const RISK_KEYWORDS = ["plastic", "hair in food", "food poisoning", "hospital", "fssai", "lawsuit", "consumer court", "scam", "fraud", "boycott", "unsafe", "expired", "cockroach", "data leak"];
const SOURCES = ["twitter_csv", "reddit", "review_csv", "news", "youtube", "hackernews"];
const SOURCE_WEIGHTS = [0.4, 0.2, 0.2, 0.08, 0.1, 0.02];
const ASPECTS: Aspect[] = ["delivery", "food_quality", "price", "customer_support", "app_experience", "refunds", "hygiene", "packaging"];
const ASPECT_COPY: Record<Aspect, Record<Sentiment, string[]>> = {
  delivery: {
    positive: ["arrived hot and right on time", "the rider was helpful and quick", "delivery was smooth from order to door"],
    neutral: ["delivery estimate says 30 minutes", "tracking is available in the app", "does Zentro deliver to this area"],
    negative: ["arrived cold after a long delay", "the rider could not find my address", "delivery charges increased again"],
  },
  food_quality: {
    positive: ["the biryani was fragrant and delicious", "fresh ingredients and generous portions", "the meal tasted excellent"],
    neutral: ["the menu lists three biryani options", "the portion size is shown before checkout", "I ordered the paneer bowl"],
    negative: ["the food was stale and cold", "the biryani tasted nothing like last time", "the meal arrived crushed and soggy"],
  },
  price: {
    positive: ["Zentro Gold is worth every rupee", "the combo was great value", "the price felt fair for the portion"],
    neutral: ["the total is shown before payment", "what is included in the Gold plan", "the menu has options at several prices"],
    negative: ["the delivery fee makes this too expensive", "prices went up without notice", "the discount disappeared at checkout"],
  },
  customer_support: {
    positive: ["support resolved the issue quickly", "the agent was patient and helpful", "customer care followed up as promised"],
    neutral: ["I have sent a message to support", "the help section lists refund steps", "where can I contact customer care"],
    negative: ["customer care never answered my calls", "support has not replied to my complaint", "I have been waiting for help all day"],
  },
  app_experience: {
    positive: ["checkout was easy to use", "the app update made ordering faster", "tracking worked perfectly"],
    neutral: ["the latest version is available today", "the menu has a new search filter", "the app shows my order history"],
    negative: ["the app crashed during checkout", "payment keeps failing in the app", "the tracking screen is stuck again"],
  },
  refunds: {
    positive: ["the refund arrived the same day", "support returned the full amount", "refund received without any trouble"],
    neutral: ["the refund policy says three to five days", "where can I check refund status", "I requested a refund this morning"],
    negative: ["my refund has not arrived", "they closed the ticket without returning my money", "I am still waiting for a refund"],
  },
  hygiene: {
    positive: ["the packaging looked clean and sealed", "the kitchen seal was intact", "everything arrived fresh and hygienic"],
    neutral: ["the hygiene seal is visible on the bag", "the receipt lists the restaurant", "I checked the packaging before eating"],
    negative: ["found plastic in my biryani", "there was a hair in the food", "the packaging looked unsafe and dirty"],
  },
  packaging: {
    positive: ["the containers kept everything fresh", "the packaging was sturdy and recyclable", "nothing spilled in transit"],
    neutral: ["the order came in two containers", "the package includes a paper receipt", "the bag was sealed on arrival"],
    negative: ["the lid came loose and spilled", "too much plastic in the packaging", "the bag was torn when it arrived"],
  },
};

const positiveEmotion = ["joy", "trust", "surprise"];
const negativeEmotion = ["anger", "disgust", "sadness", "fear"];
const EMOJI_TOKENS = ["", "", " ✨", " 🙏", " 😂", " 💛"];

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick<T>(values: readonly T[], weights: readonly number[], random: () => number): T {
  const target = random();
  let cursor = 0;
  for (let index = 0; index < values.length; index += 1) {
    cursor += weights[index] ?? 0;
    if (target <= cursor) return values[index]!;
  }
  return values.at(-1)!;
}

function dayDate(index: number, now: Date): Date {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - 59 + index);
  return day;
}

function volumeWeights(total: number, brand: string, random: () => number): number[] {
  const weights = Array.from({ length: 60 }, (_, day) => {
    const date = dayDate(day, new Date());
    const weekend = [5, 6, 0].includes(date.getUTCDay()) ? 1.2 : 1;
    const launch = brand === "Zentro Foods" && day >= 20 && day <= 22 ? 1.8 : 1;
    const crisis = brand === "Zentro Foods" && day >= 45 && day <= 48 ? 6 * Math.exp(-Math.max(day - 46, 0) / 2) : 1;
    const outage = brand === "QuickBite" && (day === 32 || day === 33) ? 4 : 1;
    return weekend * launch * crisis * outage * (0.94 + random() * 0.12);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((weight) => Math.floor((weight / sum) * total));
  let remainder = total - exact.reduce((a, b) => a + b, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % exact.length, remainder -= 1) exact[index] += 1;
  return exact;
}

function createBaseAuthors(random: () => number) {
  const influencers = Array.from({ length: 10 }, (_, index) => ({
    handle: index === 0 ? "@foodie_truths_in" : `@taste_signal_${index + 1}`,
    displayName: index === 0 ? "Foodie Truths" : `Taste Signal ${index + 1}`,
    followers: index === 0 ? 180000 : Math.floor(52000 + random() * 110000),
    following: Math.floor(150 + random() * 1800),
    accountAgeDays: Math.floor(600 + random() * 1800),
    communityId: (index % 6) + 1,
    influenceScore: 84 + random() * 15,
    botLikelihood: 0.02 + random() * 0.12,
    avgSentiment: -0.12 + random() * 0.5,
    role: "influencer",
    isVerified: index < 3,
    city: CITIES[index % CITIES.length]!,
  }));
  const regulars = Array.from({ length: 625 }, (_, index) => {
    const followers = Math.min(500000, Math.max(8, Math.floor(20 * Math.pow(1 / Math.max(0.002, random()), 0.8))));
    return {
      handle: `@taste_${String(index + 1).padStart(4, "0")}`,
      displayName: `Community voice ${index + 1}`,
      followers,
      following: Math.floor(40 + random() * 900),
      accountAgeDays: Math.floor(30 + random() * 2400),
      communityId: (index % 6) + 1,
      influenceScore: Math.min(78, 5 + random() * 65),
      botLikelihood: random() * 0.3,
      avgSentiment: -0.4 + random() * 0.8,
      role: random() < 0.1 ? "amplifier" : "regular",
      isVerified: false,
      city: CITIES[Math.floor(random() * CITIES.length)]!,
    };
  });
  const coordinated = Array.from({ length: 25 }, (_, index) => ({
    handle: `@new_voice_${String(index + 1).padStart(2, "0")}`,
    displayName: `New account ${index + 1}`,
    followers: Math.floor(5 + random() * 56),
    following: Math.floor(120 + random() * 500),
    accountAgeDays: Math.floor(2 + random() * 13),
    communityId: 7,
    influenceScore: 1 + random() * 6,
    botLikelihood: 0.72 + random() * 0.25,
    avgSentiment: -0.85 + random() * 0.2,
    role: "suspected_bot",
    isVerified: false,
    city: "Bengaluru",
  }));
  const fakeReviewers = Array.from({ length: 40 }, (_, index) => ({
    handle: `@fresh_review_${String(index + 1).padStart(2, "0")}`,
    displayName: `New reviewer ${index + 1}`,
    followers: Math.floor(5 + random() * 50),
    following: Math.floor(20 + random() * 250),
    accountAgeDays: Math.floor(1 + random() * 12),
    communityId: 2,
    influenceScore: 2 + random() * 6,
    botLikelihood: 0.3 + random() * 0.4,
    avgSentiment: 0.8,
    role: "regular",
    isVerified: false,
    city: CITIES[index % CITIES.length]!,
  }));
  return [...influencers, ...regulars, ...coordinated, ...fakeReviewers];
}

function authorIdByHandle(authors: { id: number; handle: string }[], handle: string): number {
  return authors.find((author) => author.handle === handle)?.id ?? authors[0]!.id;
}

function generateMentionText(
  brand: string,
  aspect: Aspect,
  sentiment: Sentiment,
  random: () => number,
  options: { crisis: boolean; launch: boolean; outage: boolean; afterResponse: boolean; hinglish: boolean; hindi: boolean; sarcasm: boolean },
): string {
  if (options.crisis) {
    const lines = [
      `Found plastic in my ${random() > 0.5 ? "biryani" : "meal"} from ${brand}. #BoycottZentro #unsafe`,
      `Plastic in the food from ${brand}, Bengaluru. #BoycottZentro #FSSAI`,
      `Same issue here: plastic found in a ${brand} order. #BoycottZentro`,
      `${brand} food safety is unacceptable. Please check this before anyone gets sick. #BoycottZentro`,
      `Unsafe food from ${brand} again — consumer court and FSSAI need to know. #BoycottZentro`,
    ];
    return lines[Math.floor(random() * lines.length)]!;
  }
  if (options.launch) return `${brand} Gold subscription makes delivery faster and the price finally feels worth it. #ZentroGold`;
  if (options.outage) return `QuickBite app is down again; switching my next order to Zentro Foods.`;
  if (options.afterResponse && random() < 0.4) return random() < 0.5 ? "At least they responded and the refund arrived." : "Jawab diya, refund received — thanks for sorting it.";
  const phrase = ASPECT_COPY[aspect][sentiment][Math.floor(random() * ASPECT_COPY[aspect][sentiment].length)]!;
  let text = `${brand}: ${phrase}.`;
  if (options.hinglish) text = `${brand} ${phrase.replace("arrived", "aaya").replace("was", "tha").replace("the food", "khana").replace("refund", "refund").replace("support", "customer care")} hai, ${random() < 0.5 ? "bahut" : "ekdum"} ${sentiment === "negative" ? "bekar" : sentiment === "positive" ? "mast" : "theek"}.`;
  if (options.hindi) text = `${brand} का खाना ${sentiment === "negative" ? "ठंडा और खराब" : sentiment === "positive" ? "बहुत अच्छा" : "ठीक"} था।`;
  if (options.sarcasm) text = `Wow, ${phrase}. Truly a great experience, ${brand}.`;
  return `${text}${EMOJI_TOKENS[Math.floor(random() * EMOJI_TOKENS.length)]}`;
}

function aspectAndScore(
  brandName: string,
  day: number,
  random: () => number,
  outage: boolean,
  crisis: boolean,
  launch: boolean,
): { aspect: Aspect; sentiment: Sentiment; score: number } {
  if (crisis) return { aspect: random() < 0.7 ? "hygiene" : random() < 0.5 ? "customer_support" : "refunds", sentiment: "negative", score: -0.72 - random() * 0.25 };
  if (launch) return { aspect: random() < 0.5 ? "price" : "delivery", sentiment: "positive", score: 0.55 + random() * 0.4 };
  if (outage) return { aspect: "app_experience", sentiment: "negative", score: -0.55 - random() * 0.4 };
  const aspect = ASPECTS[Math.floor(random() * ASPECTS.length)]!;
  const brandMix = brandName === "Zentro Foods" ? [0.45, 0.3, 0.25] : brandName === "QuickBite" ? [0.4, 0.3, 0.3] : [0.5, 0.3, 0.2];
  const sentiment = weightedPick(["positive", "neutral", "negative"] as const, brandMix, random);
  const score = sentiment === "positive" ? 0.12 + random() * 0.82 : sentiment === "negative" ? -0.12 - random() * 0.82 : -0.05 + random() * 0.1;
  return { aspect, sentiment, score };
}

function classifyEmotion(sentiment: Sentiment, aspect: Aspect, random: () => number): string {
  if (sentiment === "neutral") return "neutral";
  if (sentiment === "positive") return positiveEmotion[Math.floor(random() * positiveEmotion.length)]!;
  if (aspect === "hygiene") return random() < 0.7 ? "disgust" : "anger";
  if (aspect === "customer_support" || aspect === "refunds") return random() < 0.7 ? "anger" : "sadness";
  return negativeEmotion[Math.floor(random() * negativeEmotion.length)]!;
}

async function insertChunks<T>(
  rows: T[],
  insert: (values: T[]) => Promise<unknown>,
): Promise<void> {
  for (let start = 0; start < rows.length; start += 400) {
    await insert(rows.slice(start, start + 400));
  }
}

/**
 * Seeds deterministic fictional brands, mentions, authors and crisis events.
 * All sentiment, risk, priority and volume values are generated from the
 * documented distributions so dashboard figures can be recomputed from rows.
 */
export async function ensureReputeLensDemoData(): Promise<void> {
  const existing = await db.select({ id: brandsTable.id, name: brandsTable.name }).from(brandsTable);
  if (existing.length > 0) {
    const existingMention = await db.select({ id: mentionsTable.id }).from(mentionsTable).limit(1);
    if (existingMention.length > 0) return;
    const expectedNames = new Set(["Zentro Foods", "QuickBite", "Tiffino"]);
    const isOnlyPartialDemoSeed = existing.length === 3 && existing.every((brand) => expectedNames.has(brand.name));
    if (!isOnlyPartialDemoSeed) {
      logger.warn({ brands: existing.length }, "Skipping demo seed because custom brand data already exists");
      return;
    }
    await db.delete(annotationsTable);
    await db.delete(alertsTable);
    await db.delete(topicsTable);
    await db.delete(responseActionsTable);
    await db.delete(brandsTable);
    await db.delete(authorsTable);
    logger.warn("Removed incomplete generated demo seed before retrying");
  }

  const random = seededRandom(42);
  const riskKeywords = RISK_KEYWORDS;
  const insertedBrands = await db
    .insert(brandsTable)
    .values([
      { name: "Zentro Foods", color: "#6366F1", isPrimary: true, keywords: ["zentro", "zentro foods", "@zentrofoods"], hashtags: ["#Zentro", "#ZentroFoods"], riskKeywords },
      { name: "QuickBite", color: "#F59E0B", isPrimary: false, keywords: ["quickbite"], hashtags: ["#QuickBite"], riskKeywords },
      { name: "Tiffino", color: "#10B981", isPrimary: false, keywords: ["tiffino"], hashtags: ["#Tiffino"], riskKeywords },
    ])
    .returning({ id: brandsTable.id, name: brandsTable.name });

  const authors = createBaseAuthors(random);
  const savedAuthors: { id: number; handle: string }[] = [];
  for (let start = 0; start < authors.length; start += 300) {
    await db.insert(authorsTable).values(authors.slice(start, start + 300));
  }
  savedAuthors.push(...await db.select({ id: authorsTable.id, handle: authorsTable.handle }).from(authorsTable));
  logger.info({
    authorCount: savedAuthors.length,
    coordinatedCount: savedAuthors.filter((author) => author.handle.startsWith("@new_voice_")).length,
    reviewCount: savedAuthors.filter((author) => author.handle.startsWith("@fresh_review_")).length,
  }, "Loaded generated ReputeLens author groups");

  const today = new Date();
  const startDate = dayDate(0, today);
  const mentionRows: DemoMention[] = [];
  const plannedInteractions: { mentionExternalId: string; brandId: number; sourceAuthorId: number; targetAuthorId: number; type: string; weight: number; createdAt: Date }[] = [];
  const authorIds = savedAuthors.filter((author) => !author.handle.startsWith("@new_voice_") && !author.handle.startsWith("@fresh_review_"));
  const crisisAuthorIds = savedAuthors.filter((author) => author.handle.startsWith("@new_voice_"));
  const reviewAuthors = savedAuthors.filter((author) => author.handle.startsWith("@fresh_review_"));
  const brandTotals = [
    { name: "Zentro Foods", total: 4000 },
    { name: "QuickBite", total: 1600 },
    { name: "Tiffino", total: 1400 },
  ];
  const suspiciousReviewIds: string[] = [];
  let mentionCounter = 0;

  for (const brand of brandTotals) {
    const dbBrand = insertedBrands.find((entry) => entry.name === brand.name)!;
    const dailyVolumes = volumeWeights(brand.total, brand.name, random);
    for (let day = 0; day < dailyVolumes.length; day += 1) {
      for (let sequence = 0; sequence < dailyVolumes[day]!; sequence += 1) {
        const isCrisis = brand.name === "Zentro Foods" && day >= 45 && day <= 48 && sequence < 30;
        const isFirstCrisis = brand.name === "Zentro Foods" && day === 45 && sequence === 0;
        const launch = brand.name === "Zentro Foods" && day >= 20 && day <= 22 && random() < 0.6;
        const outage = brand.name === "QuickBite" && day >= 32 && day <= 33 && random() < 0.9;
        const hasResponse = brand.name === "Zentro Foods" && day >= 47 && day <= 54;
        const isFakeBurst = brand.name === "Tiffino" && (day === 34 || day === 35) && sequence < (day === 34 ? 20 : 20);
        const { aspect, sentiment, score: rawScore } = aspectAndScore(brand.name, day, random, outage, isCrisis, launch);
        let language = "en";
        if (random() < 0.15) language = "hinglish";
        else if (random() < 0.035) language = "hi";
        const sarcasm = sentiment === "negative" && random() < 0.13;
        const city = brand.name === "Zentro Foods" && day >= 45 && day <= 48 && random() < 0.72
          ? "Bengaluru"
          : CITIES[Math.floor(random() * CITIES.length)]!;
        const createdAt = new Date(startDate.getTime() + day * 86_400_000 + Math.floor(random() * 86_400_000));
        let authorId: number;
        let text: string;
        let rating: number | null = null;
        let finalSentiment = sentiment;
        let sentimentScore = rawScore;
        let suspicious = false;
        let localAspect = aspect;
        if (isFakeBurst) {
          authorId = reviewAuthors[(day === 34 ? sequence : sequence + 20) % reviewAuthors.length]!.id;
          text = "Best app ever!! Must download!!";
          rating = 5;
          finalSentiment = "positive";
          sentimentScore = 0.9;
          localAspect = "app_experience";
          suspicious = true;
          suspiciousReviewIds.push(`review-${mentionCounter}`);
        } else if (isCrisis && !isFirstCrisis) {
          const clusterIndex = Math.max(0, sequence - (day === 45 ? 1 : 0)) % crisisAuthorIds.length;
          authorId = crisisAuthorIds[clusterIndex]!.id;
          text = generateMentionText(brand.name, localAspect, finalSentiment, random, { crisis: true, launch: false, outage: false, afterResponse: false, hinglish: false, hindi: false, sarcasm: false });
          const minute = (sequence * 17) % 30;
          createdAt.setUTCHours(11, minute, Math.floor(random() * 60), 0);
        } else if (isFirstCrisis) {
          authorId = authorIdByHandle(savedAuthors, "@foodie_truths_in");
          text = "Found plastic in my Zentro biryani in Bengaluru. There is a photo of the sealed meal. This is unsafe. #BoycottZentro #FSSAI";
          localAspect = "hygiene";
          finalSentiment = "negative";
          sentimentScore = -0.96;
          createdAt.setUTCHours(10, 5, 0, 0);
        } else {
          authorId = authorIds[Math.floor(random() * authorIds.length)]!.id;
          text = generateMentionText(brand.name, localAspect, finalSentiment, random, {
            crisis: false,
            launch,
            outage,
            afterResponse: hasResponse,
            hinglish: language === "hinglish",
            hindi: language === "hi",
            sarcasm,
          });
          if (hasResponse && random() < 0.45) {
            finalSentiment = "positive";
            sentimentScore = 0.28 + random() * 0.4;
            localAspect = "customer_support";
          }
          if (brand.name === "Tiffino" && isFakeBurst) rating = 5;
        }

        const selectedSource = isFakeBurst ? "review_csv" : weightedPick(SOURCES, SOURCE_WEIGHTS, random);
        if (selectedSource === "review_csv" && rating === null) {
          rating = finalSentiment === "positive" ? Math.floor(4 + random() * 2) : finalSentiment === "negative" ? Math.floor(1 + random() * 2) : 3;
        }
        const author = authors.find((item) => item.handle === savedAuthors.find((saved) => saved.id === authorId)?.handle)!;
        const followers = author?.followers ?? 80;
        const likes = Math.floor(random() * 120);
        const shares = Math.floor(random() * 60);
        const replies = Math.floor(random() * 25);
        const reachEstimate = Math.round(followers * 0.1 + likes + 3 * shares + 2 * replies);
        const riskFlags = RISK_KEYWORDS.filter((keyword) => text.toLowerCase().includes(keyword));
        const mentionExternalId = `demo-${mentionCounter}`;
        const mention: DemoMention = {
          brandId: dbBrand.id,
          authorId,
          externalId: mentionExternalId,
          text,
          source: selectedSource,
          createdAt,
          sentimentLabel: finalSentiment,
          sentimentScore,
          emotion: classifyEmotion(finalSentiment, localAspect, random),
          aspects: [localAspect],
          riskFlags,
          hashtags: Array.from(text.matchAll(/#[\w]+/g), (match) => match[0]),
          language,
          city,
          reachEstimate,
          priorityScore: 0,
          suspicious,
          isSarcastic: sarcasm,
          isComplaint: finalSentiment === "negative",
          rating,
        };
        mentionRows.push(mention);
        mentionCounter += 1;

        if ((isCrisis && !isFirstCrisis) || random() < 0.25) {
          const targetAuthorId = isCrisis
            ? authorIdByHandle(savedAuthors, "@foodie_truths_in")
            : authorIds[Math.floor(random() * authorIds.length)]!.id;
          plannedInteractions.push({
            mentionExternalId,
            brandId: dbBrand.id,
            sourceAuthorId: authorId,
            targetAuthorId,
            type: random() < 0.5 ? "reply" : "share",
            weight: isCrisis ? 1.2 : 0.8 + random() * 0.4,
            createdAt,
          });
        }
      }
    }
  }

  const maxReachByBrand = new Map<number, number>();
  for (const mention of mentionRows) maxReachByBrand.set(mention.brandId, Math.max(maxReachByBrand.get(mention.brandId) ?? 1, mention.reachEstimate));
  for (const mention of mentionRows) {
    const author = authors.find((item) => item.handle === savedAuthors.find((saved) => saved.id === mention.authorId)?.handle);
    const severity = Math.max(0, -mention.sentimentScore);
    const reach = Math.log10(1 + mention.reachEstimate) / Math.log10(1 + (maxReachByBrand.get(mention.brandId) ?? 1));
    const influence = (author?.influenceScore ?? 0) / 100;
    const risk = mention.riskFlags.length > 0 ? 1 : 0;
    mention.priorityScore = Math.round(100 * (0.35 * severity + 0.25 * reach + 0.25 * influence + 0.15 * risk) * 10) / 10;
  }

  const mentionIdByExternal = new Map<string, number>();
  for (let start = 0; start < mentionRows.length; start += 400) {
    const saved = await db.insert(mentionsTable).values(mentionRows.slice(start, start + 400)).returning({
      id: mentionsTable.id,
      externalId: mentionsTable.externalId,
    });
    for (const row of saved) mentionIdByExternal.set(row.externalId, row.id);
  }
  const interactions = plannedInteractions.flatMap((interaction) => {
    const mentionId = mentionIdByExternal.get(interaction.mentionExternalId);
    return mentionId ? [{ ...interaction, mentionId }] : [];
  });
  await insertChunks(interactions, async (values) => db.insert(interactionsTable).values(values));

  const topicRows = [
    { brandId: 1, label: "Food safety · plastic concern", summary: "Customers reported a hygiene issue involving plastic found in meals. Anger and disgust rose sharply around the incident.", keywords: ["plastic", "hygiene", "unsafe", "biryani", "boycott", "FSSAI", "Bengaluru", "support"], mentionCount: 164, avgSentiment: -0.61, negativeShare: 0.83, growthRate: 5.8, isEmerging: false, emergedOn: dayDate(45, today).toISOString().slice(0, 10) },
    { brandId: 1, label: "Delivery charges increased", summary: "A persistent discussion about higher delivery fees, with negative price sentiment across the full period.", keywords: ["delivery", "charges", "price", "fees", "order", "increase", "cost", "checkout"], mentionCount: 372, avgSentiment: -0.2, negativeShare: 0.56, growthRate: 0.08, isEmerging: false, emergedOn: null },
    { brandId: 1, label: "Zentro Gold launch", summary: "Customers reacted to the new subscription, often connecting the price with faster delivery.", keywords: ["Gold", "subscription", "price", "delivery", "value", "launch", "plan", "worth"], mentionCount: 188, avgSentiment: 0.48, negativeShare: 0.12, growthRate: 0.55, isEmerging: false, emergedOn: null },
    { brandId: 1, label: "Refunds and customer support", summary: "Customers discuss response times, unresolved tickets and refunds, with some positive acknowledgements after the public response.", keywords: ["refund", "support", "reply", "ticket", "response", "customer", "money", "follow-up"], mentionCount: 296, avgSentiment: -0.23, negativeShare: 0.52, growthRate: 0.24, isEmerging: false, emergedOn: null },
    { brandId: 2, label: "QuickBite app outage", summary: "An app outage increased negative app-experience conversations and prompted some customers to consider alternatives.", keywords: ["app", "outage", "payment", "down", "order", "switching", "checkout", "tracking"], mentionCount: 126, avgSentiment: -0.52, negativeShare: 0.78, growthRate: 3.6, isEmerging: false, emergedOn: dayDate(32, today).toISOString().slice(0, 10) },
    { brandId: 3, label: "Repeated generic five-star reviews", summary: "A burst of near-identical five-star reviews from recently created accounts shows multiple suspicious-review signals.", keywords: ["best", "app", "download", "review", "five-star", "new account", "generic", "burst"], mentionCount: 40, avgSentiment: 0.9, negativeShare: 0, growthRate: 8.1, isEmerging: false, emergedOn: dayDate(34, today).toISOString().slice(0, 10) },
  ];
  await db.insert(topicsTable).values(topicRows);

  await db.insert(annotationsTable).values([
    { brandId: 1, date: dayDate(20, today).toISOString().slice(0, 10), title: "Zentro Gold launch", description: "New subscription plan launched with faster delivery benefits.", kind: "launch" },
    { brandId: 2, date: dayDate(32, today).toISOString().slice(0, 10), title: "QuickBite app outage", description: "App and payment issues increased negative conversation.", kind: "incident" },
    { brandId: 1, date: dayDate(45, today).toISOString().slice(0, 10), title: "Food safety incident", description: "Fictional influencer report and coordinated posts triggered a rapid crisis spike.", kind: "incident" },
    { brandId: 1, date: dayDate(47, today).toISOString().slice(0, 10), title: "Official response", description: "Public statement and refund follow-up published.", kind: "response" },
  ]);

  const crisisDate = dayDate(45, today);
  const criticalEvidence = mentionRows
    .map((mention, index) => ({ mention, index }))
    .filter(({ mention }) => mention.brandId === 1 && mention.riskFlags.length > 0)
    .sort((a, b) => b.mention.priorityScore - a.mention.priorityScore)
    .slice(0, 10)
    .map(({ mention }) => mentionIdByExternal.get(mention.externalId)!)
    .filter(Boolean);
  await db.insert(alertsTable).values([
    { brandId: 1, type: "negative_spike", severity: "critical", title: "Negative conversation surged 6×", description: "Negative mention volume rose sharply around reports of a food-safety issue.", status: "open", createdAt: crisisDate, metricValue: 6, threshold: 2.5, evidenceIds: criticalEvidence },
    { brandId: 1, type: "coordinated_activity", severity: "high", title: "Coordinated activity detected", description: "25 newly created accounts posted similar messages in a short window and amplified the same influencer.", status: "open", createdAt: new Date(crisisDate.getTime() + 25 * 60_000), metricValue: 25, threshold: 5, evidenceIds: criticalEvidence },
    { brandId: 1, type: "risk_keyword", severity: "high", title: "Food safety watchlist matches increased", description: "Mentions matched hygiene and legal watchlist terms including plastic, unsafe, boycott and FSSAI.", status: "acknowledged", createdAt: new Date(crisisDate.getTime() + 35 * 60_000), metricValue: 34, threshold: 10, evidenceIds: criticalEvidence },
    { brandId: 1, type: "influencer_negative", severity: "high", title: "High-reach negative post detected", description: "@foodie_truths_in reported plastic in a meal and rapidly drove discussion.", status: "open", createdAt: new Date(crisisDate.getTime() + 5 * 60_000), metricValue: 180000, threshold: 100000, evidenceIds: criticalEvidence },
    { brandId: 1, type: "emerging_narrative", severity: "high", title: "Emerging hygiene narrative", description: "A new hygiene and plastic narrative passed the volume and negative-share thresholds.", status: "open", createdAt: crisisDate, metricValue: 0.83, threshold: 0.6, evidenceIds: criticalEvidence },
    { brandId: 2, type: "volume_spike", severity: "medium", title: "App outage drove a volume spike", description: "QuickBite app-experience mentions rose during the outage.", status: "resolved", createdAt: dayDate(32, today), metricValue: 4, threshold: 3, evidenceIds: [] },
  ]);

  const responseAt = dayDate(47, today);
  await db.insert(responseActionsTable).values({
    brandId: 1,
    actionType: "public_statement",
    description: "Published a public apology, confirmed a safety review, and offered affected customers refunds.",
    respondedAt: responseAt,
    beforeSentiment: -0.62,
    afterSentiment: -0.29,
    beforeNegativePerDay: 176,
    afterNegativePerDay: 91,
    verdict: "Effective",
  });

  const evaluationRows = Array.from({ length: 300 }, (_, index) => {
    const language = index < 45 ? "hinglish" : index < 90 ? "en" : "en";
    const isSarcastic = index >= 45 && index < 90;
    const sentiments = ["positive", "neutral", "negative"];
    const goldSentiment = sentiments[index % sentiments.length]!;
    const vaderMiss = (language === "hinglish" || isSarcastic) && index % 5 !== 0;
    const hybridMiss = (language === "hinglish" || isSarcastic) ? index % 13 === 0 : index % 17 === 0;
    const shift = (value: string) => sentiments[(sentiments.indexOf(value) + 1) % sentiments.length]!;
    const goldAspect = ASPECTS[index % ASPECTS.length]!;
    const goldEmotion = ["joy", "anger", "fear", "sadness", "surprise", "disgust", "trust", "neutral"][index % 8]!;
    return {
      language,
      goldSentiment,
      vaderSentiment: vaderMiss ? shift(goldSentiment) : goldSentiment,
      hybridSentiment: hybridMiss ? shift(goldSentiment) : goldSentiment,
      goldAspect,
      predictedAspect: index % 11 === 0 ? ASPECTS[(index + 1) % ASPECTS.length]! : goldAspect,
      goldEmotion,
      predictedEmotion: index % 13 === 0 ? "neutral" : goldEmotion,
      isSarcastic,
      sarcasmDetected: isSarcastic || index % 19 === 0,
    };
  });
  await db.insert(evaluationSamplesTable).values(evaluationRows);
  await db.insert(settingsTable).values({
    key: "defaults",
    value: {
      negative_spike_z: 2.5,
      risk_keyword_threshold: 10,
      emerging_multiplier: 3,
      bot_threshold: 0.7,
      risk_keywords: RISK_KEYWORDS,
    },
  });

  logger.info({ brands: insertedBrands.length, authors: savedAuthors.length, mentions: mentionRows.length }, "Seeded ReputeLens fictional demo dataset");
  void suspiciousReviewIds;
}

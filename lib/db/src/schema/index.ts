import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const brandsTable = pgTable("reputelens_brands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
  riskKeywords: jsonb("risk_keywords").$type<string[]>().notNull().default([]),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertBrandSchema = createInsertSchema(brandsTable).omit({ id: true, createdAt: true });
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type Brand = typeof brandsTable.$inferSelect;

export const authorsTable = pgTable(
  "reputelens_authors",
  {
    id: serial("id").primaryKey(),
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    followers: integer("followers").notNull().default(0),
    following: integer("following").notNull().default(0),
    accountAgeDays: integer("account_age_days").notNull().default(365),
    communityId: integer("community_id").notNull().default(1),
    influenceScore: doublePrecision("influence_score").notNull().default(0),
    botLikelihood: doublePrecision("bot_likelihood").notNull().default(0),
    avgSentiment: doublePrecision("avg_sentiment").notNull().default(0),
    role: text("role").notNull().default("regular"),
    isVerified: boolean("is_verified").notNull().default(false),
    city: text("city"),
  },
  (table) => [uniqueIndex("reputelens_authors_handle_idx").on(table.handle)],
);
export const insertAuthorSchema = createInsertSchema(authorsTable).omit({ id: true });
export type InsertAuthor = z.infer<typeof insertAuthorSchema>;
export type Author = typeof authorsTable.$inferSelect;

export const mentionsTable = pgTable(
  "reputelens_mentions",
  {
    id: serial("id").primaryKey(),
    brandId: integer("brand_id").notNull().references(() => brandsTable.id, { onDelete: "cascade" }),
    authorId: integer("author_id").notNull().references(() => authorsTable.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    text: text("text").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    sentimentLabel: text("sentiment_label").notNull(),
    sentimentScore: doublePrecision("sentiment_score").notNull(),
    emotion: text("emotion").notNull(),
    aspects: jsonb("aspects").$type<string[]>().notNull().default([]),
    riskFlags: jsonb("risk_flags").$type<string[]>().notNull().default([]),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
    language: text("language").notNull().default("en"),
    city: text("city"),
    reachEstimate: integer("reach_estimate").notNull().default(0),
    priorityScore: doublePrecision("priority_score").notNull().default(0),
    suspicious: boolean("suspicious").notNull().default(false),
    isSarcastic: boolean("is_sarcastic").notNull().default(false),
    isComplaint: boolean("is_complaint").notNull().default(false),
    rating: integer("rating"),
  },
  (table) => [
    uniqueIndex("reputelens_mentions_source_external_idx").on(table.source, table.externalId),
    index("reputelens_mentions_brand_date_idx").on(table.brandId, table.createdAt),
    index("reputelens_mentions_sentiment_idx").on(table.sentimentLabel),
  ],
);
export const insertMentionSchema = createInsertSchema(mentionsTable).omit({ id: true });
export type InsertMention = z.infer<typeof insertMentionSchema>;
export type Mention = typeof mentionsTable.$inferSelect;

export const interactionsTable = pgTable("reputelens_interactions", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brandsTable.id, { onDelete: "cascade" }),
  sourceAuthorId: integer("source_author_id").notNull().references(() => authorsTable.id, { onDelete: "cascade" }),
  targetAuthorId: integer("target_author_id").notNull().references(() => authorsTable.id, { onDelete: "cascade" }),
  mentionId: integer("mention_id").references(() => mentionsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  weight: doublePrecision("weight").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertInteractionSchema = createInsertSchema(interactionsTable).omit({ id: true });
export type InsertInteraction = z.infer<typeof insertInteractionSchema>;
export type Interaction = typeof interactionsTable.$inferSelect;

export const topicsTable = pgTable("reputelens_topics", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brandsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  summary: text("summary").notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  mentionCount: integer("mention_count").notNull().default(0),
  avgSentiment: doublePrecision("avg_sentiment").notNull().default(0),
  negativeShare: doublePrecision("negative_share").notNull().default(0),
  growthRate: doublePrecision("growth_rate").notNull().default(0),
  isEmerging: boolean("is_emerging").notNull().default(false),
  emergedOn: date("emerged_on", { mode: "string" }),
});
export const insertTopicSchema = createInsertSchema(topicsTable).omit({ id: true });
export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type Topic = typeof topicsTable.$inferSelect;

export const alertsTable = pgTable(
  "reputelens_alerts",
  {
    id: serial("id").primaryKey(),
    brandId: integer("brand_id").notNull().references(() => brandsTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    metricValue: doublePrecision("metric_value").notNull().default(0),
    threshold: doublePrecision("threshold").notNull().default(0),
    evidenceIds: jsonb("evidence_ids").$type<number[]>().notNull().default([]),
  },
  (table) => [index("reputelens_alerts_brand_date_idx").on(table.brandId, table.createdAt)],
);
export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;

export const responseActionsTable = pgTable("reputelens_response_actions", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brandsTable.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull(),
  description: text("description").notNull(),
  respondedAt: timestamp("responded_at", { withTimezone: true }).notNull(),
  beforeSentiment: doublePrecision("before_sentiment").notNull().default(0),
  afterSentiment: doublePrecision("after_sentiment").notNull().default(0),
  beforeNegativePerDay: doublePrecision("before_negative_per_day").notNull().default(0),
  afterNegativePerDay: doublePrecision("after_negative_per_day").notNull().default(0),
  verdict: text("verdict").notNull().default("Partially effective"),
});
export const insertResponseActionSchema = createInsertSchema(responseActionsTable).omit({ id: true });
export type InsertResponseAction = z.infer<typeof insertResponseActionSchema>;
export type ResponseAction = typeof responseActionsTable.$inferSelect;

export const annotationsTable = pgTable("reputelens_annotations", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brandsTable.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  kind: text("kind").notNull(),
});
export const insertAnnotationSchema = createInsertSchema(annotationsTable).omit({ id: true });
export type InsertAnnotation = z.infer<typeof insertAnnotationSchema>;
export type EventAnnotation = typeof annotationsTable.$inferSelect;

export const settingsTable = pgTable("reputelens_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evaluationSamplesTable = pgTable("reputelens_evaluation_samples", {
  id: serial("id").primaryKey(),
  language: text("language").notNull(),
  goldSentiment: text("gold_sentiment").notNull(),
  vaderSentiment: text("vader_sentiment").notNull(),
  hybridSentiment: text("hybrid_sentiment").notNull(),
  goldAspect: text("gold_aspect").notNull(),
  predictedAspect: text("predicted_aspect").notNull(),
  goldEmotion: text("gold_emotion").notNull(),
  predictedEmotion: text("predicted_emotion").notNull(),
  isSarcastic: boolean("is_sarcastic").notNull(),
  sarcasmDetected: boolean("sarcasm_detected").notNull(),
});

export const supportedSentiment = z.enum(["positive", "neutral", "negative"]);

import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const { Pool } = pg;

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "reputelens_brands" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "color" text NOT NULL,
    "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "risk_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "reputelens_brands_name_unique" UNIQUE("name")
  );`,
  `CREATE TABLE IF NOT EXISTS "reputelens_authors" (
    "id" serial PRIMARY KEY NOT NULL,
    "handle" text NOT NULL,
    "display_name" text NOT NULL,
    "followers" integer DEFAULT 0 NOT NULL,
    "following" integer DEFAULT 0 NOT NULL,
    "account_age_days" integer DEFAULT 365 NOT NULL,
    "community_id" integer DEFAULT 1 NOT NULL,
    "influence_score" double precision DEFAULT 0 NOT NULL,
    "bot_likelihood" double precision DEFAULT 0 NOT NULL,
    "avg_sentiment" double precision DEFAULT 0 NOT NULL,
    "role" text DEFAULT 'regular' NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "city" text
  );`,
  `CREATE TABLE IF NOT EXISTS "reputelens_mentions" (
    "id" serial PRIMARY KEY NOT NULL,
    "brand_id" integer NOT NULL REFERENCES "reputelens_brands"("id") ON DELETE cascade,
    "author_id" integer NOT NULL REFERENCES "reputelens_authors"("id") ON DELETE cascade,
    "external_id" text NOT NULL,
    "text" text NOT NULL,
    "source" text NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "sentiment_label" text NOT NULL,
    "sentiment_score" double precision NOT NULL,
    "emotion" text NOT NULL,
    "aspects" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "risk_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "language" text DEFAULT 'en' NOT NULL,
    "city" text,
    "reach_estimate" integer DEFAULT 0 NOT NULL,
    "priority_score" double precision DEFAULT 0 NOT NULL,
    "suspicious" boolean DEFAULT false NOT NULL,
    "is_sarcastic" boolean DEFAULT false NOT NULL,
    "is_complaint" boolean DEFAULT false NOT NULL,
    "rating" integer
  );`,
  `CREATE TABLE IF NOT EXISTS "reputelens_interactions" (
    "id" serial PRIMARY KEY NOT NULL,
    "brand_id" integer NOT NULL REFERENCES "reputelens_brands"("id") ON DELETE cascade,
    "source_author_id" integer NOT NULL REFERENCES "reputelens_authors"("id") ON DELETE cascade,
    "target_author_id" integer NOT NULL REFERENCES "reputelens_authors"("id") ON DELETE cascade,
    "mention_id" integer REFERENCES "reputelens_mentions"("id") ON DELETE cascade,
    "type" text NOT NULL,
    "weight" double precision DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "reputelens_topics" (
    "id" serial PRIMARY KEY NOT NULL,
    "brand_id" integer NOT NULL REFERENCES "reputelens_brands"("id") ON DELETE cascade,
    "label" text NOT NULL,
    "summary" text NOT NULL,
    "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "mention_count" integer DEFAULT 0 NOT NULL,
    "avg_sentiment" double precision DEFAULT 0 NOT NULL,
    "negative_share" double precision DEFAULT 0 NOT NULL,
    "growth_rate" double precision DEFAULT 0 NOT NULL,
    "is_emerging" boolean DEFAULT false NOT NULL,
    "emerged_on" date
  );`,
  `CREATE TABLE IF NOT EXISTS "reputelens_alerts" (
    "id" serial PRIMARY KEY NOT NULL,
    "brand_id" integer NOT NULL REFERENCES "reputelens_brands"("id") ON DELETE cascade,
    "type" text NOT NULL,
    "severity" text NOT NULL,
    "title" text NOT NULL,
    "description" text NOT NULL,
    "status" text DEFAULT 'open' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "metric_value" double precision DEFAULT 0 NOT NULL,
    "threshold" double precision DEFAULT 0 NOT NULL,
    "evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "reputelens_response_actions" (
    "id" serial PRIMARY KEY NOT NULL,
    "brand_id" integer NOT NULL REFERENCES "reputelens_brands"("id") ON DELETE cascade,
    "action_type" text NOT NULL,
    "description" text NOT NULL,
    "responded_at" timestamp with time zone NOT NULL,
    "before_sentiment" double precision DEFAULT 0 NOT NULL,
    "after_sentiment" double precision DEFAULT 0 NOT NULL,
    "before_negative_per_day" double precision DEFAULT 0 NOT NULL,
    "after_negative_per_day" double precision DEFAULT 0 NOT NULL,
    "verdict" text DEFAULT 'Partially effective' NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "reputelens_annotations" (
    "id" serial PRIMARY KEY NOT NULL,
    "brand_id" integer NOT NULL REFERENCES "reputelens_brands"("id") ON DELETE cascade,
    "date" date NOT NULL,
    "title" text NOT NULL,
    "description" text NOT NULL,
    "kind" text NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "reputelens_settings" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" text NOT NULL,
    "value" jsonb NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "reputelens_settings_key_unique" UNIQUE("key")
  );`,
  `CREATE TABLE IF NOT EXISTS "reputelens_evaluation_samples" (
    "id" serial PRIMARY KEY NOT NULL,
    "language" text NOT NULL,
    "gold_sentiment" text NOT NULL,
    "vader_sentiment" text NOT NULL,
    "hybrid_sentiment" text NOT NULL,
    "gold_aspect" text NOT NULL,
    "predicted_aspect" text NOT NULL,
    "gold_emotion" text NOT NULL,
    "predicted_emotion" text NOT NULL,
    "is_sarcastic" boolean NOT NULL,
    "sarcasm_detected" boolean NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS "reputelens_alerts_brand_date_idx" ON "reputelens_alerts" ("brand_id","created_at");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "reputelens_authors_handle_idx" ON "reputelens_authors" ("handle");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "reputelens_mentions_source_external_idx" ON "reputelens_mentions" ("source","external_id");`,
  `CREATE INDEX IF NOT EXISTS "reputelens_mentions_brand_date_idx" ON "reputelens_mentions" ("brand_id","created_at");`,
  `CREATE INDEX IF NOT EXISTS "reputelens_mentions_sentiment_idx" ON "reputelens_mentions" ("sentiment_label");`,
];

let poolInstance: pg.Pool | null = null;
let pgliteInstance: PGlite | null = null;
let dbInstance: any = null;

function resolveDataDir(): string {
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }
  // Try to find project root data folder
  const candidates = [
    path.resolve(process.cwd(), "data/reputelens.db"),
    path.resolve(process.cwd(), "../../data/reputelens.db"),
  ];
  return candidates[0];
}

if (process.env.DATABASE_URL) {
  poolInstance = new Pool({ connectionString: process.env.DATABASE_URL });
  dbInstance = drizzleNodePg(poolInstance, { schema });
} else {
  const dbDir = resolveDataDir();
  fs.mkdirSync(dbDir, { recursive: true });
  pgliteInstance = new PGlite(dbDir);
  dbInstance = drizzlePglite(pgliteInstance, { schema });
}

export const pool = poolInstance;
export const pglite = pgliteInstance;
export const db = dbInstance;

export async function initDb(): Promise<void> {
  if (pgliteInstance) {
    for (const stmt of DDL_STATEMENTS) {
      await pgliteInstance.query(stmt);
    }
  } else if (poolInstance) {
    for (const stmt of DDL_STATEMENTS) {
      await poolInstance.query(stmt);
    }
  }
}

export * from "./schema";


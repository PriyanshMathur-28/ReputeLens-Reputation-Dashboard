CREATE TABLE "reputelens_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metric_value" double precision DEFAULT 0 NOT NULL,
	"threshold" double precision DEFAULT 0 NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputelens_annotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputelens_authors" (
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
);
--> statement-breakpoint
CREATE TABLE "reputelens_brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reputelens_brands_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "reputelens_evaluation_samples" (
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
);
--> statement-breakpoint
CREATE TABLE "reputelens_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"source_author_id" integer NOT NULL,
	"target_author_id" integer NOT NULL,
	"mention_id" integer,
	"type" text NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputelens_mentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"author_id" integer NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE "reputelens_response_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"action_type" text NOT NULL,
	"description" text NOT NULL,
	"responded_at" timestamp with time zone NOT NULL,
	"before_sentiment" double precision DEFAULT 0 NOT NULL,
	"after_sentiment" double precision DEFAULT 0 NOT NULL,
	"before_negative_per_day" double precision DEFAULT 0 NOT NULL,
	"after_negative_per_day" double precision DEFAULT 0 NOT NULL,
	"verdict" text DEFAULT 'Partially effective' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputelens_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reputelens_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "reputelens_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"label" text NOT NULL,
	"summary" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mention_count" integer DEFAULT 0 NOT NULL,
	"avg_sentiment" double precision DEFAULT 0 NOT NULL,
	"negative_share" double precision DEFAULT 0 NOT NULL,
	"growth_rate" double precision DEFAULT 0 NOT NULL,
	"is_emerging" boolean DEFAULT false NOT NULL,
	"emerged_on" date
);
--> statement-breakpoint
ALTER TABLE "reputelens_alerts" ADD CONSTRAINT "reputelens_alerts_brand_id_reputelens_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."reputelens_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputelens_annotations" ADD CONSTRAINT "reputelens_annotations_brand_id_reputelens_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."reputelens_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputelens_interactions" ADD CONSTRAINT "reputelens_interactions_brand_id_reputelens_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."reputelens_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputelens_interactions" ADD CONSTRAINT "reputelens_interactions_source_author_id_reputelens_authors_id_fk" FOREIGN KEY ("source_author_id") REFERENCES "public"."reputelens_authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputelens_interactions" ADD CONSTRAINT "reputelens_interactions_target_author_id_reputelens_authors_id_fk" FOREIGN KEY ("target_author_id") REFERENCES "public"."reputelens_authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputelens_interactions" ADD CONSTRAINT "reputelens_interactions_mention_id_reputelens_mentions_id_fk" FOREIGN KEY ("mention_id") REFERENCES "public"."reputelens_mentions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputelens_mentions" ADD CONSTRAINT "reputelens_mentions_brand_id_reputelens_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."reputelens_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputelens_mentions" ADD CONSTRAINT "reputelens_mentions_author_id_reputelens_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."reputelens_authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputelens_response_actions" ADD CONSTRAINT "reputelens_response_actions_brand_id_reputelens_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."reputelens_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputelens_topics" ADD CONSTRAINT "reputelens_topics_brand_id_reputelens_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."reputelens_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reputelens_alerts_brand_date_idx" ON "reputelens_alerts" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reputelens_authors_handle_idx" ON "reputelens_authors" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "reputelens_mentions_source_external_idx" ON "reputelens_mentions" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "reputelens_mentions_brand_date_idx" ON "reputelens_mentions" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "reputelens_mentions_sentiment_idx" ON "reputelens_mentions" USING btree ("sentiment_label");
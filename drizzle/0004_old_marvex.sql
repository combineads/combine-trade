CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "vectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candle_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"timeframe" text NOT NULL,
	"embedding" vector(202) NOT NULL,
	"label" text,
	"grade" text,
	"labeled_at" timestamp with time zone,
	"signal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vectors_candle_id_unique" UNIQUE("candle_id"),
	CONSTRAINT "vectors_timeframe_check" CHECK ("vectors"."timeframe" IN ('5M', '1M')),
	CONSTRAINT "vectors_label_check" CHECK ("vectors"."label" IS NULL OR "vectors"."label" IN ('WIN', 'LOSS', 'TIME_EXIT')),
	CONSTRAINT "vectors_grade_check" CHECK ("vectors"."grade" IS NULL OR "vectors"."grade" IN ('A', 'B', 'C'))
);
--> statement-breakpoint
ALTER TABLE "vectors" ADD CONSTRAINT "vectors_candle_id_candles_id_fk" FOREIGN KEY ("candle_id") REFERENCES "public"."candles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vectors" ADD CONSTRAINT "vectors_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_vector_id_vectors_id_fk" FOREIGN KEY ("vector_id") REFERENCES "public"."vectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vectors_symbol_exchange_timeframe_idx" ON "vectors" USING btree ("symbol","exchange","timeframe");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vectors_embedding_hnsw_idx" ON "vectors" USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 200);
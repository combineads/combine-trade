-- Extend trade_journals with macro context and retrospective columns.
-- All three columns are nullable — no backfill required.

ALTER TABLE "trade_journals" ADD COLUMN IF NOT EXISTS "entry_macro_context" jsonb;
--> statement-breakpoint
ALTER TABLE "trade_journals" ADD COLUMN IF NOT EXISTS "retrospective_report" text;
--> statement-breakpoint
ALTER TABLE "trade_journals" ADD COLUMN IF NOT EXISTS "retrospective_generated_at" timestamp with time zone;

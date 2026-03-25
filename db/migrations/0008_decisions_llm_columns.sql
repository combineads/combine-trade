-- Extend decisions with LLM evaluation result columns (T-16-018).
-- All five columns are nullable — kNN-only decisions never populate them.

ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "llm_action" text;
--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "llm_reason" text;
--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "llm_confidence" real;
--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "llm_risk_factors" jsonb;
--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "llm_evaluated_at" timestamp with time zone;

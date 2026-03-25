-- Add use_llm_filter boolean column to strategies table.
-- Existing strategies default to false (opt-out). Column is NOT NULL.

ALTER TABLE "strategies" ADD COLUMN "use_llm_filter" boolean NOT NULL DEFAULT false;

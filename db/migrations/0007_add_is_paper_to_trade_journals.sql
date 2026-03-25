-- Add is_paper flag to trade_journals to distinguish paper trades from live trades.
-- Defaults to false so existing rows are treated as live (non-breaking migration).

ALTER TABLE "trade_journals" ADD COLUMN IF NOT EXISTS "is_paper" boolean NOT NULL DEFAULT false;

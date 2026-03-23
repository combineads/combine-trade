-- Add description (nullable text) and deleted_at (nullable timestamptz) to strategies.
-- These columns exist in the Drizzle schema but were missing from the original migration.

ALTER TABLE "strategies" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

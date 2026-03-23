-- Migrate legacy `users` table references to Better Auth `user` table.
-- Drops FK constraints pointing to `users`, changes user_id columns from uuid
-- to text, re-adds FKs pointing to `user` (Better Auth), then drops `users`.

-- Step 1: Drop FK constraints referencing the legacy users table
ALTER TABLE "exchange_credentials" DROP CONSTRAINT "exchange_credentials_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "paper_balances" DROP CONSTRAINT "paper_balances_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "paper_orders" DROP CONSTRAINT "paper_orders_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "paper_positions" DROP CONSTRAINT "paper_positions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "trade_journals" DROP CONSTRAINT "trade_journals_user_id_users_id_fk";
--> statement-breakpoint

-- Step 2: Change user_id columns from uuid to text
ALTER TABLE "exchange_credentials" ALTER COLUMN "user_id" TYPE text USING user_id::text;
--> statement-breakpoint
ALTER TABLE "paper_balances" ALTER COLUMN "user_id" TYPE text USING user_id::text;
--> statement-breakpoint
ALTER TABLE "paper_orders" ALTER COLUMN "user_id" TYPE text USING user_id::text;
--> statement-breakpoint
ALTER TABLE "paper_positions" ALTER COLUMN "user_id" TYPE text USING user_id::text;
--> statement-breakpoint
ALTER TABLE "trade_journals" ALTER COLUMN "user_id" TYPE text USING user_id::text;
--> statement-breakpoint

-- Step 3: Add FK constraints pointing to Better Auth `user` table
ALTER TABLE "exchange_credentials" ADD CONSTRAINT "exchange_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "paper_balances" ADD CONSTRAINT "paper_balances_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trade_journals" ADD CONSTRAINT "trade_journals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Step 4: Drop legacy users table (empty — no data migration needed)
DROP TABLE "users";

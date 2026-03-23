-- Add user_id (text, FK to better-auth user table) to tables that were
-- created before the better-auth migration was applied.
-- These tables were originally generated without user_id because the
-- better-auth schema was added after the initial migration.

ALTER TABLE "strategies" ADD COLUMN "user_id" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "strategies" ALTER COLUMN "user_id" DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE "orders" ADD COLUMN "user_id" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "user_id" DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE "kill_switch_state" ADD COLUMN "user_id" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "kill_switch_state" ADD CONSTRAINT "kill_switch_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kill_switch_state" ALTER COLUMN "user_id" DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE "kill_switch_events" ADD COLUMN "user_id" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "kill_switch_events" ADD CONSTRAINT "kill_switch_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kill_switch_events" ALTER COLUMN "user_id" DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE "daily_loss_limits" ADD COLUMN "user_id" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "daily_loss_limits" ADD CONSTRAINT "daily_loss_limits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "daily_loss_limits" ALTER COLUMN "user_id" DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE "daily_pnl_tracking" ADD COLUMN "user_id" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "daily_pnl_tracking" ADD CONSTRAINT "daily_pnl_tracking_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "daily_pnl_tracking" ALTER COLUMN "user_id" DROP DEFAULT;

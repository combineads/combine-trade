CREATE TABLE "trade_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_type" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"reason" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurrence_rule" jsonb,
	"source_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_block_block_type_check" CHECK ("trade_block"."block_type" IN ('ECONOMIC', 'FUNDING', 'MANUAL', 'MARKET_OPEN'))
);
--> statement-breakpoint
CREATE TABLE "watch_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"detection_type" text NOT NULL,
	"direction" text NOT NULL,
	"tp1_price" numeric,
	"tp2_price" numeric,
	"detected_at" timestamp with time zone NOT NULL,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	"context_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_session_detection_type_check" CHECK ("watch_session"."detection_type" IN ('SQUEEZE_BREAKOUT', 'SR_CONFLUENCE', 'BB4_TOUCH')),
	CONSTRAINT "watch_session_direction_check" CHECK ("watch_session"."direction" IN ('LONG', 'SHORT'))
);
--> statement-breakpoint
ALTER TABLE "watch_session" ADD CONSTRAINT "watch_session_symbol_exchange_symbol_symbol_exchange_fk" FOREIGN KEY ("symbol","exchange") REFERENCES "public"."symbol"("symbol","exchange") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_block_recurring_idx" ON "trade_block" USING btree ("is_recurring") WHERE "trade_block"."is_recurring" = true;--> statement-breakpoint
CREATE INDEX "trade_block_onetime_idx" ON "trade_block" USING btree ("start_time","end_time") WHERE "trade_block"."is_recurring" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "watch_session_active_unique_idx" ON "watch_session" USING btree ("symbol","exchange") WHERE "watch_session"."invalidated_at" IS NULL;--> statement-breakpoint
CREATE INDEX "watch_session_symbol_exchange_invalidated_idx" ON "watch_session" USING btree ("symbol","exchange","invalidated_at");
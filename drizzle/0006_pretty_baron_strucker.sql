CREATE TABLE "event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"symbol" text,
	"exchange" text,
	"ref_id" uuid,
	"ref_type" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "event_log_event_type_created_at_idx" ON "event_log" USING btree ("event_type","created_at" DESC);--> statement-breakpoint
CREATE INDEX "event_log_symbol_exchange_created_at_idx" ON "event_log" USING btree ("symbol","exchange","created_at" DESC);--> statement-breakpoint
CREATE INDEX "event_log_ref_type_ref_id_idx" ON "event_log" USING btree ("ref_type","ref_id");
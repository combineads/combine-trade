CREATE TABLE "signal_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" numeric,
	"text_value" text
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"watch_session_id" uuid NOT NULL,
	"timeframe" text NOT NULL,
	"signal_type" text NOT NULL,
	"direction" text NOT NULL,
	"entry_price" numeric NOT NULL,
	"sl_price" numeric NOT NULL,
	"safety_passed" boolean NOT NULL,
	"knn_decision" text,
	"a_grade" boolean DEFAULT false NOT NULL,
	"vector_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signals_timeframe_check" CHECK ("signals"."timeframe" IN ('5M', '1M')),
	CONSTRAINT "signals_signal_type_check" CHECK ("signals"."signal_type" IN ('DOUBLE_B', 'ONE_B')),
	CONSTRAINT "signals_direction_check" CHECK ("signals"."direction" IN ('LONG', 'SHORT')),
	CONSTRAINT "signals_knn_decision_check" CHECK ("signals"."knn_decision" IS NULL OR "signals"."knn_decision" IN ('PASS', 'FAIL', 'SKIP'))
);
--> statement-breakpoint
ALTER TABLE "signal_details" ADD CONSTRAINT "signal_details_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_symbol_exchange_symbol_symbol_exchange_fk" FOREIGN KEY ("symbol","exchange") REFERENCES "public"."symbol"("symbol","exchange") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_watch_session_id_watch_session_id_fk" FOREIGN KEY ("watch_session_id") REFERENCES "public"."watch_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signal_details_signal_id_key_idx" ON "signal_details" USING btree ("signal_id","key");--> statement-breakpoint
CREATE INDEX "signal_details_key_value_idx" ON "signal_details" USING btree ("key","value");
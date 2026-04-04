CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid,
	"exchange" text NOT NULL,
	"order_type" text NOT NULL,
	"status" text NOT NULL,
	"side" text NOT NULL,
	"price" numeric,
	"expected_price" numeric,
	"size" numeric NOT NULL,
	"filled_price" numeric,
	"filled_size" numeric,
	"exchange_order_id" text,
	"intent_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"slippage" numeric,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_exchange_check" CHECK ("orders"."exchange" IN ('binance', 'okx', 'bitget', 'mexc')),
	CONSTRAINT "orders_order_type_check" CHECK ("orders"."order_type" IN ('ENTRY', 'SL', 'TP1', 'TP2', 'TRAILING', 'PYRAMID', 'PANIC_CLOSE', 'TIME_EXIT')),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" IN ('PENDING', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'FAILED')),
	CONSTRAINT "orders_side_check" CHECK ("orders"."side" IN ('BUY', 'SELL'))
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"signal_id" uuid NOT NULL,
	"parent_ticket_id" uuid,
	"timeframe" text NOT NULL,
	"direction" text NOT NULL,
	"state" text DEFAULT 'INITIAL' NOT NULL,
	"entry_price" numeric NOT NULL,
	"sl_price" numeric NOT NULL,
	"current_sl_price" numeric NOT NULL,
	"size" numeric NOT NULL,
	"remaining_size" numeric NOT NULL,
	"leverage" integer NOT NULL,
	"tp1_price" numeric,
	"tp2_price" numeric,
	"trailing_active" boolean DEFAULT false,
	"trailing_price" numeric,
	"max_profit" numeric DEFAULT '0',
	"pyramid_count" integer DEFAULT 0,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"result" text,
	"pnl" numeric,
	"pnl_pct" numeric,
	"max_favorable" numeric,
	"max_adverse" numeric,
	"hold_duration_sec" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_signal_id_unique" UNIQUE("signal_id"),
	CONSTRAINT "tickets_state_check" CHECK ("tickets"."state" IN ('INITIAL', 'TP1_HIT', 'TP2_HIT', 'CLOSED')),
	CONSTRAINT "tickets_direction_check" CHECK ("tickets"."direction" IN ('LONG', 'SHORT')),
	CONSTRAINT "tickets_timeframe_check" CHECK ("tickets"."timeframe" IN ('5M', '1M')),
	CONSTRAINT "tickets_close_reason_check" CHECK ("tickets"."close_reason" IS NULL OR "tickets"."close_reason" IN ('SL', 'TP1', 'TP2', 'TRAILING', 'TIME_EXIT', 'PANIC_CLOSE', 'MANUAL')),
	CONSTRAINT "tickets_result_check" CHECK ("tickets"."result" IS NULL OR "tickets"."result" IN ('WIN', 'LOSS', 'TIME_EXIT')),
	CONSTRAINT "tickets_exchange_check" CHECK ("tickets"."exchange" IN ('binance', 'okx', 'bitget', 'mexc'))
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_symbol_exchange_symbol_symbol_exchange_fk" FOREIGN KEY ("symbol","exchange") REFERENCES "public"."symbol"("symbol","exchange") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parent_ticket_id_fk" FOREIGN KEY ("parent_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_exchange_idempotency_key_idx" ON "orders" USING btree ("exchange","idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_ticket_id_created_at_idx" ON "orders" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_intent_id_idx" ON "orders" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "tickets_active_idx" ON "tickets" USING btree ("symbol","exchange","state") WHERE "tickets"."state" != 'CLOSED';
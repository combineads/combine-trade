CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"message" text NOT NULL,
	"delivery_state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "candles" (
	"exchange" text NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"open_time" timestamp with time zone NOT NULL,
	"open" text NOT NULL,
	"high" text NOT NULL,
	"low" text NOT NULL,
	"close" text NOT NULL,
	"volume" text NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_loss_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid,
	"limit_amount" text NOT NULL,
	"reset_hour" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_pnl_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"strategy_id" uuid,
	"symbol" text,
	"realized_pnl" text DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"strategy_id" uuid NOT NULL,
	"strategy_version" text NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"sample_count" text NOT NULL,
	"winrate" text NOT NULL,
	"expectancy" text NOT NULL,
	"avg_win" text NOT NULL,
	"avg_loss" text NOT NULL,
	"ci_lower" text,
	"ci_upper" text,
	"confidence_tier" text,
	"similarity_top1_score" text,
	"decision_reason" text NOT NULL,
	"execution_mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"snapshot_type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"result_type" text NOT NULL,
	"pnl_pct" text NOT NULL,
	"mfe_pct" text NOT NULL,
	"mae_pct" text NOT NULL,
	"hold_bars" integer NOT NULL,
	"exit_price" text NOT NULL,
	"sl_hit_first" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exchange" text NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"api_secret_encrypted" text NOT NULL,
	"label" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_rates" (
	"exchange" text NOT NULL,
	"symbol" text NOT NULL,
	"funding_rate" text NOT NULL,
	"funding_time" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kill_switch_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"triggered_at" timestamp with time zone NOT NULL,
	"deactivated_at" timestamp with time zone,
	"scope" text NOT NULL,
	"scope_target" text,
	"trigger_type" text NOT NULL,
	"trigger_detail" text NOT NULL,
	"had_open_positions" boolean DEFAULT false NOT NULL,
	"positions_snapshot" jsonb,
	"deactivated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kill_switch_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid,
	"is_active" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	"activated_by" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"decision_id" uuid NOT NULL,
	"strategy_id" uuid NOT NULL,
	"exchange" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"order_type" text NOT NULL,
	"price" text NOT NULL,
	"quantity" text NOT NULL,
	"filled_quantity" text DEFAULT '0' NOT NULL,
	"sl_price" text,
	"tp_price" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"exchange_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exchange" text NOT NULL,
	"balance" text NOT NULL,
	"initial_balance" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"strategy_id" uuid NOT NULL,
	"event_id" uuid,
	"exchange" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"order_type" text NOT NULL,
	"price" text NOT NULL,
	"quantity" text NOT NULL,
	"filled_quantity" text DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"strategy_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"quantity" text NOT NULL,
	"entry_price" text NOT NULL,
	"unrealized_pnl" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"symbols" text[] NOT NULL,
	"timeframe" text NOT NULL,
	"direction" text NOT NULL,
	"features_definition" jsonb NOT NULL,
	"normalization_config" jsonb NOT NULL,
	"search_config" jsonb NOT NULL,
	"result_config" jsonb NOT NULL,
	"decision_config" jsonb NOT NULL,
	"execution_mode" text DEFAULT 'analysis' NOT NULL,
	"api_version" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"strategy_version" text NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"event_time" timestamp with time zone NOT NULL,
	"direction" text NOT NULL,
	"features_vector" jsonb NOT NULL,
	"entry_price" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"entry_snapshot_id" uuid,
	"strategy_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"entry_price" text NOT NULL,
	"exit_price" text,
	"quantity" text NOT NULL,
	"gross_pnl" text,
	"net_pnl" text,
	"fees_paid" text,
	"funding_paid" text,
	"entry_time" timestamp with time zone NOT NULL,
	"exit_time" timestamp with time zone,
	"hold_bars" integer,
	"mfe_pct" text,
	"mae_pct" text,
	"exit_market_context" jsonb,
	"matched_patterns" jsonb,
	"auto_tags" text[],
	"user_notes" text,
	"notes" text,
	"tags" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vector_table_registry" (
	"strategy_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"table_name" text NOT NULL,
	"dimension" integer NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_event_id_strategy_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."strategy_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_event_id_strategy_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."strategy_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_snapshots" ADD CONSTRAINT "entry_snapshots_event_id_strategy_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."strategy_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_labels" ADD CONSTRAINT "event_labels_event_id_strategy_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."strategy_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_credentials" ADD CONSTRAINT "exchange_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_strategy_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."strategy_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_balances" ADD CONSTRAINT "paper_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_orders" ADD CONSTRAINT "paper_orders_event_id_strategy_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."strategy_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_events" ADD CONSTRAINT "strategy_events_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_journals" ADD CONSTRAINT "trade_journals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_journals" ADD CONSTRAINT "trade_journals_event_id_strategy_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."strategy_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_journals" ADD CONSTRAINT "trade_journals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_journals" ADD CONSTRAINT "trade_journals_entry_snapshot_id_entry_snapshots_id_fk" FOREIGN KEY ("entry_snapshot_id") REFERENCES "public"."entry_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_journals" ADD CONSTRAINT "trade_journals_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candles_symbol_timeframe_idx" ON "candles" USING btree ("symbol","timeframe");
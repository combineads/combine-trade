CREATE TABLE "common_code" (
	"group_code" text NOT NULL,
	"code" text NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "common_code_group_code_code_pk" PRIMARY KEY("group_code","code")
);
--> statement-breakpoint
CREATE TABLE "symbol_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"fsm_state" text DEFAULT 'IDLE' NOT NULL,
	"execution_mode" text DEFAULT 'analysis' NOT NULL,
	"daily_bias" text,
	"daily_open" numeric,
	"session_box_high" numeric,
	"session_box_low" numeric,
	"losses_today" numeric DEFAULT '0',
	"losses_session" integer DEFAULT 0,
	"losses_this_1h_5m" integer DEFAULT 0,
	"losses_this_1h_1m" integer DEFAULT 0,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "symbol_state_fsm_state_check" CHECK ("symbol_state"."fsm_state" IN ('IDLE', 'WATCHING', 'HAS_POSITION')),
	CONSTRAINT "symbol_state_execution_mode_check" CHECK ("symbol_state"."execution_mode" IN ('analysis', 'alert', 'live'))
);
--> statement-breakpoint
CREATE TABLE "symbol" (
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"name" text NOT NULL,
	"base_asset" text NOT NULL,
	"quote_asset" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "symbol_symbol_exchange_pk" PRIMARY KEY("symbol","exchange")
);
--> statement-breakpoint
ALTER TABLE "symbol_state" ADD CONSTRAINT "symbol_state_symbol_exchange_symbol_symbol_exchange_fk" FOREIGN KEY ("symbol","exchange") REFERENCES "public"."symbol"("symbol","exchange") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "common_code_group_code_idx" ON "common_code" USING btree ("group_code");--> statement-breakpoint
CREATE UNIQUE INDEX "symbol_state_symbol_exchange_idx" ON "symbol_state" USING btree ("symbol","exchange");
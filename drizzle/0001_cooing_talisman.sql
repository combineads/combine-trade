CREATE TABLE "candles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"timeframe" text NOT NULL,
	"open_time" timestamp with time zone NOT NULL,
	"open" numeric NOT NULL,
	"high" numeric NOT NULL,
	"low" numeric NOT NULL,
	"close" numeric NOT NULL,
	"volume" numeric NOT NULL,
	"is_closed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candles_timeframe_check" CHECK ("candles"."timeframe" IN ('1D', '1H', '5M', '1M'))
);
--> statement-breakpoint
ALTER TABLE "candles" ADD CONSTRAINT "candles_symbol_exchange_symbol_symbol_exchange_fk" FOREIGN KEY ("symbol","exchange") REFERENCES "public"."symbol"("symbol","exchange") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candles_symbol_exchange_tf_opentime_idx" ON "candles" USING btree ("symbol","exchange","timeframe","open_time");--> statement-breakpoint
CREATE INDEX "candles_recent_idx" ON "candles" USING btree ("symbol","exchange","timeframe","open_time");
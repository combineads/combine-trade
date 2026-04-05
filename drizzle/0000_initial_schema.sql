-- combine-trade 초기 스키마
-- 7개 증분 마이그레이션(0000~0006)을 통합한 단일 초기 스키마
-- 테이블 생성 순서: FK 의존성을 고려하여 정렬

-- ============================================================================
-- pgvector 확장
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Master 테이블
-- ============================================================================

-- 거래 심볼 (거래소별 독립)
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

-- 심볼별 운영 상태 (FSM, 방향, 손실 카운터)
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

-- ============================================================================
-- Reference 테이블
-- ============================================================================

-- 공통 코드 (모든 설정/파라미터)
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

-- ============================================================================
-- Transaction 테이블
-- ============================================================================

-- 캔들 OHLCV 시계열
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

-- 거래 차단 (경제이벤트, 펀딩비, 장개장, 수동)
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

-- 감시 세션 (1H 마감 시 시작 → 진입 탐색 → 전제 붕괴 시 종료)
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

-- 시그널 (파이프라인 산출)
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

-- 시그널 관측값 (key-value)
CREATE TABLE "signal_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" numeric,
	"text_value" text
);

-- 202차원 특징 벡터 + KNN 학습 라벨/등급
CREATE TABLE "vectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candle_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"timeframe" text NOT NULL,
	"embedding" vector(202) NOT NULL,
	"label" text,
	"grade" text,
	"labeled_at" timestamp with time zone,
	"signal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vectors_candle_id_unique" UNIQUE("candle_id"),
	CONSTRAINT "vectors_timeframe_check" CHECK ("vectors"."timeframe" IN ('5M', '1M')),
	CONSTRAINT "vectors_label_check" CHECK ("vectors"."label" IS NULL OR "vectors"."label" IN ('WIN', 'LOSS', 'TIME_EXIT')),
	CONSTRAINT "vectors_grade_check" CHECK ("vectors"."grade" IS NULL OR "vectors"."grade" IN ('A', 'B', 'C'))
);

-- 포지션 티켓 (FSM + 거래 결과)
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

-- 거래소 주문 기록
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

-- 이벤트 로그 (append-only 감사 이력)
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

-- ============================================================================
-- Foreign Keys
-- ============================================================================

-- symbol_state → symbol
ALTER TABLE "symbol_state" ADD CONSTRAINT "symbol_state_symbol_exchange_symbol_symbol_exchange_fk" FOREIGN KEY ("symbol","exchange") REFERENCES "public"."symbol"("symbol","exchange") ON DELETE cascade ON UPDATE no action;

-- candles → symbol
ALTER TABLE "candles" ADD CONSTRAINT "candles_symbol_exchange_symbol_symbol_exchange_fk" FOREIGN KEY ("symbol","exchange") REFERENCES "public"."symbol"("symbol","exchange") ON DELETE restrict ON UPDATE no action;

-- watch_session → symbol
ALTER TABLE "watch_session" ADD CONSTRAINT "watch_session_symbol_exchange_symbol_symbol_exchange_fk" FOREIGN KEY ("symbol","exchange") REFERENCES "public"."symbol"("symbol","exchange") ON DELETE restrict ON UPDATE no action;

-- signals → symbol, watch_session
ALTER TABLE "signals" ADD CONSTRAINT "signals_symbol_exchange_symbol_symbol_exchange_fk" FOREIGN KEY ("symbol","exchange") REFERENCES "public"."symbol"("symbol","exchange") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "signals" ADD CONSTRAINT "signals_watch_session_id_watch_session_id_fk" FOREIGN KEY ("watch_session_id") REFERENCES "public"."watch_session"("id") ON DELETE restrict ON UPDATE no action;

-- signal_details → signals
ALTER TABLE "signal_details" ADD CONSTRAINT "signal_details_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;

-- vectors → candles, signals
ALTER TABLE "vectors" ADD CONSTRAINT "vectors_candle_id_candles_id_fk" FOREIGN KEY ("candle_id") REFERENCES "public"."candles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vectors" ADD CONSTRAINT "vectors_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE set null ON UPDATE no action;

-- signals → vectors (순환 참조: vector_id는 벡터 생성 후 갱신)
ALTER TABLE "signals" ADD CONSTRAINT "signals_vector_id_vectors_id_fk" FOREIGN KEY ("vector_id") REFERENCES "public"."vectors"("id") ON DELETE set null ON UPDATE no action;

-- tickets → symbol, signals, self (피라미딩)
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_symbol_exchange_symbol_symbol_exchange_fk" FOREIGN KEY ("symbol","exchange") REFERENCES "public"."symbol"("symbol","exchange") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parent_ticket_id_fk" FOREIGN KEY ("parent_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;

-- orders → tickets
ALTER TABLE "orders" ADD CONSTRAINT "orders_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;

-- ============================================================================
-- Indexes
-- ============================================================================

-- common_code
CREATE INDEX "common_code_group_code_idx" ON "common_code" USING btree ("group_code");

-- symbol_state
CREATE UNIQUE INDEX "symbol_state_symbol_exchange_idx" ON "symbol_state" USING btree ("symbol","exchange");

-- candles
CREATE UNIQUE INDEX "candles_symbol_exchange_tf_opentime_idx" ON "candles" USING btree ("symbol","exchange","timeframe","open_time");
CREATE INDEX "candles_recent_idx" ON "candles" USING btree ("symbol","exchange","timeframe","open_time");

-- trade_block
CREATE INDEX "trade_block_recurring_idx" ON "trade_block" USING btree ("is_recurring") WHERE "trade_block"."is_recurring" = true;
CREATE INDEX "trade_block_onetime_idx" ON "trade_block" USING btree ("start_time","end_time") WHERE "trade_block"."is_recurring" = false;

-- watch_session
CREATE UNIQUE INDEX "watch_session_active_unique_idx" ON "watch_session" USING btree ("symbol","exchange") WHERE "watch_session"."invalidated_at" IS NULL;
CREATE INDEX "watch_session_symbol_exchange_invalidated_idx" ON "watch_session" USING btree ("symbol","exchange","invalidated_at");

-- signal_details
CREATE UNIQUE INDEX "signal_details_signal_id_key_idx" ON "signal_details" USING btree ("signal_id","key");
CREATE INDEX "signal_details_key_value_idx" ON "signal_details" USING btree ("key","value");

-- vectors (HNSW 인덱스: 202차원 cosine 유사도)
CREATE INDEX "vectors_symbol_exchange_timeframe_idx" ON "vectors" USING btree ("symbol","exchange","timeframe");
CREATE INDEX IF NOT EXISTS "vectors_embedding_hnsw_idx" ON "vectors" USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 200);

-- orders
CREATE UNIQUE INDEX "orders_exchange_idempotency_key_idx" ON "orders" USING btree ("exchange","idempotency_key");
CREATE INDEX "orders_ticket_id_created_at_idx" ON "orders" USING btree ("ticket_id","created_at");
CREATE INDEX "orders_intent_id_idx" ON "orders" USING btree ("intent_id");

-- tickets
CREATE INDEX "tickets_active_idx" ON "tickets" USING btree ("symbol","exchange","state") WHERE "tickets"."state" != 'CLOSED';

-- event_log
CREATE INDEX "event_log_event_type_created_at_idx" ON "event_log" USING btree ("event_type","created_at" DESC);
CREATE INDEX "event_log_symbol_exchange_created_at_idx" ON "event_log" USING btree ("symbol","exchange","created_at" DESC);
CREATE INDEX "event_log_ref_type_ref_id_idx" ON "event_log" USING btree ("ref_type","ref_id");

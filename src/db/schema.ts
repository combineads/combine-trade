import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// pgvector custom type: vector(202)
// ---------------------------------------------------------------------------

const vectorType = customType<{ data: string; driverParam: string }>({
  dataType() {
    return "vector(202)";
  },
  toDriver(value: unknown): string {
    return value as string;
  },
  fromDriver(value: unknown): string {
    return value as string;
  },
});

// ---------------------------------------------------------------------------
// symbol table
// ---------------------------------------------------------------------------

export const symbolTable = pgTable(
  "symbol",
  {
    symbol: text("symbol").notNull(),
    exchange: text("exchange").notNull(),
    name: text("name").notNull(),
    base_asset: text("base_asset").notNull(),
    quote_asset: text("quote_asset").notNull(),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.exchange] })],
);

export type Symbol = InferSelectModel<typeof symbolTable>;
export type NewSymbol = InferInsertModel<typeof symbolTable>;

// ---------------------------------------------------------------------------
// symbol_state table
// ---------------------------------------------------------------------------

export const symbolStateTable = pgTable(
  "symbol_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    exchange: text("exchange").notNull(),
    fsm_state: text("fsm_state").notNull().default("IDLE"),
    execution_mode: text("execution_mode").notNull().default("analysis"),
    daily_bias: text("daily_bias"),
    daily_open: numeric("daily_open"),
    session_box_high: numeric("session_box_high"),
    session_box_low: numeric("session_box_low"),
    losses_today: numeric("losses_today").default("0"),
    losses_session: integer("losses_session").default(0),
    losses_this_1h_5m: integer("losses_this_1h_5m").default(0),
    losses_this_1h_1m: integer("losses_this_1h_1m").default(0),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("symbol_state_symbol_exchange_idx").on(t.symbol, t.exchange),
    foreignKey({
      columns: [t.symbol, t.exchange],
      foreignColumns: [symbolTable.symbol, symbolTable.exchange],
    }).onDelete("cascade"),
    check(
      "symbol_state_fsm_state_check",
      sql`${t.fsm_state} IN ('IDLE', 'WATCHING', 'HAS_POSITION')`,
    ),
    check(
      "symbol_state_execution_mode_check",
      sql`${t.execution_mode} IN ('analysis', 'alert', 'live')`,
    ),
  ],
);

export type SymbolStateRow = InferSelectModel<typeof symbolStateTable>;
export type NewSymbolStateRow = InferInsertModel<typeof symbolStateTable>;

// ---------------------------------------------------------------------------
// common_code table
// ---------------------------------------------------------------------------

export const commonCodeTable = pgTable(
  "common_code",
  {
    group_code: text("group_code").notNull(),
    code: text("code").notNull(),
    value: jsonb("value").notNull(),
    description: text("description"),
    sort_order: integer("sort_order").default(0),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.group_code, t.code] }),
    index("common_code_group_code_idx").on(t.group_code),
  ],
);

export type CommonCodeRow = InferSelectModel<typeof commonCodeTable>;
export type NewCommonCodeRow = InferInsertModel<typeof commonCodeTable>;

// ---------------------------------------------------------------------------
// candles table
// ---------------------------------------------------------------------------

export const candleTable = pgTable(
  "candles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    exchange: text("exchange").notNull(),
    timeframe: text("timeframe").notNull(),
    open_time: timestamp("open_time", { withTimezone: true, mode: "date" }).notNull(),
    open: numeric("open").notNull(),
    high: numeric("high").notNull(),
    low: numeric("low").notNull(),
    close: numeric("close").notNull(),
    volume: numeric("volume").notNull(),
    is_closed: boolean("is_closed").default(false),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.symbol, t.exchange],
      foreignColumns: [symbolTable.symbol, symbolTable.exchange],
    }).onDelete("restrict"),
    uniqueIndex("candles_symbol_exchange_tf_opentime_idx").on(
      t.symbol,
      t.exchange,
      t.timeframe,
      t.open_time,
    ),
    index("candles_recent_idx").on(t.symbol, t.exchange, t.timeframe, t.open_time),
    check("candles_timeframe_check", sql`${t.timeframe} IN ('1D', '1H', '5M', '1M')`),
  ],
);

export type CandleRow = InferSelectModel<typeof candleTable>;
export type NewCandleRow = InferInsertModel<typeof candleTable>;

// ---------------------------------------------------------------------------
// trade_block table
// ---------------------------------------------------------------------------

export const tradeBlockTable = pgTable(
  "trade_block",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    block_type: text("block_type").notNull(),
    start_time: timestamp("start_time", { withTimezone: true, mode: "date" }).notNull(),
    end_time: timestamp("end_time", { withTimezone: true, mode: "date" }).notNull(),
    reason: text("reason"),
    is_recurring: boolean("is_recurring").notNull().default(false),
    recurrence_rule: jsonb("recurrence_rule"),
    source_data: jsonb("source_data"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "trade_block_block_type_check",
      sql`${t.block_type} IN ('ECONOMIC', 'FUNDING', 'MANUAL', 'MARKET_OPEN')`,
    ),
    index("trade_block_recurring_idx").on(t.is_recurring).where(sql`${t.is_recurring} = true`),
    index("trade_block_onetime_idx")
      .on(t.start_time, t.end_time)
      .where(sql`${t.is_recurring} = false`),
  ],
);

export type TradeBlockRow = InferSelectModel<typeof tradeBlockTable>;
export type NewTradeBlockRow = InferInsertModel<typeof tradeBlockTable>;

// ---------------------------------------------------------------------------
// watch_session table
// ---------------------------------------------------------------------------

export const watchSessionTable = pgTable(
  "watch_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    exchange: text("exchange").notNull(),
    detection_type: text("detection_type").notNull(),
    direction: text("direction").notNull(),
    tp1_price: numeric("tp1_price"),
    tp2_price: numeric("tp2_price"),
    detected_at: timestamp("detected_at", { withTimezone: true, mode: "date" }).notNull(),
    invalidated_at: timestamp("invalidated_at", { withTimezone: true, mode: "date" }),
    invalidation_reason: text("invalidation_reason"),
    context_data: jsonb("context_data"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.symbol, t.exchange],
      foreignColumns: [symbolTable.symbol, symbolTable.exchange],
    }).onDelete("restrict"),
    check(
      "watch_session_detection_type_check",
      sql`${t.detection_type} IN ('SQUEEZE_BREAKOUT', 'SR_CONFLUENCE', 'BB4_TOUCH')`,
    ),
    check("watch_session_direction_check", sql`${t.direction} IN ('LONG', 'SHORT')`),
    uniqueIndex("watch_session_active_unique_idx")
      .on(t.symbol, t.exchange)
      .where(sql`${t.invalidated_at} IS NULL`),
    index("watch_session_symbol_exchange_invalidated_idx").on(
      t.symbol,
      t.exchange,
      t.invalidated_at,
    ),
  ],
);

export type WatchSessionRow = InferSelectModel<typeof watchSessionTable>;
export type NewWatchSessionRow = InferInsertModel<typeof watchSessionTable>;

// ---------------------------------------------------------------------------
// signals table
// ---------------------------------------------------------------------------

export const signalTable = pgTable(
  "signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    exchange: text("exchange").notNull(),
    watch_session_id: uuid("watch_session_id").notNull(),
    timeframe: text("timeframe").notNull(),
    signal_type: text("signal_type").notNull(),
    direction: text("direction").notNull(),
    entry_price: numeric("entry_price").notNull(),
    sl_price: numeric("sl_price").notNull(),
    safety_passed: boolean("safety_passed").notNull(),
    knn_decision: text("knn_decision"),
    a_grade: boolean("a_grade").notNull().default(false),
    vector_id: uuid("vector_id"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.symbol, t.exchange],
      foreignColumns: [symbolTable.symbol, symbolTable.exchange],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.watch_session_id],
      foreignColumns: [watchSessionTable.id],
    }).onDelete("restrict"),
    check("signals_timeframe_check", sql`${t.timeframe} IN ('5M', '1M')`),
    check("signals_signal_type_check", sql`${t.signal_type} IN ('DOUBLE_B', 'ONE_B')`),
    check("signals_direction_check", sql`${t.direction} IN ('LONG', 'SHORT')`),
    check(
      "signals_knn_decision_check",
      sql`${t.knn_decision} IS NULL OR ${t.knn_decision} IN ('PASS', 'FAIL', 'SKIP')`,
    ),
  ],
);

export type SignalRow = InferSelectModel<typeof signalTable>;
export type NewSignalRow = InferInsertModel<typeof signalTable>;

// ---------------------------------------------------------------------------
// signal_details table
// ---------------------------------------------------------------------------

export const signalDetailTable = pgTable(
  "signal_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    signal_id: uuid("signal_id").notNull(),
    key: text("key").notNull(),
    value: numeric("value"),
    text_value: text("text_value"),
  },
  (t) => [
    foreignKey({
      columns: [t.signal_id],
      foreignColumns: [signalTable.id],
    }).onDelete("cascade"),
    uniqueIndex("signal_details_signal_id_key_idx").on(t.signal_id, t.key),
    index("signal_details_key_value_idx").on(t.key, t.value),
  ],
);

export type SignalDetailRow = InferSelectModel<typeof signalDetailTable>;
export type NewSignalDetailRow = InferInsertModel<typeof signalDetailTable>;

// ---------------------------------------------------------------------------
// vectors table
// ---------------------------------------------------------------------------

export const vectorTable = pgTable(
  "vectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candle_id: uuid("candle_id").notNull().unique(),
    symbol: text("symbol").notNull(),
    exchange: text("exchange").notNull(),
    timeframe: text("timeframe").notNull(),
    embedding: vectorType("embedding").notNull(),
    label: text("label"),
    grade: text("grade"),
    labeled_at: timestamp("labeled_at", { withTimezone: true, mode: "date" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.candle_id],
      foreignColumns: [candleTable.id],
    }).onDelete("cascade"),
    index("vectors_symbol_exchange_timeframe_idx").on(t.symbol, t.exchange, t.timeframe),
    check("vectors_timeframe_check", sql`${t.timeframe} IN ('5M', '1M')`),
    check(
      "vectors_label_check",
      sql`${t.label} IS NULL OR ${t.label} IN ('WIN', 'LOSS', 'TIME_EXIT')`,
    ),
    check("vectors_grade_check", sql`${t.grade} IS NULL OR ${t.grade} IN ('A', 'B', 'C')`),
  ],
);

export type VectorRow = InferSelectModel<typeof vectorTable>;
export type NewVectorRow = InferInsertModel<typeof vectorTable>;

// ---------------------------------------------------------------------------
// tickets table
// ---------------------------------------------------------------------------

export const ticketTable = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    exchange: text("exchange").notNull(),
    signal_id: uuid("signal_id").notNull().unique(),
    parent_ticket_id: uuid("parent_ticket_id"),
    timeframe: text("timeframe").notNull(),
    direction: text("direction").notNull(),
    state: text("state").notNull().default("INITIAL"),
    entry_price: numeric("entry_price").notNull(),
    sl_price: numeric("sl_price").notNull(),
    current_sl_price: numeric("current_sl_price").notNull(),
    size: numeric("size").notNull(),
    remaining_size: numeric("remaining_size").notNull(),
    leverage: integer("leverage").notNull(),
    tp1_price: numeric("tp1_price"),
    tp2_price: numeric("tp2_price"),
    trailing_active: boolean("trailing_active").default(false),
    trailing_price: numeric("trailing_price"),
    max_profit: numeric("max_profit").default("0"),
    pyramid_count: integer("pyramid_count").default(0),
    opened_at: timestamp("opened_at", { withTimezone: true, mode: "date" }).notNull(),
    closed_at: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    close_reason: text("close_reason"),
    result: text("result"),
    pnl: numeric("pnl"),
    pnl_pct: numeric("pnl_pct"),
    max_favorable: numeric("max_favorable"),
    max_adverse: numeric("max_adverse"),
    hold_duration_sec: integer("hold_duration_sec"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // FK: (symbol, exchange) → Symbol RESTRICT
    foreignKey({
      columns: [t.symbol, t.exchange],
      foreignColumns: [symbolTable.symbol, symbolTable.exchange],
    }).onDelete("restrict"),
    // FK: signal_id → Signal RESTRICT
    foreignKey({
      columns: [t.signal_id],
      foreignColumns: [signalTable.id],
    }).onDelete("restrict"),
    // FK: self-ref parent_ticket_id → Ticket SET NULL
    foreignKey({
      columns: [t.parent_ticket_id],
      foreignColumns: [t.id],
      name: "tickets_parent_ticket_id_fk",
    }).onDelete("set null"),
    // CHECK constraints
    check("tickets_state_check", sql`${t.state} IN ('INITIAL', 'TP1_HIT', 'TP2_HIT', 'CLOSED')`),
    check("tickets_direction_check", sql`${t.direction} IN ('LONG', 'SHORT')`),
    check("tickets_timeframe_check", sql`${t.timeframe} IN ('5M', '1M')`),
    check(
      "tickets_close_reason_check",
      sql`${t.close_reason} IS NULL OR ${t.close_reason} IN ('SL', 'TP1', 'TP2', 'TRAILING', 'TIME_EXIT', 'PANIC_CLOSE', 'MANUAL')`,
    ),
    check(
      "tickets_result_check",
      sql`${t.result} IS NULL OR ${t.result} IN ('WIN', 'LOSS', 'TIME_EXIT')`,
    ),
    check("tickets_exchange_check", sql`${t.exchange} IN ('binance', 'okx', 'bitget', 'mexc')`),
    // Partial index: active tickets (state != 'CLOSED')
    index("tickets_active_idx")
      .on(t.symbol, t.exchange, t.state)
      .where(sql`${t.state} != 'CLOSED'`),
  ],
);

export type TicketRow = InferSelectModel<typeof ticketTable>;
export type NewTicketRow = InferInsertModel<typeof ticketTable>;

// ---------------------------------------------------------------------------
// orders table
// ---------------------------------------------------------------------------

export const orderTable = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticket_id: uuid("ticket_id"),
    exchange: text("exchange").notNull(),
    order_type: text("order_type").notNull(),
    status: text("status").notNull(),
    side: text("side").notNull(),
    price: numeric("price"),
    expected_price: numeric("expected_price"),
    size: numeric("size").notNull(),
    filled_price: numeric("filled_price"),
    filled_size: numeric("filled_size"),
    exchange_order_id: text("exchange_order_id"),
    intent_id: text("intent_id").notNull(),
    idempotency_key: text("idempotency_key").notNull(),
    slippage: numeric("slippage"),
    error_message: text("error_message"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // FK: ticket_id → Ticket SET NULL
    foreignKey({
      columns: [t.ticket_id],
      foreignColumns: [ticketTable.id],
    }).onDelete("set null"),
    // UNIQUE(exchange, idempotency_key)
    uniqueIndex("orders_exchange_idempotency_key_idx").on(t.exchange, t.idempotency_key),
    // CHECK constraints
    check("orders_exchange_check", sql`${t.exchange} IN ('binance', 'okx', 'bitget', 'mexc')`),
    check(
      "orders_order_type_check",
      sql`${t.order_type} IN ('ENTRY', 'SL', 'TP1', 'TP2', 'TRAILING', 'PYRAMID', 'PANIC_CLOSE', 'TIME_EXIT')`,
    ),
    check(
      "orders_status_check",
      sql`${t.status} IN ('PENDING', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'FAILED')`,
    ),
    check("orders_side_check", sql`${t.side} IN ('BUY', 'SELL')`),
    // Indices
    index("orders_ticket_id_created_at_idx").on(t.ticket_id, t.created_at),
    index("orders_intent_id_idx").on(t.intent_id),
  ],
);

export type OrderRow = InferSelectModel<typeof orderTable>;
export type NewOrderRow = InferInsertModel<typeof orderTable>;

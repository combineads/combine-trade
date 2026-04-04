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
    signal_id: uuid("signal_id"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.candle_id],
      foreignColumns: [candleTable.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.signal_id],
      foreignColumns: [signalTable.id],
    }).onDelete("set null"),
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

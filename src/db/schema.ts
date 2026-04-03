import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

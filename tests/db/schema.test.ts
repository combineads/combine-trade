import { describe, expect, it } from "bun:test";
import { commonCodeTable, symbolStateTable, symbolTable } from "../../src/db/schema";
import { getTableName } from "drizzle-orm";

// ---------------------------------------------------------------------------
// db/schema — structural tests (no live DB required)
// ---------------------------------------------------------------------------

describe("db/schema — symbolTable", () => {
  it("has the correct table name", () => {
    expect(getTableName(symbolTable)).toBe("symbol");
  });

  it("has all required columns", () => {
    const cols = Object.keys(symbolTable);
    expect(cols).toContain("symbol");
    expect(cols).toContain("exchange");
    expect(cols).toContain("name");
    expect(cols).toContain("base_asset");
    expect(cols).toContain("quote_asset");
    expect(cols).toContain("is_active");
    expect(cols).toContain("created_at");
    expect(cols).toContain("updated_at");
  });

  it("symbol column has correct pg type", () => {
    expect(symbolTable.symbol.columnType).toBe("PgText");
  });

  it("exchange column has correct pg type", () => {
    expect(symbolTable.exchange.columnType).toBe("PgText");
  });

  it("is_active column has correct pg type", () => {
    expect(symbolTable.is_active.columnType).toBe("PgBoolean");
  });

  it("created_at column has correct pg type", () => {
    expect(symbolTable.created_at.columnType).toBe("PgTimestamp");
  });

  it("$inferSelect type contains expected keys", () => {
    // compile-time check via typeof — runtime assertion confirms structural key existence
    type Row = typeof symbolTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "symbol",
      "exchange",
      "name",
      "base_asset",
      "quote_asset",
      "is_active",
      "created_at",
      "updated_at",
    ];
    expect(keys).toHaveLength(8);
  });
});

describe("db/schema — symbolStateTable", () => {
  it("has the correct table name", () => {
    expect(getTableName(symbolStateTable)).toBe("symbol_state");
  });

  it("has all required columns", () => {
    const cols = Object.keys(symbolStateTable);
    expect(cols).toContain("id");
    expect(cols).toContain("symbol");
    expect(cols).toContain("exchange");
    expect(cols).toContain("fsm_state");
    expect(cols).toContain("execution_mode");
    expect(cols).toContain("daily_bias");
    expect(cols).toContain("daily_open");
    expect(cols).toContain("session_box_high");
    expect(cols).toContain("session_box_low");
    expect(cols).toContain("losses_today");
    expect(cols).toContain("losses_session");
    expect(cols).toContain("losses_this_1h_5m");
    expect(cols).toContain("losses_this_1h_1m");
    expect(cols).toContain("updated_at");
  });

  it("id column is uuid type", () => {
    expect(symbolStateTable.id.columnType).toBe("PgUUID");
  });

  it("daily_open column is numeric type", () => {
    expect(symbolStateTable.daily_open.columnType).toBe("PgNumeric");
  });

  it("session_box_high column is numeric type", () => {
    expect(symbolStateTable.session_box_high.columnType).toBe("PgNumeric");
  });

  it("session_box_low column is numeric type", () => {
    expect(symbolStateTable.session_box_low.columnType).toBe("PgNumeric");
  });

  it("losses_today column is numeric type", () => {
    expect(symbolStateTable.losses_today.columnType).toBe("PgNumeric");
  });

  it("losses_session column is integer type", () => {
    expect(symbolStateTable.losses_session.columnType).toBe("PgInteger");
  });

  it("losses_this_1h_5m column is integer type", () => {
    expect(symbolStateTable.losses_this_1h_5m.columnType).toBe("PgInteger");
  });

  it("losses_this_1h_1m column is integer type", () => {
    expect(symbolStateTable.losses_this_1h_1m.columnType).toBe("PgInteger");
  });

  it("fsm_state column has correct default", () => {
    expect(symbolStateTable.fsm_state.default).toBe("IDLE");
  });

  it("execution_mode column has correct default", () => {
    expect(symbolStateTable.execution_mode.default).toBe("analysis");
  });

  it("$inferSelect type contains expected keys", () => {
    type Row = typeof symbolStateTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "id",
      "symbol",
      "exchange",
      "fsm_state",
      "execution_mode",
      "daily_bias",
      "daily_open",
      "session_box_high",
      "session_box_low",
      "losses_today",
      "losses_session",
      "losses_this_1h_5m",
      "losses_this_1h_1m",
      "updated_at",
    ];
    expect(keys).toHaveLength(14);
  });
});

describe("db/schema — commonCodeTable", () => {
  it("has the correct table name", () => {
    expect(getTableName(commonCodeTable)).toBe("common_code");
  });

  it("has all required columns", () => {
    const cols = Object.keys(commonCodeTable);
    expect(cols).toContain("group_code");
    expect(cols).toContain("code");
    expect(cols).toContain("value");
    expect(cols).toContain("description");
    expect(cols).toContain("sort_order");
    expect(cols).toContain("is_active");
    expect(cols).toContain("created_at");
    expect(cols).toContain("updated_at");
  });

  it("group_code column is text type", () => {
    expect(commonCodeTable.group_code.columnType).toBe("PgText");
  });

  it("value column is jsonb type", () => {
    expect(commonCodeTable.value.columnType).toBe("PgJsonb");
  });

  it("sort_order column is integer type with default 0", () => {
    expect(commonCodeTable.sort_order.columnType).toBe("PgInteger");
    expect(commonCodeTable.sort_order.default).toBe(0);
  });

  it("is_active column has default true", () => {
    expect(commonCodeTable.is_active.default).toBe(true);
  });

  it("$inferSelect type contains expected keys", () => {
    type Row = typeof commonCodeTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "group_code",
      "code",
      "value",
      "description",
      "sort_order",
      "is_active",
      "created_at",
      "updated_at",
    ];
    expect(keys).toHaveLength(8);
  });
});

import { describe, expect, it } from "bun:test";
import { getTableName } from "drizzle-orm";
import { backtestTable } from "@/db/schema";

// ---------------------------------------------------------------------------
// backtest-schema — structural tests (no live DB required)
// ---------------------------------------------------------------------------

describe("backtest-schema — structural", () => {
  it("has the correct table name", () => {
    expect(getTableName(backtestTable)).toBe("backtests");
  });

  it("has all required columns", () => {
    const cols = Object.keys(backtestTable);
    expect(cols).toContain("id");
    expect(cols).toContain("run_type");
    expect(cols).toContain("symbol");
    expect(cols).toContain("exchange");
    expect(cols).toContain("start_date");
    expect(cols).toContain("end_date");
    expect(cols).toContain("config_snapshot");
    expect(cols).toContain("results");
    expect(cols).toContain("parent_id");
    expect(cols).toContain("window_index");
    expect(cols).toContain("created_at");
  });

  it("id column is PgUUID type", () => {
    expect(backtestTable.id.columnType).toBe("PgUUID");
  });

  it("run_type column is PgText type", () => {
    expect(backtestTable.run_type.columnType).toBe("PgText");
  });

  it("config_snapshot and results columns are PgJsonb type", () => {
    expect(backtestTable.config_snapshot.columnType).toBe("PgJsonb");
    expect(backtestTable.results.columnType).toBe("PgJsonb");
  });

  it("start_date and end_date are PgTimestamp type", () => {
    expect(backtestTable.start_date.columnType).toBe("PgTimestamp");
    expect(backtestTable.end_date.columnType).toBe("PgTimestamp");
  });

  it("parent_id is nullable (for WFO child windows)", () => {
    expect(backtestTable.parent_id.notNull).toBe(false);
  });

  it("window_index is nullable (only for WFO)", () => {
    expect(backtestTable.window_index.notNull).toBe(false);
  });

  it("$inferSelect type contains expected keys", () => {
    type Row = typeof backtestTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "id",
      "run_type",
      "symbol",
      "exchange",
      "start_date",
      "end_date",
      "config_snapshot",
      "results",
      "parent_id",
      "window_index",
      "created_at",
    ];
    // Compile-time check — if any key is wrong, TypeScript rejects
    expect(keys).toHaveLength(11);
  });

  it("$inferInsert allows omitting id and created_at", () => {
    type Insert = typeof backtestTable.$inferInsert;
    // Required fields
    const insert: Insert = {
      run_type: "BACKTEST",
      symbol: "BTCUSDT",
      exchange: "binance",
      start_date: new Date(),
      end_date: new Date(),
      config_snapshot: {},
      results: {},
    };
    expect(insert.run_type).toBe("BACKTEST");
  });

  it("$inferInsert allows WFO fields", () => {
    type Insert = typeof backtestTable.$inferInsert;
    const insert: Insert = {
      run_type: "WFO",
      symbol: "BTCUSDT",
      exchange: "binance",
      start_date: new Date(),
      end_date: new Date(),
      config_snapshot: {},
      results: {},
      parent_id: "550e8400-e29b-41d4-a716-446655440000",
      window_index: 1,
    };
    expect(insert.run_type).toBe("WFO");
    expect(insert.parent_id).toBeDefined();
    expect(insert.window_index).toBe(1);
  });
});

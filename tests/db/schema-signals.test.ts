import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { getTableName } from "drizzle-orm";
import { signalDetailTable, signalTable } from "../../src/db/schema";
import { getPool } from "../../src/db/pool";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// schema-signals — structural tests (no live DB required)
// ---------------------------------------------------------------------------

describe("schema-signals — signalTable structural", () => {
  it("has the correct table name", () => {
    expect(getTableName(signalTable)).toBe("signals");
  });

  it("has all required columns", () => {
    const cols = Object.keys(signalTable);
    expect(cols).toContain("id");
    expect(cols).toContain("symbol");
    expect(cols).toContain("exchange");
    expect(cols).toContain("watch_session_id");
    expect(cols).toContain("timeframe");
    expect(cols).toContain("signal_type");
    expect(cols).toContain("direction");
    expect(cols).toContain("entry_price");
    expect(cols).toContain("sl_price");
    expect(cols).toContain("safety_passed");
    expect(cols).toContain("knn_decision");
    expect(cols).toContain("a_grade");
    expect(cols).toContain("vector_id");
    expect(cols).toContain("created_at");
  });

  it("id column is PgUUID type", () => {
    expect(signalTable.id.columnType).toBe("PgUUID");
  });

  it("watch_session_id column is PgUUID type", () => {
    expect(signalTable.watch_session_id.columnType).toBe("PgUUID");
  });

  it("vector_id column is PgUUID type", () => {
    expect(signalTable.vector_id.columnType).toBe("PgUUID");
  });

  it("entry_price column is PgNumeric type", () => {
    expect(signalTable.entry_price.columnType).toBe("PgNumeric");
  });

  it("sl_price column is PgNumeric type", () => {
    expect(signalTable.sl_price.columnType).toBe("PgNumeric");
  });

  it("safety_passed column is PgBoolean type", () => {
    expect(signalTable.safety_passed.columnType).toBe("PgBoolean");
  });

  it("a_grade column has default false", () => {
    expect(signalTable.a_grade.default).toBe(false);
  });

  it("knn_decision column is nullable (no notNull)", () => {
    expect(signalTable.knn_decision.notNull).toBe(false);
  });

  it("vector_id column is nullable (no notNull)", () => {
    expect(signalTable.vector_id.notNull).toBe(false);
  });

  it("$inferSelect type contains 14 expected keys", () => {
    type Row = typeof signalTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "id",
      "symbol",
      "exchange",
      "watch_session_id",
      "timeframe",
      "signal_type",
      "direction",
      "entry_price",
      "sl_price",
      "safety_passed",
      "knn_decision",
      "a_grade",
      "vector_id",
      "created_at",
    ];
    expect(keys).toHaveLength(14);
  });
});

describe("schema-signals — signalDetailTable structural", () => {
  it("has the correct table name", () => {
    expect(getTableName(signalDetailTable)).toBe("signal_details");
  });

  it("has all required columns", () => {
    const cols = Object.keys(signalDetailTable);
    expect(cols).toContain("id");
    expect(cols).toContain("signal_id");
    expect(cols).toContain("key");
    expect(cols).toContain("value");
    expect(cols).toContain("text_value");
  });

  it("id column is PgUUID type", () => {
    expect(signalDetailTable.id.columnType).toBe("PgUUID");
  });

  it("signal_id column is PgUUID type", () => {
    expect(signalDetailTable.signal_id.columnType).toBe("PgUUID");
  });

  it("key column is PgText type", () => {
    expect(signalDetailTable.key.columnType).toBe("PgText");
  });

  it("value column is PgNumeric type", () => {
    expect(signalDetailTable.value.columnType).toBe("PgNumeric");
  });

  it("value column is nullable", () => {
    expect(signalDetailTable.value.notNull).toBe(false);
  });

  it("text_value column is nullable", () => {
    expect(signalDetailTable.text_value.notNull).toBe(false);
  });

  it("$inferSelect type contains 5 expected keys", () => {
    type Row = typeof signalDetailTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "id",
      "signal_id",
      "key",
      "value",
      "text_value",
    ];
    expect(keys).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// schema-signals — integration tests (real DB required)
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("schema-signals — integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function insertParentSymbol(
    symbol = "BTC/USDT",
    exchange = "binance",
  ): Promise<void> {
    const pool = getPool();
    await pool`
      INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
      VALUES (${symbol}, ${exchange}, ${"Bitcoin"}, ${"BTC"}, ${"USDT"})
      ON CONFLICT DO NOTHING
    `;
  }

  async function insertWatchSession(
    symbol = "BTC/USDT",
    exchange = "binance",
  ): Promise<string> {
    const pool = getPool();
    const result = await pool`
      INSERT INTO watch_session
        (symbol, exchange, detection_type, direction, detected_at)
      VALUES
        (${symbol}, ${exchange}, ${"BB4_TOUCH"}, ${"LONG"}, now())
      RETURNING id
    `;
    return result[0]!.id as string;
  }

  function validSignal(watchSessionId: string, overrides: Record<string, unknown> = {}) {
    return {
      symbol: "BTC/USDT" as string,
      exchange: "binance" as string,
      watch_session_id: watchSessionId,
      timeframe: "5M" as string,
      signal_type: "DOUBLE_B" as string,
      direction: "LONG" as string,
      entry_price: "85000.00",
      sl_price: "84500.00",
      safety_passed: true,
      ...overrides,
    };
  }

  // ── Table existence ───────────────────────────────────────────────────────

  it("migration creates signals table", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'signals'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.table_name).toBe("signals");
  });

  it("migration creates signal_details table", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'signal_details'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.table_name).toBe("signal_details");
  });

  // ── Signal INSERT ─────────────────────────────────────────────────────────

  it("INSERT valid signal succeeds", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const s = validSignal(watchSessionId);

    const result = await pool`
      INSERT INTO signals
        (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
      VALUES
        (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed})
      RETURNING id
    `;

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBeDefined();
  });

  it("INSERT without knn_decision defaults to null", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const s = validSignal(watchSessionId);

    const result = await pool`
      INSERT INTO signals
        (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
      VALUES
        (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed})
      RETURNING knn_decision
    `;

    expect(result[0]!.knn_decision).toBeNull();
  });

  it("INSERT without a_grade defaults to false", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const s = validSignal(watchSessionId);

    const result = await pool`
      INSERT INTO signals
        (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
      VALUES
        (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed})
      RETURNING a_grade
    `;

    expect(result[0]!.a_grade).toBe(false);
  });

  it("entry_price and sl_price are stored and retrieved with full numeric precision", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const s = validSignal(watchSessionId, {
      entry_price: "85432.123456789",
      sl_price: "84999.987654321",
    });

    const result = await pool`
      INSERT INTO signals
        (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
      VALUES
        (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed})
      RETURNING entry_price, sl_price
    `;

    expect(result[0]!.entry_price).toBe("85432.123456789");
    expect(result[0]!.sl_price).toBe("84999.987654321");
  });

  // ── Signal CHECK constraints ──────────────────────────────────────────────

  it("INSERT with invalid timeframe ('15M') fails with check constraint error", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const s = validSignal(watchSessionId, { timeframe: "15M" });

    try {
      await pool`
        INSERT INTO signals
          (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
        VALUES
          (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|signals_timeframe_check/i);
    }
  });

  it("INSERT with invalid signal_type fails with check constraint error", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const s = validSignal(watchSessionId, { signal_type: "INVALID" });

    try {
      await pool`
        INSERT INTO signals
          (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
        VALUES
          (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|signals_signal_type_check/i);
    }
  });

  it("INSERT with invalid knn_decision fails with check constraint error", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const s = validSignal(watchSessionId, { knn_decision: "UNKNOWN" });

    try {
      await pool`
        INSERT INTO signals
          (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed, knn_decision)
        VALUES
          (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed}, ${s.knn_decision as string})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|signals_knn_decision_check/i);
    }
  });

  // ── Signal FK constraints ─────────────────────────────────────────────────

  it("INSERT with non-existent watch_session_id fails with FK violation error", async () => {
    await insertParentSymbol();
    const pool = getPool();
    const s = validSignal("00000000-0000-0000-0000-000000000000");

    try {
      await pool`
        INSERT INTO signals
          (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
        VALUES
          (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/foreign key|violates/i);
    }
  });

  it("INSERT with non-existent symbol/exchange fails with FK violation error", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const s = validSignal(watchSessionId, {
      symbol: "FAKE/USDT",
      exchange: "noexchange",
    });

    try {
      await pool`
        INSERT INTO signals
          (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
        VALUES
          (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/foreign key|violates/i);
    }
  });

  // ── SignalDetail INSERT ───────────────────────────────────────────────────

  it("INSERT valid signal_detail succeeds", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const s = validSignal(watchSessionId);

    const sigResult = await pool`
      INSERT INTO signals
        (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
      VALUES
        (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed})
      RETURNING id
    `;
    const signalId = sigResult[0]!.id as string;

    const detResult = await pool`
      INSERT INTO signal_details (signal_id, key, value)
      VALUES (${signalId}, ${"knn_score"}, ${"4.83"})
      RETURNING id
    `;
    expect(detResult).toHaveLength(1);
    expect(detResult[0]!.id).toBeDefined();
  });

  it("INSERT text_value signal_detail succeeds", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const s = validSignal(watchSessionId);

    const sigResult = await pool`
      INSERT INTO signals
        (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
      VALUES
        (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed})
      RETURNING id
    `;
    const signalId = sigResult[0]!.id as string;

    const detResult = await pool`
      INSERT INTO signal_details (signal_id, key, text_value)
      VALUES (${signalId}, ${"daily_bias"}, ${"LONG_ONLY"})
      RETURNING text_value
    `;
    expect(detResult[0]!.text_value).toBe("LONG_ONLY");
  });

  // ── SignalDetail UNIQUE constraint ────────────────────────────────────────

  it("INSERT duplicate (signal_id, key) fails with unique constraint error", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const s = validSignal(watchSessionId);

    const sigResult = await pool`
      INSERT INTO signals
        (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
      VALUES
        (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed})
      RETURNING id
    `;
    const signalId = sigResult[0]!.id as string;

    await pool`
      INSERT INTO signal_details (signal_id, key, value)
      VALUES (${signalId}, ${"wick_ratio"}, ${"0.35"})
    `;

    try {
      await pool`
        INSERT INTO signal_details (signal_id, key, value)
        VALUES (${signalId}, ${"wick_ratio"}, ${"0.99"})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/unique|duplicate/i);
    }
  });

  // ── SignalDetail CASCADE delete ───────────────────────────────────────────

  it("DELETE signal cascades to signal_details", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const s = validSignal(watchSessionId);

    const sigResult = await pool`
      INSERT INTO signals
        (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
      VALUES
        (${s.symbol}, ${s.exchange}, ${s.watch_session_id}, ${s.timeframe}, ${s.signal_type}, ${s.direction}, ${s.entry_price}, ${s.sl_price}, ${s.safety_passed})
      RETURNING id
    `;
    const signalId = sigResult[0]!.id as string;

    // Insert multiple details
    await pool`
      INSERT INTO signal_details (signal_id, key, value)
      VALUES
        (${signalId}, ${"knn_score"}, ${"4.83"}),
        (${signalId}, ${"wick_ratio"}, ${"0.35"})
    `;

    // Verify details exist
    const beforeDelete = await pool`
      SELECT COUNT(*) AS cnt FROM signal_details WHERE signal_id = ${signalId}
    `;
    expect(Number(beforeDelete[0]!.cnt)).toBe(2);

    // Delete the signal
    await pool`DELETE FROM signals WHERE id = ${signalId}`;

    // Verify cascade deleted details
    const afterDelete = await pool`
      SELECT COUNT(*) AS cnt FROM signal_details WHERE signal_id = ${signalId}
    `;
    expect(Number(afterDelete[0]!.cnt)).toBe(0);
  });

  // ── SignalDetail FK constraint ────────────────────────────────────────────

  it("INSERT signal_detail with non-existent signal_id fails with FK violation error", async () => {
    const pool = getPool();

    try {
      await pool`
        INSERT INTO signal_details (signal_id, key, value)
        VALUES (${"00000000-0000-0000-0000-000000000000"}, ${"knn_score"}, ${"4.83"})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/foreign key|violates/i);
    }
  });
});

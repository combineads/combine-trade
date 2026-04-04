import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "bun:test";
import { getTableName } from "drizzle-orm";
import { tradeBlockTable, watchSessionTable } from "../../src/db/schema";
import { getPool } from "../../src/db/pool";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// schema-filters — structural tests (no live DB required)
// ---------------------------------------------------------------------------

describe("schema-filters — tradeBlockTable structural", () => {
  it("has the correct table name", () => {
    expect(getTableName(tradeBlockTable)).toBe("trade_block");
  });

  it("has all required columns", () => {
    const cols = Object.keys(tradeBlockTable);
    expect(cols).toContain("id");
    expect(cols).toContain("block_type");
    expect(cols).toContain("start_time");
    expect(cols).toContain("end_time");
    expect(cols).toContain("reason");
    expect(cols).toContain("is_recurring");
    expect(cols).toContain("recurrence_rule");
    expect(cols).toContain("source_data");
    expect(cols).toContain("created_at");
  });

  it("id column is PgUUID type", () => {
    expect(tradeBlockTable.id.columnType).toBe("PgUUID");
  });

  it("block_type column is PgText type", () => {
    expect(tradeBlockTable.block_type.columnType).toBe("PgText");
  });

  it("is_recurring column is PgBoolean type with default false", () => {
    expect(tradeBlockTable.is_recurring.columnType).toBe("PgBoolean");
    expect(tradeBlockTable.is_recurring.default).toBe(false);
  });

  it("recurrence_rule column is PgJsonb type", () => {
    expect(tradeBlockTable.recurrence_rule.columnType).toBe("PgJsonb");
  });

  it("source_data column is PgJsonb type", () => {
    expect(tradeBlockTable.source_data.columnType).toBe("PgJsonb");
  });

  it("start_time column is PgTimestamp type", () => {
    expect(tradeBlockTable.start_time.columnType).toBe("PgTimestamp");
  });

  it("$inferSelect type contains expected keys", () => {
    type Row = typeof tradeBlockTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "id",
      "block_type",
      "start_time",
      "end_time",
      "reason",
      "is_recurring",
      "recurrence_rule",
      "source_data",
      "created_at",
    ];
    expect(keys).toHaveLength(9);
  });
});

describe("schema-filters — watchSessionTable structural", () => {
  it("has the correct table name", () => {
    expect(getTableName(watchSessionTable)).toBe("watch_session");
  });

  it("has all required columns", () => {
    const cols = Object.keys(watchSessionTable);
    expect(cols).toContain("id");
    expect(cols).toContain("symbol");
    expect(cols).toContain("exchange");
    expect(cols).toContain("detection_type");
    expect(cols).toContain("direction");
    expect(cols).toContain("tp1_price");
    expect(cols).toContain("tp2_price");
    expect(cols).toContain("detected_at");
    expect(cols).toContain("invalidated_at");
    expect(cols).toContain("invalidation_reason");
    expect(cols).toContain("context_data");
    expect(cols).toContain("created_at");
  });

  it("id column is PgUUID type", () => {
    expect(watchSessionTable.id.columnType).toBe("PgUUID");
  });

  it("tp1_price column is PgNumeric type", () => {
    expect(watchSessionTable.tp1_price.columnType).toBe("PgNumeric");
  });

  it("tp2_price column is PgNumeric type", () => {
    expect(watchSessionTable.tp2_price.columnType).toBe("PgNumeric");
  });

  it("detection_type column is PgText type", () => {
    expect(watchSessionTable.detection_type.columnType).toBe("PgText");
  });

  it("direction column is PgText type", () => {
    expect(watchSessionTable.direction.columnType).toBe("PgText");
  });

  it("context_data column is PgJsonb type", () => {
    expect(watchSessionTable.context_data.columnType).toBe("PgJsonb");
  });

  it("$inferSelect type contains expected keys", () => {
    type Row = typeof watchSessionTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "id",
      "symbol",
      "exchange",
      "detection_type",
      "direction",
      "tp1_price",
      "tp2_price",
      "detected_at",
      "invalidated_at",
      "invalidation_reason",
      "context_data",
      "created_at",
    ];
    expect(keys).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// schema-filters — integration tests (real DB required)
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("schema-filters — integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // Helper: insert a parent symbol row required by WatchSession FK
  async function insertParentSymbol(
    symbol = "BTCUSDT",
    exchange = "binance",
  ): Promise<void> {
    const pool = getPool();
    await pool`
      INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
      VALUES (${symbol}, ${exchange}, ${"Bitcoin"}, ${"BTC"}, ${"USDT"})
      ON CONFLICT DO NOTHING
    `;
  }

  // Reusable timestamp string constants (ISO 8601, postgres accepts these)
  const START_TS = "2025-01-01T23:45:00Z";
  const END_TS = "2025-01-02T00:15:00Z";
  const DETECTED_TS = "2025-01-01T10:00:00Z";
  const INVALIDATED_TS = "2025-01-01T12:00:00Z";

  // -------------------------------------------------------------------------
  // trade_block table existence
  // -------------------------------------------------------------------------

  it("migration creates trade_block table", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'trade_block'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.table_name).toBe("trade_block");
  });

  // -------------------------------------------------------------------------
  // trade_block — valid insert
  // -------------------------------------------------------------------------

  it("INSERT valid trade_block succeeds", async () => {
    const pool = getPool();

    const result = await pool`
      INSERT INTO trade_block (block_type, start_time, end_time, reason)
      VALUES ('FUNDING', ${START_TS}, ${END_TS}, ${"펀딩 0시"})
      RETURNING id, is_recurring
    `;

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBeDefined();
    expect(result[0]!.is_recurring).toBe(false);
  });

  // -------------------------------------------------------------------------
  // trade_block — is_recurring defaults to false
  // -------------------------------------------------------------------------

  it("trade_block is_recurring defaults to false when not specified", async () => {
    const pool = getPool();

    const result = await pool`
      INSERT INTO trade_block (block_type, start_time, end_time)
      VALUES ('FUNDING', ${START_TS}, ${END_TS})
      RETURNING is_recurring
    `;

    expect(result[0]!.is_recurring).toBe(false);
  });

  // -------------------------------------------------------------------------
  // trade_block — CHECK block_type constraint
  // -------------------------------------------------------------------------

  it("trade_block INSERT with invalid block_type fails with CHECK constraint error", async () => {
    const pool = getPool();

    try {
      await pool`
        INSERT INTO trade_block (block_type, start_time, end_time)
        VALUES ('INVALID', ${START_TS}, ${END_TS})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|trade_block_block_type_check/i);
    }
  });

  // -------------------------------------------------------------------------
  // trade_block — all valid block_type values accepted
  // -------------------------------------------------------------------------

  it("trade_block accepts all valid block_type values", async () => {
    const pool = getPool();

    await pool`INSERT INTO trade_block (block_type, start_time, end_time) VALUES ('ECONOMIC', ${START_TS}, ${END_TS})`;
    await pool`INSERT INTO trade_block (block_type, start_time, end_time) VALUES ('FUNDING', ${START_TS}, ${END_TS})`;
    await pool`INSERT INTO trade_block (block_type, start_time, end_time) VALUES ('MANUAL', ${START_TS}, ${END_TS})`;
    await pool`INSERT INTO trade_block (block_type, start_time, end_time) VALUES ('MARKET_OPEN', ${START_TS}, ${END_TS})`;

    const result = await pool`SELECT COUNT(*) AS cnt FROM trade_block`;
    expect(Number(result[0]!.cnt)).toBe(4);
  });

  // -------------------------------------------------------------------------
  // trade_block — jsonb columns store/retrieve correctly
  // -------------------------------------------------------------------------

  it("trade_block recurrence_rule and source_data store jsonb values", async () => {
    const pool = getPool();
    const rule = JSON.stringify({ utc_hour: 0, duration_min: 30 });
    const src = JSON.stringify({ external_id: "abc123", provider: "calapi" });

    const result = await pool`
      INSERT INTO trade_block (block_type, start_time, end_time, is_recurring, recurrence_rule, source_data)
      VALUES ('FUNDING', ${START_TS}, ${END_TS}, true, ${rule}::jsonb, ${src}::jsonb)
      RETURNING recurrence_rule, source_data
    `;

    expect(result[0]!.recurrence_rule).toEqual({ utc_hour: 0, duration_min: 30 });
    expect(result[0]!.source_data).toEqual({ external_id: "abc123", provider: "calapi" });
  });

  // -------------------------------------------------------------------------
  // watch_session table existence
  // -------------------------------------------------------------------------

  it("migration creates watch_session table", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'watch_session'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.table_name).toBe("watch_session");
  });

  // -------------------------------------------------------------------------
  // watch_session — valid insert
  // -------------------------------------------------------------------------

  it("INSERT valid watch_session succeeds", async () => {
    await insertParentSymbol();
    const pool = getPool();

    const result = await pool`
      INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
      VALUES ('BTCUSDT', 'binance', 'BB4_TOUCH', 'LONG', ${DETECTED_TS})
      RETURNING id
    `;

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // watch_session — FK constraint (symbol, exchange) → symbol
  // -------------------------------------------------------------------------

  it("watch_session INSERT with non-existent symbol/exchange fails with FK violation", async () => {
    const pool = getPool();

    try {
      await pool`
        INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
        VALUES ('FAKE', 'noexchange', 'BB4_TOUCH', 'LONG', ${DETECTED_TS})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/foreign key|violates/i);
    }
  });

  // -------------------------------------------------------------------------
  // watch_session — CHECK detection_type constraint
  // -------------------------------------------------------------------------

  it("watch_session INSERT with invalid detection_type fails with CHECK constraint error", async () => {
    await insertParentSymbol();
    const pool = getPool();

    try {
      await pool`
        INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
        VALUES ('BTCUSDT', 'binance', 'INVALID', 'LONG', ${DETECTED_TS})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|watch_session_detection_type_check/i);
    }
  });

  // -------------------------------------------------------------------------
  // watch_session — CHECK direction constraint
  // -------------------------------------------------------------------------

  it("watch_session INSERT with invalid direction fails with CHECK constraint error", async () => {
    await insertParentSymbol();
    const pool = getPool();

    try {
      await pool`
        INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
        VALUES ('BTCUSDT', 'binance', 'BB4_TOUCH', 'INVALID', ${DETECTED_TS})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|watch_session_direction_check/i);
    }
  });

  // -------------------------------------------------------------------------
  // watch_session — partial unique index: active session per symbol×exchange
  // -------------------------------------------------------------------------

  it("watch_session partial unique index prevents two active sessions for same symbol×exchange", async () => {
    await insertParentSymbol();
    const pool = getPool();

    // First active session (invalidated_at IS NULL)
    await pool`
      INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
      VALUES ('BTCUSDT', 'binance', 'BB4_TOUCH', 'LONG', ${DETECTED_TS})
    `;

    // Second active session for same symbol×exchange
    try {
      await pool`
        INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
        VALUES ('BTCUSDT', 'binance', 'SR_CONFLUENCE', 'SHORT', NOW())
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/unique|duplicate/i);
    }
  });

  it("watch_session partial unique index allows multiple inactive sessions for same symbol×exchange", async () => {
    await insertParentSymbol();
    const pool = getPool();

    // Two invalidated sessions for the same symbol×exchange
    await pool`
      INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at, invalidated_at)
      VALUES ('BTCUSDT', 'binance', 'BB4_TOUCH', 'LONG', ${DETECTED_TS}, ${INVALIDATED_TS})
    `;
    await pool`
      INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at, invalidated_at)
      VALUES ('BTCUSDT', 'binance', 'SR_CONFLUENCE', 'SHORT', NOW(), NOW())
    `;

    const result = await pool`SELECT COUNT(*) AS cnt FROM watch_session`;
    expect(Number(result[0]!.cnt)).toBe(2);
  });

  it("watch_session allows one active session alongside multiple inactive sessions for same symbol×exchange", async () => {
    await insertParentSymbol();
    const pool = getPool();

    // One invalidated session
    await pool`
      INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at, invalidated_at)
      VALUES ('BTCUSDT', 'binance', 'BB4_TOUCH', 'LONG', ${DETECTED_TS}, ${INVALIDATED_TS})
    `;

    // One active session
    await pool`
      INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
      VALUES ('BTCUSDT', 'binance', 'BB4_TOUCH', 'SHORT', NOW())
    `;

    const result = await pool`SELECT COUNT(*) AS cnt FROM watch_session`;
    expect(Number(result[0]!.cnt)).toBe(2);
  });

  // -------------------------------------------------------------------------
  // watch_session — tp1_price / tp2_price stored as numeric
  // -------------------------------------------------------------------------

  it("watch_session tp1_price and tp2_price stored and retrieved as numeric strings", async () => {
    await insertParentSymbol();
    const pool = getPool();

    const result = await pool`
      INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at, tp1_price, tp2_price)
      VALUES ('BTCUSDT', 'binance', 'BB4_TOUCH', 'LONG', ${DETECTED_TS}, ${"85432.123456789"}, ${"90000.987654321"})
      RETURNING tp1_price, tp2_price
    `;

    // PostgreSQL numeric columns are returned as strings by the postgres driver
    expect(result[0]!.tp1_price).toBe("85432.123456789");
    expect(result[0]!.tp2_price).toBe("90000.987654321");
  });

  // -------------------------------------------------------------------------
  // watch_session — all valid detection_type values accepted
  // -------------------------------------------------------------------------

  it("watch_session accepts all valid detection_type values", async () => {
    await insertParentSymbol("BTCUSDT", "binance");
    await insertParentSymbol("ETHUSDT", "binance");
    await insertParentSymbol("BTCUSDT", "okx");
    const pool = getPool();

    await pool`
      INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
      VALUES ('BTCUSDT', 'binance', 'SQUEEZE_BREAKOUT', 'LONG', ${DETECTED_TS})
    `;
    await pool`
      INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
      VALUES ('ETHUSDT', 'binance', 'SR_CONFLUENCE', 'SHORT', ${DETECTED_TS})
    `;
    await pool`
      INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
      VALUES ('BTCUSDT', 'okx', 'BB4_TOUCH', 'LONG', ${DETECTED_TS})
    `;

    const result = await pool`SELECT COUNT(*) AS cnt FROM watch_session`;
    expect(Number(result[0]!.cnt)).toBe(3);
  });
});

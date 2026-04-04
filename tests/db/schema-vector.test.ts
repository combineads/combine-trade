import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "bun:test";
import { getTableName } from "drizzle-orm";
import { vectorTable } from "../../src/db/schema";
import { getPool } from "../../src/db/pool";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// schema-vector — structural tests (no live DB required)
// ---------------------------------------------------------------------------

describe("schema-vector — vectorTable structural", () => {
  it("has the correct table name", () => {
    expect(getTableName(vectorTable)).toBe("vectors");
  });

  it("has all required columns", () => {
    const cols = Object.keys(vectorTable);
    expect(cols).toContain("id");
    expect(cols).toContain("candle_id");
    expect(cols).toContain("symbol");
    expect(cols).toContain("exchange");
    expect(cols).toContain("timeframe");
    expect(cols).toContain("embedding");
    expect(cols).toContain("label");
    expect(cols).toContain("grade");
    expect(cols).toContain("labeled_at");
    expect(cols).toContain("signal_id");
    expect(cols).toContain("created_at");
  });

  it("id column is PgUUID type", () => {
    expect(vectorTable.id.columnType).toBe("PgUUID");
  });

  it("candle_id column is PgUUID type", () => {
    expect(vectorTable.candle_id.columnType).toBe("PgUUID");
  });

  it("signal_id column is PgUUID type", () => {
    expect(vectorTable.signal_id.columnType).toBe("PgUUID");
  });

  it("candle_id column is notNull", () => {
    expect(vectorTable.candle_id.notNull).toBe(true);
  });

  it("label column is nullable", () => {
    expect(vectorTable.label.notNull).toBe(false);
  });

  it("grade column is nullable", () => {
    expect(vectorTable.grade.notNull).toBe(false);
  });

  it("labeled_at column is nullable", () => {
    expect(vectorTable.labeled_at.notNull).toBe(false);
  });

  it("signal_id column is nullable", () => {
    expect(vectorTable.signal_id.notNull).toBe(false);
  });

  it("embedding column is not null", () => {
    expect(vectorTable.embedding.notNull).toBe(true);
  });

  it("$inferSelect type contains all 11 expected keys", () => {
    type Row = typeof vectorTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "id",
      "candle_id",
      "symbol",
      "exchange",
      "timeframe",
      "embedding",
      "label",
      "grade",
      "labeled_at",
      "signal_id",
      "created_at",
    ];
    expect(keys).toHaveLength(11);
  });
});

// ---------------------------------------------------------------------------
// schema-vector — integration tests (real DB required)
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("schema-vector — integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

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

  async function insertCandle(
    symbol = "BTC/USDT",
    exchange = "binance",
    timeframe = "5M",
    openTime = "2025-01-01T00:00:00Z",
  ): Promise<string> {
    const pool = getPool();
    const result = await pool`
      INSERT INTO candles (symbol, exchange, timeframe, open_time, open, high, low, close, volume)
      VALUES (${symbol}, ${exchange}, ${timeframe}, ${openTime}::timestamptz, ${"100.00"}, ${"110.00"}, ${"90.00"}, ${"105.00"}, ${"1000.00"})
      RETURNING id
    `;
    return result[0]!.id as string;
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

  async function insertSignal(
    watchSessionId: string,
    symbol = "BTC/USDT",
    exchange = "binance",
  ): Promise<string> {
    const pool = getPool();
    const result = await pool`
      INSERT INTO signals
        (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed)
      VALUES
        (${symbol}, ${exchange}, ${watchSessionId}, ${"5M"}, ${"DOUBLE_B"}, ${"LONG"}, ${"85000.00"}, ${"84500.00"}, ${true})
      RETURNING id
    `;
    return result[0]!.id as string;
  }

  /** Build a 202-dimension vector literal for pgvector. */
  function make202dim(fillValue = 0.1): string {
    return "[" + Array.from({ length: 202 }, () => fillValue).join(",") + "]";
  }

  // ── Table existence ───────────────────────────────────────────────────────

  it("migration creates vectors table", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'vectors'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.table_name).toBe("vectors");
  });

  // ── pgvector extension ────────────────────────────────────────────────────

  it("pgvector extension is installed", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.extname).toBe("vector");
  });

  // ── Basic INSERT / SELECT ─────────────────────────────────────────────────

  it("INSERT valid 202-dim vector succeeds and SELECT returns it", async () => {
    await insertParentSymbol();
    const candleId = await insertCandle();
    const pool = getPool();
    const embedding = make202dim(0.5);

    const insertResult = await pool`
      INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding)
      VALUES (${candleId}, ${"BTC/USDT"}, ${"binance"}, ${"5M"}, ${embedding}::vector)
      RETURNING id
    `;
    expect(insertResult).toHaveLength(1);
    const vectorId = insertResult[0]!.id as string;

    const selectResult = await pool`
      SELECT id, candle_id, symbol, exchange, timeframe, label, grade, labeled_at, signal_id
      FROM vectors WHERE id = ${vectorId}
    `;
    expect(selectResult).toHaveLength(1);
    expect(selectResult[0]!.candle_id).toBe(candleId);
    expect(selectResult[0]!.symbol).toBe("BTC/USDT");
    expect(selectResult[0]!.exchange).toBe("binance");
    expect(selectResult[0]!.timeframe).toBe("5M");
    expect(selectResult[0]!.label).toBeNull();
    expect(selectResult[0]!.grade).toBeNull();
    expect(selectResult[0]!.labeled_at).toBeNull();
    expect(selectResult[0]!.signal_id).toBeNull();
  });

  // ── Wrong dimension ───────────────────────────────────────────────────────

  it("INSERT with wrong dimension (100-dim) fails", async () => {
    await insertParentSymbol();
    const candleId = await insertCandle();
    const pool = getPool();
    const wrongDim = "[" + Array.from({ length: 100 }, () => 0.1).join(",") + "]";

    try {
      await pool`
        INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding)
        VALUES (${candleId}, ${"BTC/USDT"}, ${"binance"}, ${"5M"}, ${wrongDim}::vector(202))
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // pgvector raises a dimension mismatch error
      expect(msg).toMatch(/dimension|expected 202|different/i);
    }
  });

  // ── UNIQUE candle_id constraint ───────────────────────────────────────────

  it("INSERT duplicate candle_id fails with unique constraint error", async () => {
    await insertParentSymbol();
    const candleId = await insertCandle();
    const pool = getPool();
    const embedding = make202dim(0.3);

    await pool`
      INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding)
      VALUES (${candleId}, ${"BTC/USDT"}, ${"binance"}, ${"5M"}, ${embedding}::vector)
    `;

    try {
      await pool`
        INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding)
        VALUES (${candleId}, ${"BTC/USDT"}, ${"binance"}, ${"5M"}, ${embedding}::vector)
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/unique|duplicate/i);
    }
  });

  // ── FK constraint: candle_id → candles ───────────────────────────────────

  it("INSERT with non-existent candle_id fails with FK violation", async () => {
    const pool = getPool();
    const embedding = make202dim();

    try {
      await pool`
        INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding)
        VALUES (${"00000000-0000-0000-0000-000000000000"}, ${"BTC/USDT"}, ${"binance"}, ${"5M"}, ${embedding}::vector)
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/foreign key|violates/i);
    }
  });

  // ── FK constraint: signal_id → signals ───────────────────────────────────

  it("INSERT with non-existent signal_id fails with FK violation", async () => {
    await insertParentSymbol();
    const candleId = await insertCandle();
    const pool = getPool();
    const embedding = make202dim();

    try {
      await pool`
        INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding, signal_id)
        VALUES (${candleId}, ${"BTC/USDT"}, ${"binance"}, ${"5M"}, ${embedding}::vector, ${"00000000-0000-0000-0000-000000000000"})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/foreign key|violates/i);
    }
  });

  // ── signals.vector_id FK constraint ──────────────────────────────────────

  it("INSERT signal with non-existent vector_id fails with FK violation", async () => {
    await insertParentSymbol();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();

    try {
      await pool`
        INSERT INTO signals
          (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed, vector_id)
        VALUES
          (${"BTC/USDT"}, ${"binance"}, ${watchSessionId}, ${"5M"}, ${"DOUBLE_B"}, ${"LONG"}, ${"85000.00"}, ${"84500.00"}, ${true}, ${"00000000-0000-0000-0000-000000000000"})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/foreign key|violates/i);
    }
  });

  // ── CASCADE delete: candle → vector ──────────────────────────────────────

  it("DELETE candle cascades to vector deletion", async () => {
    await insertParentSymbol();
    const candleId = await insertCandle();
    const pool = getPool();
    const embedding = make202dim(0.7);

    const insertResult = await pool`
      INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding)
      VALUES (${candleId}, ${"BTC/USDT"}, ${"binance"}, ${"5M"}, ${embedding}::vector)
      RETURNING id
    `;
    const vectorId = insertResult[0]!.id as string;

    // Verify vector exists
    const before = await pool`SELECT id FROM vectors WHERE id = ${vectorId}`;
    expect(before).toHaveLength(1);

    // Delete the candle
    await pool`DELETE FROM candles WHERE id = ${candleId}`;

    // Vector should be gone
    const after = await pool`SELECT id FROM vectors WHERE id = ${vectorId}`;
    expect(after).toHaveLength(0);
  });

  // ── CHECK constraint: timeframe ───────────────────────────────────────────

  it("INSERT with invalid timeframe ('1H') fails with check constraint error", async () => {
    await insertParentSymbol();
    const candleId = await insertCandle("BTC/USDT", "binance", "1H");
    const pool = getPool();
    const embedding = make202dim();

    try {
      await pool`
        INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding)
        VALUES (${candleId}, ${"BTC/USDT"}, ${"binance"}, ${"1H"}, ${embedding}::vector)
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|vectors_timeframe_check/i);
    }
  });

  // ── CHECK constraint: label ───────────────────────────────────────────────

  it("INSERT with invalid label ('UNKNOWN') fails with check constraint error", async () => {
    await insertParentSymbol();
    const candleId = await insertCandle();
    const pool = getPool();
    const embedding = make202dim();

    try {
      await pool`
        INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding, label)
        VALUES (${candleId}, ${"BTC/USDT"}, ${"binance"}, ${"5M"}, ${embedding}::vector, ${"UNKNOWN"})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|vectors_label_check/i);
    }
  });

  // ── CHECK constraint: grade ───────────────────────────────────────────────

  it("INSERT with invalid grade ('D') fails with check constraint error", async () => {
    await insertParentSymbol();
    const candleId = await insertCandle();
    const pool = getPool();
    const embedding = make202dim();

    try {
      await pool`
        INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding, grade)
        VALUES (${candleId}, ${"BTC/USDT"}, ${"binance"}, ${"5M"}, ${embedding}::vector, ${"D"})
      `;
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/check|constraint|vectors_grade_check/i);
    }
  });

  // ── HNSW index existence ──────────────────────────────────────────────────

  it("HNSW index on embedding exists", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'vectors'
        AND indexdef ILIKE '%hnsw%'
    `;
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.indexdef).toMatch(/hnsw/i);
    expect(result[0]!.indexdef).toMatch(/vector_cosine_ops/i);
  });

  // ── Cosine similarity query ───────────────────────────────────────────────

  it("cosine similarity ORDER BY returns nearest vector first", async () => {
    await insertParentSymbol();
    const candleId1 = await insertCandle("BTC/USDT", "binance", "5M", "2025-01-01T00:00:00Z");
    const candleId2 = await insertCandle("BTC/USDT", "binance", "5M", "2025-01-01T00:05:00Z");
    const pool = getPool();

    // Vector A: first 201 dims = 1.0, last dim = 0.0 (points strongly in first 201 dimensions)
    const embAValues = Array.from({ length: 202 }, (_, i) => (i < 201 ? 1.0 : 0.0));
    const embA = "[" + embAValues.join(",") + "]";

    // Vector B: first 201 dims = 0.0, last dim = 1.0 (orthogonal to A)
    const embBValues = Array.from({ length: 202 }, (_, i) => (i < 201 ? 0.0 : 1.0));
    const embB = "[" + embBValues.join(",") + "]";

    await pool`
      INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding)
      VALUES (${candleId1}, ${"BTC/USDT"}, ${"binance"}, ${"5M"}, ${embA}::vector)
    `;
    await pool`
      INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding)
      VALUES (${candleId2}, ${"BTC/USDT"}, ${"binance"}, ${"5M"}, ${embB}::vector)
    `;

    // Query vector: same direction as A (all 1.0 in first 201 dims, 0.0 in last)
    const queryValues = Array.from({ length: 202 }, (_, i) => (i < 201 ? 1.0 : 0.0));
    const query = "[" + queryValues.join(",") + "]";

    const result = await pool`
      SELECT candle_id,
             embedding <=> ${query}::vector AS distance
      FROM vectors
      ORDER BY embedding <=> ${query}::vector
      LIMIT 2
    `;

    expect(result).toHaveLength(2);
    // Vector A is identical direction to query → distance ~0
    // Vector B is orthogonal to query → distance ~1
    expect(result[0]!.candle_id).toBe(candleId1);
    expect(result[1]!.candle_id).toBe(candleId2);
    // Distance of A < distance of B
    expect(Number(result[0]!.distance)).toBeLessThan(Number(result[1]!.distance));
  });

  // ── Signal.vector_id SET NULL on vector delete ────────────────────────────

  it("DELETE vector sets signal.vector_id to NULL (set null)", async () => {
    await insertParentSymbol();
    const candleId = await insertCandle();
    const watchSessionId = await insertWatchSession();
    const pool = getPool();
    const embedding = make202dim(0.4);

    // Insert vector first
    const vecResult = await pool`
      INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding)
      VALUES (${candleId}, ${"BTC/USDT"}, ${"binance"}, ${"5M"}, ${embedding}::vector)
      RETURNING id
    `;
    const vectorId = vecResult[0]!.id as string;

    // Insert signal referencing the vector
    const sigResult = await pool`
      INSERT INTO signals
        (symbol, exchange, watch_session_id, timeframe, signal_type, direction, entry_price, sl_price, safety_passed, vector_id)
      VALUES
        (${"BTC/USDT"}, ${"binance"}, ${watchSessionId}, ${"5M"}, ${"DOUBLE_B"}, ${"LONG"}, ${"85000.00"}, ${"84500.00"}, ${true}, ${vectorId})
      RETURNING id
    `;
    const signalId = sigResult[0]!.id as string;

    // Verify signal.vector_id is set
    const before = await pool`SELECT vector_id FROM signals WHERE id = ${signalId}`;
    expect(before[0]!.vector_id).toBe(vectorId);

    // To delete the vector we must first delete its candle (CASCADE) — but that also cascades to the vector.
    // Instead, unlink vector from candle by deleting directly.
    // The signals.vector_id FK is SET NULL, so deleting the vector should null out signal.vector_id.
    // But vectors.candle_id has a CASCADE delete from candles.
    // We need to delete the vector row directly.
    await pool`DELETE FROM vectors WHERE id = ${vectorId}`;

    // Signal should still exist with vector_id = NULL
    const after = await pool`SELECT id, vector_id FROM signals WHERE id = ${signalId}`;
    expect(after).toHaveLength(1);
    expect(after[0]!.vector_id).toBeNull();
  });
});

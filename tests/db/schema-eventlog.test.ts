import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { getTableName } from "drizzle-orm";
import { eventLogTable } from "../../src/db/schema";
import type { EventLogRow, NewEventLogRow } from "../../src/db/schema";
import { getPool } from "../../src/db/pool";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// schema-eventlog -- structural tests (no live DB required)
// ---------------------------------------------------------------------------

describe("schema-eventlog -- eventLogTable structural", () => {
  it("has the correct table name", () => {
    expect(getTableName(eventLogTable)).toBe("event_log");
  });

  it("has all 8 required columns", () => {
    const cols = Object.keys(eventLogTable);
    const expected = [
      "id",
      "event_type",
      "symbol",
      "exchange",
      "ref_id",
      "ref_type",
      "data",
      "created_at",
    ];
    for (const col of expected) {
      expect(cols).toContain(col);
    }
  });

  it("id column is PgUUID type", () => {
    expect(eventLogTable.id.columnType).toBe("PgUUID");
  });

  it("event_type column is PgText and notNull", () => {
    expect(eventLogTable.event_type.columnType).toBe("PgText");
    expect(eventLogTable.event_type.notNull).toBe(true);
  });

  it("symbol column is nullable", () => {
    expect(eventLogTable.symbol.notNull).toBe(false);
  });

  it("exchange column is nullable", () => {
    expect(eventLogTable.exchange.notNull).toBe(false);
  });

  it("ref_id column is PgUUID and nullable", () => {
    expect(eventLogTable.ref_id.columnType).toBe("PgUUID");
    expect(eventLogTable.ref_id.notNull).toBe(false);
  });

  it("ref_type column is nullable", () => {
    expect(eventLogTable.ref_type.notNull).toBe(false);
  });

  it("data column is PgJsonb", () => {
    expect(eventLogTable.data.columnType).toBe("PgJsonb");
  });

  it("created_at column is notNull", () => {
    expect(eventLogTable.created_at.notNull).toBe(true);
  });

  it("$inferSelect type contains expected keys", () => {
    type Row = typeof eventLogTable.$inferSelect;
    const keys: (keyof Row)[] = [
      "id",
      "event_type",
      "symbol",
      "exchange",
      "ref_id",
      "ref_type",
      "data",
      "created_at",
    ];
    expect(keys).toHaveLength(8);
  });

  it("EventLogRow type is assignable from $inferSelect", () => {
    // Compile-time check: ensure exported type matches table inference
    const _check: EventLogRow = {} as typeof eventLogTable.$inferSelect;
    expect(_check).toBeDefined();
  });

  it("NewEventLogRow type is assignable from $inferInsert", () => {
    // Compile-time check: ensure exported insert type matches table inference
    const _check: NewEventLogRow = {} as typeof eventLogTable.$inferInsert;
    expect(_check).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// schema-eventlog -- integration tests (real DB required)
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("schema-eventlog -- integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();
  });

  // -- Table existence ----------------------------------------------------

  it("migration creates event_log table", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'event_log'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.table_name).toBe("event_log");
  });

  // -- INSERT with all fields ---------------------------------------------

  it("INSERT with all fields succeeds and row is created with defaults", async () => {
    const pool = getPool();
    const dataJson = JSON.stringify({ from: "IDLE", to: "WATCHING" });
    const result = await pool`
      INSERT INTO event_log
        (event_type, symbol, exchange, ref_id, ref_type, data)
      VALUES
        (${"STATE_CHANGE"}, ${"BTCUSDT"}, ${"binance"}, ${"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"}, ${"ticket"}, ${dataJson}::jsonb)
      RETURNING id, event_type, symbol, exchange, ref_id, ref_type, data, created_at
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBeDefined();
    expect(result[0]!.event_type).toBe("STATE_CHANGE");
    expect(result[0]!.symbol).toBe("BTCUSDT");
    expect(result[0]!.exchange).toBe("binance");
    expect(result[0]!.ref_id).toBe("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    expect(result[0]!.ref_type).toBe("ticket");
    expect(result[0]!.created_at).toBeDefined();
  });

  // -- INSERT with null symbol/exchange (system event) --------------------

  it("INSERT with null symbol/exchange succeeds (system event)", async () => {
    const pool = getPool();
    const dataJson = JSON.stringify({ positions_found: 1, panic_closed: 0 });
    const result = await pool`
      INSERT INTO event_log
        (event_type, symbol, exchange, data)
      VALUES
        (${"CRASH_RECOVERY"}, ${null}, ${null}, ${dataJson}::jsonb)
      RETURNING id, symbol, exchange
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBeDefined();
    expect(result[0]!.symbol).toBeNull();
    expect(result[0]!.exchange).toBeNull();
  });

  // -- INSERT with ref_type + ref_id -------------------------------------

  it("INSERT with ref_type and ref_id succeeds", async () => {
    const pool = getPool();
    const refId = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
    const result = await pool`
      INSERT INTO event_log
        (event_type, ref_type, ref_id)
      VALUES
        (${"SL_REGISTERED"}, ${"order"}, ${refId})
      RETURNING ref_type, ref_id
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.ref_type).toBe("order");
    expect(result[0]!.ref_id).toBe(refId);
  });

  // -- data jsonb accepts nested objects ----------------------------------

  it("data jsonb accepts nested objects", async () => {
    const pool = getPool();
    const nestedData = {
      from: "LONG_ONLY",
      to: "NEUTRAL",
      candle_open_time: "2025-06-01T00:00:00Z",
      context: {
        bb_values: { upper: 86000, lower: 84000, mid: 85000 },
        levels: [84500, 85500, 86500],
      },
    };
    const dataJson = JSON.stringify(nestedData);
    const result = await pool`
      INSERT INTO event_log
        (event_type, data)
      VALUES
        (${"BIAS_CHANGE"}, ${dataJson}::jsonb)
      RETURNING data
    `;
    expect(result).toHaveLength(1);
    const returnedData = result[0]!.data as Record<string, unknown>;
    expect(returnedData.from).toBe("LONG_ONLY");
    expect(returnedData.to).toBe("NEUTRAL");
    const ctx = returnedData.context as Record<string, unknown>;
    expect(ctx.bb_values).toBeDefined();
    expect(Array.isArray(ctx.levels)).toBe(true);
  });

  // -- created_at defaults to now -----------------------------------------

  it("created_at defaults to now", async () => {
    const pool = getPool();
    const before = Date.now();
    const result = await pool`
      INSERT INTO event_log
        (event_type)
      VALUES
        (${"RECONCILIATION"})
      RETURNING created_at
    `;
    const after = Date.now();
    expect(result).toHaveLength(1);
    const raw = result[0]!.created_at;
    const createdAtMs = raw instanceof Date ? raw.getTime() : new Date(raw as string).getTime();
    expect(createdAtMs).toBeGreaterThanOrEqual(before - 1000);
    expect(createdAtMs).toBeLessThanOrEqual(after + 1000);
  });

  // -- No FK constraints (ref_id is logical only) -------------------------

  it("INSERT with non-existent ref_id succeeds (no FK constraint)", async () => {
    const pool = getPool();
    const fakeRefId = "00000000-0000-0000-0000-000000000000";
    const result = await pool`
      INSERT INTO event_log
        (event_type, ref_type, ref_id)
      VALUES
        (${"STATE_CHANGE"}, ${"ticket"}, ${fakeRefId})
      RETURNING id, ref_id
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.ref_id).toBe(fakeRefId);
  });

  // -- Index: (event_type, created_at DESC) -------------------------------

  it("index on (event_type, created_at) exists", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'event_log'
        AND indexdef ILIKE '%event_type%'
        AND indexdef ILIKE '%created_at%'
    `;
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  // -- Index: (symbol, exchange, created_at DESC) -------------------------

  it("index on (symbol, exchange, created_at) exists", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'event_log'
        AND indexdef ILIKE '%symbol%'
        AND indexdef ILIKE '%exchange%'
        AND indexdef ILIKE '%created_at%'
    `;
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  // -- Index: (ref_type, ref_id) ------------------------------------------

  it("index on (ref_type, ref_id) exists", async () => {
    const pool = getPool();
    const result = await pool`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'event_log'
        AND indexdef ILIKE '%ref_type%'
        AND indexdef ILIKE '%ref_id%'
    `;
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  // -- data column accepts null -------------------------------------------

  it("data column accepts null", async () => {
    const pool = getPool();
    const result = await pool`
      INSERT INTO event_log
        (event_type, data)
      VALUES
        (${"WATCHING_START"}, ${null})
      RETURNING data
    `;
    expect(result).toHaveLength(1);
    expect(result[0]!.data).toBeNull();
  });
});

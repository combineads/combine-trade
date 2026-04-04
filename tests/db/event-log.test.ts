import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "bun:test";
import { getDb } from "../../src/db/pool";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";
import {
  EVENT_TYPES,
  insertEvent,
  queryEvents,
} from "../../src/db/event-log";

// ---------------------------------------------------------------------------
// event-log -- unit tests (no DB required)
// ---------------------------------------------------------------------------

describe("event-log -- EVENT_TYPES constant", () => {
  it("includes all 10 DATA_MODEL.md event types", () => {
    const expected = [
      "BIAS_CHANGE",
      "WATCHING_START",
      "WATCHING_END",
      "RECONCILIATION",
      "CRASH_RECOVERY",
      "SLIPPAGE_ABORT",
      "SLIPPAGE_CLOSE",
      "STATE_CHANGE",
      "SL_REGISTERED",
      "SL_MOVED",
    ] as const;

    for (const t of expected) {
      expect(EVENT_TYPES).toContain(t);
    }
  });

  it("has exactly 10 entries", () => {
    expect(EVENT_TYPES).toHaveLength(10);
  });

  it("is a readonly array", () => {
    // Verify it's frozen / readonly at runtime
    expect(Object.isFrozen(EVENT_TYPES)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// event-log -- integration tests (real DB required)
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("event-log -- integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  // -- insertEvent tests --------------------------------------------------

  it("insertEvent() with all fields -> row created, all fields match", async () => {
    const db = getDb();
    const refId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const eventData = { from: "IDLE", to: "WATCHING", trigger: "1h_close" };

    const row = await insertEvent(db, {
      event_type: "STATE_CHANGE",
      symbol: "BTCUSDT",
      exchange: "binance",
      ref_id: refId,
      ref_type: "ticket",
      data: eventData,
    });

    expect(row.id).toBeDefined();
    expect(row.event_type).toBe("STATE_CHANGE");
    expect(row.symbol).toBe("BTCUSDT");
    expect(row.exchange).toBe("binance");
    expect(row.ref_id).toBe(refId);
    expect(row.ref_type).toBe("ticket");
    expect(row.data).toEqual(eventData);
    expect(row.created_at).toBeInstanceOf(Date);
  });

  it("insertEvent() with minimal fields (event_type only) -> success, nullables are null", async () => {
    const db = getDb();

    const row = await insertEvent(db, {
      event_type: "RECONCILIATION",
    });

    expect(row.id).toBeDefined();
    expect(row.event_type).toBe("RECONCILIATION");
    expect(row.symbol).toBeNull();
    expect(row.exchange).toBeNull();
    expect(row.ref_id).toBeNull();
    expect(row.ref_type).toBeNull();
    expect(row.data).toBeNull();
    expect(row.created_at).toBeInstanceOf(Date);
  });

  it("insertEvent() created_at auto-set -> timestamp within last second", async () => {
    const db = getDb();
    const before = new Date();

    const row = await insertEvent(db, {
      event_type: "CRASH_RECOVERY",
    });

    const after = new Date();

    expect(row.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(row.created_at.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  // -- queryEvents tests --------------------------------------------------

  it("queryEvents() by event_type -> only matching type returned", async () => {
    const db = getDb();

    await insertEvent(db, { event_type: "STATE_CHANGE", symbol: "BTCUSDT" });
    await insertEvent(db, { event_type: "BIAS_CHANGE", symbol: "BTCUSDT" });
    await insertEvent(db, { event_type: "STATE_CHANGE", symbol: "ETHUSDT" });

    const results = await queryEvents(db, { event_type: "STATE_CHANGE" });

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.event_type).toBe("STATE_CHANGE");
    }
  });

  it("queryEvents() by symbol+exchange -> filtered correctly", async () => {
    const db = getDb();

    await insertEvent(db, { event_type: "STATE_CHANGE", symbol: "BTCUSDT", exchange: "binance" });
    await insertEvent(db, { event_type: "BIAS_CHANGE", symbol: "BTCUSDT", exchange: "binance" });
    await insertEvent(db, { event_type: "STATE_CHANGE", symbol: "BTCUSDT", exchange: "okx" });
    await insertEvent(db, { event_type: "STATE_CHANGE", symbol: "ETHUSDT", exchange: "binance" });

    const results = await queryEvents(db, { symbol: "BTCUSDT", exchange: "binance" });

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.symbol).toBe("BTCUSDT");
      expect(r.exchange).toBe("binance");
    }
  });

  it("queryEvents() by ref_type+ref_id -> returns related events", async () => {
    const db = getDb();
    const targetRefId = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
    const otherRefId = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";

    await insertEvent(db, { event_type: "SL_REGISTERED", ref_type: "order", ref_id: targetRefId });
    await insertEvent(db, { event_type: "SL_MOVED", ref_type: "order", ref_id: targetRefId });
    await insertEvent(db, { event_type: "SL_REGISTERED", ref_type: "order", ref_id: otherRefId });

    const results = await queryEvents(db, { ref_type: "order", ref_id: targetRefId });

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.ref_type).toBe("order");
      expect(r.ref_id).toBe(targetRefId);
    }
  });

  it("queryEvents() with since/until -> time range filter works", async () => {
    const db = getDb();
    const { getPool } = await import("../../src/db/pool");
    const pool = getPool();

    const past = "2024-01-01T00:00:00Z";
    const middle = "2024-06-15T12:00:00Z";
    const future = "2025-01-01T00:00:00Z";

    await pool`
      INSERT INTO event_log (event_type, created_at)
      VALUES ('BIAS_CHANGE', ${past}::timestamptz)
    `;
    await pool`
      INSERT INTO event_log (event_type, created_at)
      VALUES ('WATCHING_START', ${middle}::timestamptz)
    `;
    await pool`
      INSERT INTO event_log (event_type, created_at)
      VALUES ('WATCHING_END', ${future}::timestamptz)
    `;

    const results = await queryEvents(db, {
      since: new Date("2024-03-01T00:00:00Z"),
      until: new Date("2024-12-31T23:59:59Z"),
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.event_type).toBe("WATCHING_START");
  });

  it("queryEvents() default limit 100 -> returns max 100", async () => {
    const db = getDb();
    const { getPool } = await import("../../src/db/pool");
    const pool = getPool();

    // Insert 105 rows via raw SQL for speed
    for (let i = 0; i < 105; i++) {
      await pool`INSERT INTO event_log (event_type) VALUES ('RECONCILIATION')`;
    }

    const results = await queryEvents(db, { event_type: "RECONCILIATION" });

    expect(results).toHaveLength(100);
  });

  it("queryEvents() with custom limit", async () => {
    const db = getDb();

    await insertEvent(db, { event_type: "STATE_CHANGE" });
    await insertEvent(db, { event_type: "STATE_CHANGE" });
    await insertEvent(db, { event_type: "STATE_CHANGE" });

    const results = await queryEvents(db, { event_type: "STATE_CHANGE", limit: 2 });

    expect(results).toHaveLength(2);
  });

  it("queryEvents() empty result -> empty array (not null)", async () => {
    const db = getDb();

    const results = await queryEvents(db, { event_type: "SLIPPAGE_ABORT" });

    expect(results).toBeArray();
    expect(results).toHaveLength(0);
  });

  it("queryEvents() ordered by created_at DESC -> newest first", async () => {
    const db = getDb();
    const { getPool } = await import("../../src/db/pool");
    const pool = getPool();

    const t1 = "2024-01-01T00:00:00Z";
    const t2 = "2024-06-01T00:00:00Z";
    const t3 = "2024-12-01T00:00:00Z";

    await pool`INSERT INTO event_log (event_type, created_at) VALUES ('STATE_CHANGE', ${t1}::timestamptz)`;
    await pool`INSERT INTO event_log (event_type, created_at) VALUES ('STATE_CHANGE', ${t2}::timestamptz)`;
    await pool`INSERT INTO event_log (event_type, created_at) VALUES ('STATE_CHANGE', ${t3}::timestamptz)`;

    const results = await queryEvents(db, { event_type: "STATE_CHANGE" });

    expect(results).toHaveLength(3);
    // Newest first
    expect(results[0]!.created_at.getTime()).toBeGreaterThanOrEqual(results[1]!.created_at.getTime());
    expect(results[1]!.created_at.getTime()).toBeGreaterThanOrEqual(results[2]!.created_at.getTime());
  });

  it("queryEvents() with no filters returns all (up to limit)", async () => {
    const db = getDb();

    await insertEvent(db, { event_type: "STATE_CHANGE" });
    await insertEvent(db, { event_type: "BIAS_CHANGE" });
    await insertEvent(db, { event_type: "RECONCILIATION" });

    const results = await queryEvents(db, {});

    expect(results).toHaveLength(3);
  });
});

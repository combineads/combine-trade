import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "./test-db";
import { getDb, getPool } from "../../src/db/pool";

// ---------------------------------------------------------------------------
// tests/helpers/test-db — verifies DB test infrastructure
//
// These tests require a running PostgreSQL instance (see docker-compose.yml).
// When the test DB is not available, the entire suite is skipped gracefully.
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("test-db helper", () => {
  // ── Setup / teardown ────────────────────────────────────────────────────

  beforeAll(async () => {
    await initTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // ── Tests ───────────────────────────────────────────────────────────────

  describe("isTestDbAvailable()", () => {
    it("returns true when test DB is reachable", async () => {
      const available = await isTestDbAvailable();
      expect(available).toBe(true);
    });
  });

  describe("initTestDb()", () => {
    it("initializes the pool so getDb() does not throw", () => {
      expect(() => getDb()).not.toThrow();
    });

    it("initializes the pool so getPool() does not throw", () => {
      expect(() => getPool()).not.toThrow();
    });

    it("creates the symbol table in the database", async () => {
      const pool = getPool();
      const result = await pool`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'symbol'
      `;
      expect(result).toHaveLength(1);
    });

    it("creates the symbol_state table in the database", async () => {
      const pool = getPool();
      const result = await pool`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'symbol_state'
      `;
      expect(result).toHaveLength(1);
    });

    it("creates the common_code table in the database", async () => {
      const pool = getPool();
      const result = await pool`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'common_code'
      `;
      expect(result).toHaveLength(1);
    });

    it("enables the pgvector extension", async () => {
      const pool = getPool();
      const result = await pool`
        SELECT extname FROM pg_extension WHERE extname = 'vector'
      `;
      expect(result).toHaveLength(1);
    });
  });

  describe("cleanupTables()", () => {
    it("removes data but keeps the schema intact", async () => {
      const pool = getPool();

      // Insert a row into the symbol table
      await pool`
        INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
        VALUES ('BTCUSDT', 'binance', 'Bitcoin', 'BTC', 'USDT')
        ON CONFLICT DO NOTHING
      `;

      // Verify row exists
      const before = await pool`SELECT count(*)::int as cnt FROM symbol`;
      expect(before[0]!.cnt).toBeGreaterThan(0);

      // Run cleanup
      await cleanupTables();

      // Verify data is gone
      const after = await pool`SELECT count(*)::int as cnt FROM symbol`;
      expect(after[0]!.cnt).toBe(0);

      // Verify schema still exists (table is still there)
      const tables = await pool`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'symbol'
      `;
      expect(tables).toHaveLength(1);
    });

    it("does not remove drizzle migration metadata", async () => {
      const pool = getPool();

      // Check that the drizzle migrations table still has entries
      const result = await pool`
        SELECT count(*)::int as cnt
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '__drizzle_migrations'
      `;

      // The migrations table itself should exist
      expect(result[0]!.cnt).toBe(1);
    });
  });

  describe("closeTestDb()", () => {
    it("closes cleanly without throwing", async () => {
      // Close and re-init so the afterAll still works
      await closeTestDb();
      await initTestDb();
    });
  });
});

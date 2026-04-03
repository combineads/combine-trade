import { afterEach, describe, expect, it } from "bun:test";

// Import the module under test. We use dynamic-import in each test block so
// that module-level state (pool/db singletons) is reset between tests via the
// closePool() helper exposed by the module itself.
import {
  closePool,
  getDb,
  getPool,
  initDb,
  isHealthy,
} from "../../src/db/pool";

// Reset the singleton state after every test by calling closePool(), which
// sets both pool and db back to null even when they were never initialised.
afterEach(async () => {
  await closePool();
});

describe("db/pool", () => {
  describe("getDb() before initDb()", () => {
    it("throws an error when the db has not been initialized", () => {
      expect(() => getDb()).toThrow();
    });

    it("error message mentions 'initialized'", () => {
      expect(() => getDb()).toThrow(/initialized/i);
    });
  });

  describe("getPool() before initDb()", () => {
    it("throws an error when the pool has not been initialized", () => {
      expect(() => getPool()).toThrow();
    });

    it("error message mentions 'initialized'", () => {
      expect(() => getPool()).toThrow(/initialized/i);
    });
  });

  describe("initDb() with missing DATABASE_URL", () => {
    it("throws when no url argument and DATABASE_URL is not set", async () => {
      // Ensure the env var is absent for this test
      const saved = process.env["DATABASE_URL"];
      delete process.env["DATABASE_URL"];

      try {
        await expect(initDb()).rejects.toThrow();
      } finally {
        if (saved !== undefined) {
          process.env["DATABASE_URL"] = saved;
        }
      }
    });

    it("error message contains 'DATABASE_URL'", async () => {
      const saved = process.env["DATABASE_URL"];
      delete process.env["DATABASE_URL"];

      try {
        await expect(initDb()).rejects.toThrow(/DATABASE_URL/);
      } finally {
        if (saved !== undefined) {
          process.env["DATABASE_URL"] = saved;
        }
      }
    });

    it("does not throw when a url argument is explicitly provided (invalid URL will fail at connect)", async () => {
      // The function should NOT throw immediately due to missing DATABASE_URL;
      // it will attempt a real connection and fail for a different reason.
      // We only verify that the DATABASE_URL check is bypassed.
      const saved = process.env["DATABASE_URL"];
      delete process.env["DATABASE_URL"];

      try {
        // An invalid connection string will cause a connection error, not a
        // "DATABASE_URL is not set" error. We confirm the thrown message does
        // NOT mention the env-var check.
        let errorMessage = "";
        try {
          await initDb("postgresql://invalid-host-that-does-not-exist/test");
        } catch (err) {
          errorMessage = err instanceof Error ? err.message : String(err);
        }
        // Must NOT be the missing DATABASE_URL error
        expect(errorMessage).not.toMatch(/DATABASE_URL is not set/);
        // Must be some error (bad host etc.)
        expect(errorMessage.length).toBeGreaterThan(0);
      } finally {
        if (saved !== undefined) {
          process.env["DATABASE_URL"] = saved;
        }
      }
    });
  });

  describe("isHealthy() without a connection", () => {
    it("returns false when pool is not initialized", async () => {
      const result = await isHealthy();
      expect(result).toBe(false);
    });
  });

  describe("closePool() without initialization", () => {
    it("resolves without throwing when pool was never initialized", async () => {
      await expect(closePool()).resolves.toBeUndefined();
    });
  });
});

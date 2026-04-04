/**
 * Test database helpers for integration tests that require a real PostgreSQL
 * connection. Uses the test DB defined in .env.test with the pgvector/pgvector
 * Docker image (see docker-compose.yml at the project root).
 *
 * Usage:
 *   const available = await isTestDbAvailable();
 *   describe.skipIf(!available)("my db tests", () => {
 *     beforeAll(() => initTestDb());
 *     afterAll(() => closeTestDb());
 *     afterEach(() => cleanupTables());
 *   });
 */

import { resolve } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closePool, getDb, getPool, initDb } from "../../src/db/pool";

// ─── Internal helpers ─────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dir, "../..");

/**
 * Reads the DATABASE_URL from the .env.test file at the project root.
 * Returns undefined if the file does not exist or the variable is not set.
 */
async function readTestDatabaseUrl(): Promise<string | undefined> {
  try {
    const envPath = resolve(PROJECT_ROOT, ".env.test");
    const content = await Bun.file(envPath).text();

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // Skip blank lines and comments
      if (trimmed === "" || trimmed.startsWith("#")) {
        continue;
      }
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) {
        continue;
      }
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key === "DATABASE_URL") {
        return value;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

let _cachedAvailability: boolean | null = null;

/**
 * Attempts to connect to the test database and returns true if successful.
 * Never throws — returns false on any error (missing .env.test, DB down, etc.).
 * Result is cached to avoid creating multiple throwaway connections.
 */
export async function isTestDbAvailable(): Promise<boolean> {
  if (_cachedAvailability !== null) return _cachedAvailability;

  const url = await readTestDatabaseUrl();
  if (!url) {
    _cachedAvailability = false;
    return false;
  }

  let client: import("postgres").Sql | null = null;
  try {
    const postgres = (await import("postgres")).default;
    client = postgres(url, { max: 1, connect_timeout: 3, idle_timeout: 1 });
    await client`SELECT 1`;
    _cachedAvailability = true;
    return true;
  } catch {
    _cachedAvailability = false;
    return false;
  } finally {
    if (client) {
      await client.end().catch(() => undefined);
    }
  }
}

/**
 * Initializes the test database:
 * 1. Reads DATABASE_URL from .env.test
 * 2. Connects via the existing initDb(url) from src/db/pool.ts
 * 3. Creates the pgvector extension
 * 4. Runs all Drizzle migrations
 *
 * @throws If .env.test is missing, DATABASE_URL is not set, or connection fails.
 */
export async function initTestDb(): Promise<void> {
  const url = await readTestDatabaseUrl();
  if (!url) {
    throw new Error(
      "Cannot initialize test DB: DATABASE_URL not found in .env.test",
    );
  }

  // Initialize pool using existing infrastructure
  await initDb(url);

  const pool = getPool();

  // Enable pgvector extension before running migrations
  await pool`CREATE EXTENSION IF NOT EXISTS vector`;

  // Run Drizzle migrations
  const db = getDb();
  await migrate(db, { migrationsFolder: resolve(PROJECT_ROOT, "drizzle") });
}

/**
 * Truncates all user data tables (CASCADE) while preserving:
 * - Table schemas and constraints
 * - Drizzle migration metadata (__drizzle_migrations)
 *
 * Call this in afterEach() to ensure test isolation.
 */
export async function cleanupTables(): Promise<void> {
  const pool = getPool();

  // Get all user tables in the public schema, excluding drizzle internals
  const tables = await pool`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '__drizzle%'
  `;

  if (tables.length === 0) {
    return;
  }

  // Build a single TRUNCATE statement with CASCADE for FK safety
  const tableNames = tables
    .map((t) => `"${t.table_name}"`)
    .join(", ");

  await pool.unsafe(`TRUNCATE ${tableNames} CASCADE`);
}

/**
 * Gracefully closes the database connection pool.
 * Safe to call even if the pool was never initialized.
 */
export async function closeTestDb(): Promise<void> {
  await closePool();
}

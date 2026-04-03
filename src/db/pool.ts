import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createLogger } from "../core/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DbInstance = ReturnType<typeof drizzle>;
export type PostgresClient = postgres.Sql;

// ─── State ────────────────────────────────────────────────────────────────────

const log = createLogger("db");

let pool: PostgresClient | null = null;
let db: DbInstance | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initializes the PostgreSQL connection pool and wraps it with a Drizzle ORM
 * instance. Verifies connectivity with a SELECT 1 probe. Idempotent — calling
 * it again while already initialized is a no-op.
 *
 * @param url - Optional connection URL. Falls back to DATABASE_URL env var.
 * @throws If DATABASE_URL is missing and no url argument is provided.
 * @throws If the initial connectivity probe fails.
 */
export async function initDb(url?: string): Promise<void> {
  if (pool !== null) {
    log.debug("pool already initialized — skipping");
    return;
  }

  const connectionUrl = url ?? process.env.DATABASE_URL;

  if (!connectionUrl) {
    throw new Error(
      "DATABASE_URL is not set. Provide a connection URL as an argument or set the DATABASE_URL environment variable.",
    );
  }

  const poolSize = parseInt(process.env.DB_POOL_SIZE ?? "10", 10);

  log.info("initializing db pool", { poolSize });

  pool = postgres(connectionUrl, {
    max: poolSize,
    idle_timeout: 20,
  });

  db = drizzle(pool);

  // Verify connectivity
  try {
    await pool`SELECT 1`;
    log.info("db pool ready");
  } catch (err) {
    // Clean up so a retry is possible
    await pool.end().catch(() => undefined);
    pool = null;
    db = null;
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to connect to PostgreSQL: ${message}`);
  }
}

/**
 * Returns the Drizzle ORM instance. Throws if called before initDb().
 */
export function getDb(): DbInstance {
  if (db === null) {
    throw new Error("Database is not initialized. Call initDb() before using getDb().");
  }
  return db;
}

/**
 * Returns the raw postgres client. Intended for migration runners and raw SQL
 * operations that bypass the ORM. Throws if called before initDb().
 */
export function getPool(): PostgresClient {
  if (pool === null) {
    throw new Error("Database is not initialized. Call initDb() before using getPool().");
  }
  return pool;
}

/**
 * Gracefully shuts down all connections in the pool.
 */
export async function closePool(): Promise<void> {
  if (pool === null) {
    log.debug("closePool called but pool was not initialized");
    return;
  }

  log.info("closing db pool");

  try {
    await pool.end();
  } finally {
    pool = null;
    db = null;
  }

  log.info("db pool closed");
}

/**
 * Runs a SELECT 1 query to verify the database is reachable.
 * Returns false (instead of throwing) on any error.
 */
export async function isHealthy(): Promise<boolean> {
  if (pool === null) {
    return false;
  }

  try {
    await pool`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

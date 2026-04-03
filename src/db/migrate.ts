import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createLogger } from "@/core/logger";
import { closePool, getDb, getPool, initDb } from "./pool";

// ─── Logger ───────────────────────────────────────────────────────────────────

const log = createLogger("migrate");

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runMigrations(): Promise<void> {
  await initDb();
  const pool = getPool();

  // Enable pgvector extension before running schema migrations
  await pool`CREATE EXTENSION IF NOT EXISTS vector`;
  log.info("pgvector-enabled");

  // Run Drizzle migrations from the ./drizzle directory
  const db = getDb();
  await migrate(db, { migrationsFolder: "./drizzle" });
  log.info("migrations-complete");

  await closePool();
}

runMigrations().catch((err) => {
  log.error("migration-failed", { error: String(err) });
  process.exit(1);
});

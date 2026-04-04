import { afterAll } from "bun:test";
import { closePool } from "../../src/db/pool";

// Global teardown: close the DB pool after all tests complete.
// Force-exit after short delay to prevent hanging from idle postgres connections.
afterAll(async () => {
  await closePool().catch(() => {});
  setTimeout(() => process.exit(0), 200);
});

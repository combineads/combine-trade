// CLI 진입점 — src/config/seed.ts의 seed() 호출
// 실행: bun run scripts/seed.ts
import { seed } from "../src/config/seed";
import { createLogger } from "../src/core/logger";
import { closePool, initDb } from "../src/db/pool";

const log = createLogger("seed-cli");

await initDb();
const result = await seed();
log.info("seed-complete", { details: result });
await closePool();

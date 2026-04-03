import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Path helpers — resolve from project root so tests work regardless of cwd
const projectRoot = resolve(import.meta.dir, "../..");

describe("db/migrate", () => {
  describe("drizzle.config.ts", () => {
    it("drizzle.config.ts exists at project root", () => {
      const configPath = resolve(projectRoot, "drizzle.config.ts");
      expect(existsSync(configPath)).toBe(true);
    });

    it("drizzle.config.ts declares postgresql dialect", async () => {
      // Read raw text to avoid executing the module (no DATABASE_URL needed)
      const configText = await Bun.file(resolve(projectRoot, "drizzle.config.ts")).text();
      expect(configText).toContain("postgresql");
    });

    it("drizzle.config.ts points to src/db/schema.ts", async () => {
      const configText = await Bun.file(resolve(projectRoot, "drizzle.config.ts")).text();
      expect(configText).toContain("src/db/schema.ts");
    });

    it("drizzle.config.ts output directory is ./drizzle", async () => {
      const configText = await Bun.file(resolve(projectRoot, "drizzle.config.ts")).text();
      expect(configText).toContain("./drizzle");
    });
  });

  describe("drizzle/ migration files", () => {
    it("drizzle/ directory exists", () => {
      const drizzleDir = resolve(projectRoot, "drizzle");
      expect(existsSync(drizzleDir)).toBe(true);
    });

    it("drizzle/ contains at least one SQL migration file", () => {
      const drizzleDir = resolve(projectRoot, "drizzle");
      const sqlFiles = readdirSync(drizzleDir).filter((f) => f.endsWith(".sql"));
      expect(sqlFiles.length).toBeGreaterThan(0);
    });

    it("initial migration SQL creates the symbol table", async () => {
      const drizzleDir = resolve(projectRoot, "drizzle");
      const sqlFiles = readdirSync(drizzleDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      const firstSql = await Bun.file(resolve(drizzleDir, sqlFiles[0]!)).text();
      expect(firstSql).toContain('"symbol"');
    });

    it("initial migration SQL creates the symbol_state table", async () => {
      const drizzleDir = resolve(projectRoot, "drizzle");
      const sqlFiles = readdirSync(drizzleDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      const firstSql = await Bun.file(resolve(drizzleDir, sqlFiles[0]!)).text();
      expect(firstSql).toContain('"symbol_state"');
    });

    it("initial migration SQL creates the common_code table", async () => {
      const drizzleDir = resolve(projectRoot, "drizzle");
      const sqlFiles = readdirSync(drizzleDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      const firstSql = await Bun.file(resolve(drizzleDir, sqlFiles[0]!)).text();
      expect(firstSql).toContain('"common_code"');
    });

    it("initial migration SQL includes FK with CASCADE delete", async () => {
      const drizzleDir = resolve(projectRoot, "drizzle");
      const sqlFiles = readdirSync(drizzleDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      const firstSql = await Bun.file(resolve(drizzleDir, sqlFiles[0]!)).text();
      expect(firstSql.toLowerCase()).toContain("on delete cascade");
    });

    it("initial migration SQL includes fsm_state CHECK constraint", async () => {
      const drizzleDir = resolve(projectRoot, "drizzle");
      const sqlFiles = readdirSync(drizzleDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      const firstSql = await Bun.file(resolve(drizzleDir, sqlFiles[0]!)).text();
      expect(firstSql).toContain("symbol_state_fsm_state_check");
    });
  });

  describe("src/db/migrate.ts", () => {
    it("migrate.ts exists", () => {
      const migratePath = resolve(projectRoot, "src/db/migrate.ts");
      expect(existsSync(migratePath)).toBe(true);
    });

    it("migrate.ts imports from ./pool", async () => {
      const migrateText = await Bun.file(resolve(projectRoot, "src/db/migrate.ts")).text();
      expect(migrateText).toContain("./pool");
    });

    it("migrate.ts enables pgvector extension", async () => {
      const migrateText = await Bun.file(resolve(projectRoot, "src/db/migrate.ts")).text();
      expect(migrateText).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    });

    it("migrate.ts uses the Drizzle migrator", async () => {
      const migrateText = await Bun.file(resolve(projectRoot, "src/db/migrate.ts")).text();
      expect(migrateText).toContain("drizzle-orm/postgres-js/migrator");
    });

    it("migrate.ts closes the pool after migration", async () => {
      const migrateText = await Bun.file(resolve(projectRoot, "src/db/migrate.ts")).text();
      expect(migrateText).toContain("closePool");
    });

    it("migrate.ts exits with code 1 on error", async () => {
      const migrateText = await Bun.file(resolve(projectRoot, "src/db/migrate.ts")).text();
      expect(migrateText).toContain("process.exit(1)");
    });
  });
});

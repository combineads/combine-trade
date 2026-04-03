import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LAYER_MAP,
  checkFile,
  checkLayers,
  moduleFromFilePath,
  moduleFromImport,
  parseImports,
} from "../../scripts/check-layers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function writeSrc(dir: string, relPath: string, content: string): string {
  const fullPath = path.join(dir, relPath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
  return fullPath;
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe("check-layers — LAYER_MAP", () => {
  it("core is layer 0", () => {
    expect(LAYER_MAP["core"]).toBe(0);
  });

  it("db and config are layer 1", () => {
    expect(LAYER_MAP["db"]).toBe(1);
    expect(LAYER_MAP["config"]).toBe(1);
  });

  it("daemon is layer 9", () => {
    expect(LAYER_MAP["daemon"]).toBe(9);
  });
});

describe("check-layers — moduleFromFilePath", () => {
  const srcRoot = "/project/src";

  it("resolves sub-directory file to module name", () => {
    expect(moduleFromFilePath("/project/src/db/pool.ts", srcRoot)).toBe("db");
  });

  it("resolves top-level file (daemon.ts) to daemon", () => {
    expect(moduleFromFilePath("/project/src/daemon.ts", srcRoot)).toBe("daemon");
  });

  it("resolves nested sub-directory file to top-level module", () => {
    expect(moduleFromFilePath("/project/src/db/migrations/001.ts", srcRoot)).toBe("db");
  });

  it("returns null for file outside srcRoot", () => {
    expect(moduleFromFilePath("/other/path/file.ts", srcRoot)).toBeNull();
  });

  it("resolves core module", () => {
    expect(moduleFromFilePath("/project/src/core/types.ts", srcRoot)).toBe("core");
  });
});

describe("check-layers — moduleFromImport", () => {
  const srcRoot = "/project/src";

  it("resolves @/ alias to module name", () => {
    expect(moduleFromImport("@/core/types", "/project/src/db/pool.ts", srcRoot)).toBe("core");
  });

  it("resolves @/db/pool to db module", () => {
    expect(moduleFromImport("@/db/pool", "/project/src/api/index.ts", srcRoot)).toBe("db");
  });

  it("resolves relative import to correct module", () => {
    // From src/db/pool.ts, ../core/types → src/core/types → core
    expect(moduleFromImport("../core/types", "/project/src/db/pool.ts", srcRoot)).toBe("core");
  });

  it("resolves same-directory relative import to same module", () => {
    // From src/db/pool.ts, ./queries → src/db/queries → db
    expect(moduleFromImport("./queries", "/project/src/db/pool.ts", srcRoot)).toBe("db");
  });

  it("returns null for external packages", () => {
    expect(moduleFromImport("decimal.js", "/project/src/core/decimal.ts", srcRoot)).toBeNull();
  });

  it("returns null for scoped external packages", () => {
    expect(moduleFromImport("drizzle-orm/postgres-js", "/project/src/db/pool.ts", srcRoot)).toBeNull();
  });

  it("resolves @/ with single-segment path", () => {
    expect(moduleFromImport("@/core", "/project/src/db/pool.ts", srcRoot)).toBe("core");
  });
});

describe("check-layers — parseImports", () => {
  it("parses static import with double quotes", () => {
    const source = `import { foo } from "bar"`;
    expect(parseImports(source)).toContain("bar");
  });

  it("parses static import with single quotes", () => {
    const source = `import { foo } from 'bar'`;
    expect(parseImports(source)).toContain("bar");
  });

  it("parses import type statement", () => {
    const source = `import type { Foo } from "@/core/types"`;
    expect(parseImports(source)).toContain("@/core/types");
  });

  it("parses dynamic import", () => {
    const source = `const mod = await import("@/db/pool")`;
    expect(parseImports(source)).toContain("@/db/pool");
  });

  it("parses multiple imports", () => {
    const source = `
import { a } from "@/core/types"
import type { B } from "@/db/pool"
import { c } from "external-pkg"
`;
    const results = parseImports(source);
    expect(results).toContain("@/core/types");
    expect(results).toContain("@/db/pool");
    expect(results).toContain("external-pkg");
  });

  it("returns empty array for file with no imports", () => {
    expect(parseImports("export const x = 1;")).toEqual([]);
  });

  it("parses default import", () => {
    const source = `import Decimal from "decimal.js"`;
    expect(parseImports(source)).toContain("decimal.js");
  });
});

// ─── Integration tests using temp filesystem ──────────────────────────────────

describe("check-layers — checkFile", () => {
  let tmpDir: string;
  let srcRoot: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "check-layers-test-"));
    srcRoot = path.join(tmpDir, "src");
    mkdirSync(srcRoot, { recursive: true });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("L1 (db) importing from L0 (core) is allowed", () => {
    const file = writeSrc(
      srcRoot,
      "db/pool.ts",
      `import type { Candle } from "@/core/types";\nexport {};`,
    );
    const violations = checkFile(file, srcRoot);
    expect(violations).toHaveLength(0);
  });

  it("L0 (core) importing from L1 (db) is a violation", () => {
    const file = writeSrc(
      srcRoot,
      "core/types.ts",
      `import { getDb } from "@/db/pool";\nexport {};`,
    );
    const violations = checkFile(file, srcRoot);
    expect(violations).toHaveLength(1);
    const v = violations[0];
    expect(v).toBeDefined();
    if (v !== undefined) {
      expect(v.sourceModule).toBe("core");
      expect(v.sourceLayer).toBe(0);
      expect(v.targetModule).toBe("db");
      expect(v.targetLayer).toBe(1);
    }
  });

  it("same-module import is always allowed", () => {
    const file = writeSrc(
      srcRoot,
      "db/queries.ts",
      `import { getPool } from "./pool";\nexport {};`,
    );
    const violations = checkFile(file, srcRoot);
    expect(violations).toHaveLength(0);
  });

  it("external package imports are skipped", () => {
    const file = writeSrc(
      srcRoot,
      "db/drizzle.ts",
      `import { drizzle } from "drizzle-orm/postgres-js";\nexport {};`,
    );
    const violations = checkFile(file, srcRoot);
    expect(violations).toHaveLength(0);
  });

  it("L2 (indicators) importing from L1 (db) is allowed", () => {
    const file = writeSrc(
      srcRoot,
      "indicators/bb.ts",
      `import { getDb } from "@/db/pool";\nexport {};`,
    );
    const violations = checkFile(file, srcRoot);
    expect(violations).toHaveLength(0);
  });

  it("L2 (indicators) importing from L3 (candles) is a violation", () => {
    const file = writeSrc(
      srcRoot,
      "indicators/calc.ts",
      `import { CandleCollector } from "@/candles/index";\nexport {};`,
    );
    const violations = checkFile(file, srcRoot);
    expect(violations).toHaveLength(1);
    const v = violations[0];
    expect(v).toBeDefined();
    if (v !== undefined) {
      expect(v.sourceModule).toBe("indicators");
      expect(v.targetModule).toBe("candles");
    }
  });

  it("import type violations are also caught", () => {
    const file = writeSrc(
      srcRoot,
      "core/util.ts",
      `import type { DbInstance } from "@/db/pool";\nexport {};`,
    );
    const violations = checkFile(file, srcRoot);
    expect(violations).toHaveLength(1);
  });

  it("skips files in modules not in LAYER_MAP", () => {
    const file = writeSrc(
      srcRoot,
      "unknown-module/helper.ts",
      `import { getDb } from "@/db/pool";\nexport {};`,
    );
    const violations = checkFile(file, srcRoot);
    expect(violations).toHaveLength(0);
  });

  it("daemon (L9) can import from any layer without violation", () => {
    const file = writeSrc(
      srcRoot,
      "daemon.ts",
      `import { getDb } from "@/db/pool";
import type { Candle } from "@/core/types";
import { KnnEngine } from "@/knn/engine";
export {};`,
    );
    const violations = checkFile(file, srcRoot);
    expect(violations).toHaveLength(0);
  });

  it("relative path alias resolution works (../ import)", () => {
    // L1 db importing from L0 core via relative path → allowed
    const file = writeSrc(
      srcRoot,
      "db/other.ts",
      `import type { Candle } from "../core/types";\nexport {};`,
    );
    const violations = checkFile(file, srcRoot);
    expect(violations).toHaveLength(0);
  });
});

describe("check-layers — checkLayers", () => {
  let tmpDir: string;
  let srcRoot: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "check-layers-full-"));
    srcRoot = path.join(tmpDir, "src");
    mkdirSync(srcRoot, { recursive: true });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("clean codebase returns zero violations", () => {
    // core imports nothing internal
    writeSrc(srcRoot, "core/types.ts", `export type Foo = string;`);
    // db imports from core — allowed
    writeSrc(
      srcRoot,
      "db/pool.ts",
      `import type { Foo } from "@/core/types";\nexport {};`,
    );
    // web is skipped — even if it has bad imports
    writeSrc(
      srcRoot,
      "web/App.tsx",
      `import { getDb } from "@/db/pool";\nexport {};`,
    );

    const violations = checkLayers(srcRoot);
    expect(violations).toHaveLength(0);
  });

  it("detects violation in a nested file", () => {
    // Reset by creating new tmpDir state (violations accumulate per call)
    const dir2 = mkdtempSync(path.join(os.tmpdir(), "check-layers-nest-"));
    const src2 = path.join(dir2, "src");
    try {
      // core tries to import from db — violation
      writeSrc(src2, "core/types.ts", `import { getDb } from "@/db/pool";\nexport {};`);
      writeSrc(src2, "db/pool.ts", `export function getDb() {}`);

      const violations = checkLayers(src2);
      expect(violations.length).toBeGreaterThanOrEqual(1);
      const v = violations.find((x) => x.sourceModule === "core" && x.targetModule === "db");
      expect(v).toBeDefined();
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});

describe("check-layers — real project has 0 violations", () => {
  it("current src/ directory reports no layer violations", () => {
    // Use the actual project src directory
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(testDir, "../..");
    const srcRoot = path.join(projectRoot, "src");
    const violations = checkLayers(srcRoot);

    if (violations.length > 0) {
      for (const v of violations) {
        console.error(
          `VIOLATION: ${v.sourceFile} imports "${v.importPath}" (${v.targetModule}=L${v.targetLayer}) but source is ${v.sourceModule}=L${v.sourceLayer}`,
        );
      }
    }

    expect(violations).toHaveLength(0);
  });
});

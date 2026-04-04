/**
 * Layer dependency enforcement script.
 *
 * Scans all .ts files under src/ and verifies that no module imports from a
 * higher architectural layer. Exits 0 when clean, exits 1 on violations.
 *
 * Layer map (source of truth: docs/ARCHITECTURE.md):
 *
 *   L0  core
 *   L1  db, config
 *   L2  indicators, exchanges
 *   L3  candles, vectors
 *   L4  filters, knn
 *   L5  signals, positions, limits
 *   L6  orders, exits, labeling
 *   L7  reconciliation, notifications, transfer
 *   L8  api, backtest
 *   L9  daemon
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ─── Layer map ────────────────────────────────────────────────────────────────

export const LAYER_MAP: Record<string, number> = {
  core: 0,
  db: 1,
  config: 1,
  indicators: 2,
  exchanges: 2,
  candles: 3,
  vectors: 3,
  filters: 4,
  knn: 4,
  signals: 5,
  positions: 5,
  limits: 5,
  orders: 6,
  exits: 6,
  labeling: 6,
  reconciliation: 7,
  notifications: 7,
  transfer: 7,
  api: 8,
  backtest: 8,
  daemon: 9,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type Violation = {
  sourceFile: string;
  importPath: string;
  sourceModule: string;
  sourceLayer: number;
  targetModule: string;
  targetLayer: number;
};

// ─── Path utilities ───────────────────────────────────────────────────────────

/**
 * Resolves a module name from an absolute file path rooted at src/.
 *
 * Examples:
 *   /…/src/db/pool.ts       → "db"
 *   /…/src/daemon.ts        → "daemon"
 *   /…/src/web/App.tsx      → "web"
 */
export function moduleFromFilePath(filePath: string, srcRoot: string): string | null {
  const rel = path.relative(srcRoot, filePath);
  if (rel.startsWith("..")) {
    return null;
  }
  const parts = rel.split(path.sep);
  if (parts.length === 0) {
    return null;
  }
  // Top-level file like daemon.ts → strip extension, use base name
  if (parts.length === 1) {
    return path.basename(parts[0] as string, path.extname(parts[0] as string));
  }
  // Sub-directory file → first path segment is the module name
  return parts[0] as string;
}

/**
 * Resolves an import specifier to a module name.
 *
 * Handles:
 *   - `@/core/types`       → "core"
 *   - `../core/types`      → "core"  (relative to sourceFile)
 *   - `./pool`             → same module as sourceFile
 *   - External packages    → null (skip)
 */
export function moduleFromImport(
  importSpecifier: string,
  sourceFile: string,
  srcRoot: string,
): string | null {
  // @/ alias → maps to src/
  if (importSpecifier.startsWith("@/")) {
    const withoutAlias = importSpecifier.slice(2); // strip "@/"
    const parts = withoutAlias.split("/");
    return parts[0] ?? null;
  }

  // Relative import
  if (importSpecifier.startsWith(".")) {
    const sourceDir = path.dirname(sourceFile);
    const resolved = path.resolve(sourceDir, importSpecifier);
    return moduleFromFilePath(resolved, srcRoot);
  }

  // External package → skip
  return null;
}

// ─── Import parser ────────────────────────────────────────────────────────────

/**
 * Extracts all import specifiers from TypeScript source text.
 *
 * Matches:
 *   import ... from "..."
 *   import type ... from "..."
 *   import("...")
 *   import('...')
 */
export function parseImports(source: string): string[] {
  const specifiers: string[] = [];

  // Static imports: import ... from "specifier"
  // Also matches: import type ... from "specifier"
  const staticRe = /\bimport\s+(?:type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(staticRe)) {
    if (match[1] !== undefined) {
      specifiers.push(match[1]);
    }
  }

  // Dynamic imports: import("specifier") or import('specifier')
  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(dynamicRe)) {
    if (match[1] !== undefined) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

// ─── File scanner ─────────────────────────────────────────────────────────────

/**
 * Recursively collects all .ts file paths under the given directory.
 * Skips directories named "web" (standalone React UI — not layer-enforced).
 */
export function collectTsFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip the standalone web module
      if (entry === "web") {
        continue;
      }
      files.push(...collectTsFiles(fullPath));
    } else if (stat.isFile() && (entry.endsWith(".ts") || entry.endsWith(".tsx"))) {
      files.push(fullPath);
    }
  }

  return files;
}

// ─── Checker ──────────────────────────────────────────────────────────────────

/**
 * Checks a single file for layer violations.
 */
export function checkFile(filePath: string, srcRoot: string): Violation[] {
  const violations: Violation[] = [];

  const sourceModule = moduleFromFilePath(filePath, srcRoot);
  if (sourceModule === null) {
    return violations;
  }

  const sourceLayer = LAYER_MAP[sourceModule];
  if (sourceLayer === undefined) {
    // Module not in layer map → skip (e.g., test helpers, unknown dirs)
    return violations;
  }

  const source = readFileSync(filePath, "utf-8");
  const imports = parseImports(source);

  for (const importSpec of imports) {
    const targetModule = moduleFromImport(importSpec, filePath, srcRoot);
    if (targetModule === null) {
      // External package — skip
      continue;
    }

    const targetLayer = LAYER_MAP[targetModule];
    if (targetLayer === undefined) {
      // Target module not in layer map → skip
      continue;
    }

    // Same-module imports are always allowed
    if (targetModule === sourceModule) {
      continue;
    }

    // Rule: source layer must be >= target layer (can only import downward)
    if (sourceLayer < targetLayer) {
      violations.push({
        sourceFile: filePath,
        importPath: importSpec,
        sourceModule,
        sourceLayer,
        targetModule,
        targetLayer,
      });
    }
  }

  return violations;
}

/**
 * Runs the full layer check across all .ts files under srcRoot.
 * Returns the list of violations found.
 */
export function checkLayers(srcRoot: string): Violation[] {
  const files = collectTsFiles(srcRoot);
  const allViolations: Violation[] = [];

  for (const file of files) {
    allViolations.push(...checkFile(file, srcRoot));
  }

  return allViolations;
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

function main(): void {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, "..");
  const srcRoot = path.join(projectRoot, "src");

  console.log(`Checking layer dependencies in: ${srcRoot}`);

  const violations = checkLayers(srcRoot);

  if (violations.length === 0) {
    console.log("No layer violations found.");
    process.exit(0);
  }

  console.error(`\nFound ${violations.length} layer violation(s):\n`);

  for (const v of violations) {
    const rel = path.relative(projectRoot, v.sourceFile);
    console.error(
      `  ${rel}\n    imports "${v.importPath}" (${v.targetModule} = L${v.targetLayer})\n    but source module "${v.sourceModule}" is L${v.sourceLayer} — cannot import upward\n`,
    );
  }

  process.exit(1);
}

// Only run when executed directly (not when imported by tests)
const _scriptPath = fileURLToPath(import.meta.url);
const _entryPath = path.resolve(process.argv[1] ?? "");
if (_scriptPath === _entryPath) {
  main();
}

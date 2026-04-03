import { eq } from "drizzle-orm";

import { createLogger } from "@/core/logger";
import { getDb } from "@/db/pool";
import { commonCodeTable } from "@/db/schema";

import { validateConfigValue } from "./schema";

// ─── State ────────────────────────────────────────────────────────────────────

const log = createLogger("config");

/** Cache: group_code → code → validated value */
const cache = new Map<string, Map<string, unknown>>();

let loaded = false;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Loads all active config rows from the DB into the in-memory cache.
 * Validates each value against its schema — throws on first validation failure
 * so startup fails fast rather than running with invalid config.
 */
export async function loadAllConfig(): Promise<void> {
  const db = getDb();

  const rows = await db.select().from(commonCodeTable).where(eq(commonCodeTable.is_active, true));

  const next = new Map<string, Map<string, unknown>>();

  for (const row of rows) {
    const { group_code, code, value } = row;

    const result = validateConfigValue(group_code, code, value);

    if (!result.success) {
      throw new Error(
        `Config validation failed for ${group_code}.${code}: ${result.error.message}`,
      );
    }

    let groupMap = next.get(group_code);
    if (groupMap === undefined) {
      groupMap = new Map<string, unknown>();
      next.set(group_code, groupMap);
    }

    groupMap.set(code, result.data);
  }

  // Swap atomically
  cache.clear();
  for (const [group, groupMap] of next) {
    cache.set(group, groupMap);
  }

  loaded = true;

  log.info("config loaded", { details: { row_count: rows.length } });
}

/**
 * Returns a cached value synchronously. Throws ConfigNotFoundError when the
 * group or code is not present in the cache.
 */
export function getCachedValue<T>(group: string, code: string): T {
  const groupMap = cache.get(group);

  if (groupMap === undefined) {
    throw new ConfigNotFoundError(group, code);
  }

  const value = groupMap.get(code);

  if (value === undefined) {
    throw new ConfigNotFoundError(group, code);
  }

  return value as T;
}

/**
 * Returns all code → value entries for a group. Throws ConfigNotFoundError
 * when the group is not in the cache.
 */
export function getGroupConfig(group: string): Map<string, unknown> {
  const groupMap = cache.get(group);

  if (groupMap === undefined) {
    throw new ConfigNotFoundError(group, "");
  }

  return groupMap;
}

/**
 * Returns true after loadAllConfig() has completed at least once.
 */
export function isLoaded(): boolean {
  return loaded;
}

/**
 * Clears all cached values and resets the loaded flag. Intended for testing.
 */
export function clearCache(): void {
  cache.clear();
  loaded = false;
}

// ─── Error types ──────────────────────────────────────────────────────────────

export class ConfigNotFoundError extends Error {
  constructor(group: string, code: string) {
    super(`Config not found: ${group}.${code}`);
    this.name = "ConfigNotFoundError";
  }
}

export class AnchorModificationError extends Error {
  constructor(group: string) {
    super(`ANCHOR group '${group}' cannot be modified`);
    this.name = "AnchorModificationError";
  }
}

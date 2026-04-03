import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/pool";
import { commonCodeTable } from "@/db/schema";

import {
  AnchorModificationError,
  ConfigNotFoundError,
  clearCache,
  getGroupConfig as getCachedGroupConfig,
  getCachedValue,
  isLoaded,
  loadAllConfig,
} from "./loader";
import { ANCHOR_GROUPS, validateConfigValue } from "./schema";

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { AnchorModificationError, ConfigNotFoundError };

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConfigChangeCallback = (change: {
  group: string;
  code: string;
  value: unknown;
}) => void;

export type Unsubscribe = () => void;

// ─── State ────────────────────────────────────────────────────────────────────

const subscribers = new Set<ConfigChangeCallback>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notify(group: string, code: string, value: unknown): void {
  const change = { group, code, value };
  for (const cb of subscribers) {
    cb(change);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Loads all active config from the DB into memory. Must be called before any
 * synchronous getter. Idempotent — safe to call multiple times (use
 * refreshConfig to force a reload).
 */
export async function loadConfig(): Promise<void> {
  if (isLoaded()) {
    return;
  }
  await loadAllConfig();
}

/**
 * Synchronous config getter. Throws ConfigNotFoundError when the group or code
 * is not in the cache. Call loadConfig() at startup before using this.
 */
export function getConfig<T>(group: string, code: string): T {
  return getCachedValue<T>(group, code);
}

/**
 * Returns all code → value entries for a group.
 * Throws ConfigNotFoundError when the group is absent.
 */
export function getGroupConfig(group: string): Map<string, unknown> {
  return getCachedGroupConfig(group);
}

/**
 * Forces a full reload from the DB, replacing the current cache. Triggers
 * change notifications for all reloaded entries.
 */
export async function refreshConfig(): Promise<void> {
  clearCache();
  await loadAllConfig();

  // Notify all subscribers — we don't diff, just emit every key
  const db = getDb();
  const rows = await db.select().from(commonCodeTable).where(eq(commonCodeTable.is_active, true));

  for (const row of rows) {
    const { group_code, code, value } = row;
    notify(group_code, code, value);
  }
}

/**
 * Persists a config value to the DB, updates the cache, and triggers change
 * notifications. Throws AnchorModificationError if the group is an ANCHOR.
 */
export async function updateConfig(group: string, code: string, value: unknown): Promise<void> {
  if ((ANCHOR_GROUPS as readonly string[]).includes(group)) {
    throw new AnchorModificationError(group);
  }

  const validation = validateConfigValue(group, code, value);
  if (!validation.success) {
    throw new Error(`Invalid config value for ${group}.${code}: ${validation.error.message}`);
  }

  const db = getDb();

  await db
    .update(commonCodeTable)
    .set({ value, updated_at: new Date() })
    .where(and(eq(commonCodeTable.group_code, group), eq(commonCodeTable.code, code)));

  // Update cache entry
  try {
    const groupMap = getCachedGroupConfig(group);
    groupMap.set(code, validation.data);
  } catch {
    // Group not yet in cache — not an error, next loadConfig() will pick it up
  }

  notify(group, code, value);
}

/**
 * Registers a callback that fires whenever a config value changes via
 * updateConfig() or refreshConfig(). Returns an unsubscribe function.
 */
export function watchConfig(callback: ConfigChangeCallback): Unsubscribe {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

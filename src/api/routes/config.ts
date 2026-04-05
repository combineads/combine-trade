/**
 * Config route — GET /config, PUT /common-code/:groupCode/:code
 *
 * Returns current configuration from memory cache:
 * execution modes per symbol and active trade blocks.
 * Allows updating tunable CommonCode values via REST.
 *
 * Layer: L8 (api) — may import L0-L7.
 */

import { Hono } from "hono";
import { AnchorModificationError, ConfigNotFoundError } from "@/config/index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Trade block row shape. All time/numeric fields as strings.
 */
export type TradeBlockRow = {
  id: string;
  symbol: string;
  exchange: string;
  reason: string;
  blocked_at: string;
  expires_at: string | null;
};

/**
 * Config result shape returned by the DI function.
 */
export type ConfigResult = {
  execution_modes: Record<string, string>;
  trade_blocks: TradeBlockRow[];
};

/**
 * Dependency injection interface for config route.
 */
export type ConfigDeps = {
  /** Returns current config from memory cache */
  getConfig(): Promise<ConfigResult>;
  /** Persists a config value to DB, updates cache, and notifies subscribers */
  updateConfig?(group: string, code: string, value: unknown): Promise<void>;
  /** Forces a full reload from DB, replacing the in-memory cache */
  refreshConfig?(): Promise<void>;
};

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates the config sub-router.
 *
 * GET /config                              — current execution modes and active trade blocks.
 * PUT /common-code/:groupCode/:code        — update a tunable CommonCode value.
 */
export function createConfigRoutes(deps: ConfigDeps): Hono {
  const router = new Hono();

  // ---- GET /config ----
  router.get("/config", async (c) => {
    const config = await deps.getConfig();
    return c.json(config);
  });

  // ---- PUT /common-code/:groupCode/:code ----
  router.put("/common-code/:groupCode/:code", async (c) => {
    const groupCode = c.req.param("groupCode");
    const code = c.req.param("code");

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // Require value field
    if (!("value" in body)) {
      return c.json({ error: "Missing required field: value" }, 400);
    }

    const { value } = body;

    // Call updateConfig dep
    const updateConfig = deps.updateConfig;
    if (updateConfig === undefined) {
      return c.json({ error: "updateConfig not available" }, 500);
    }

    try {
      await updateConfig(groupCode, code, value);
    } catch (err) {
      if (err instanceof AnchorModificationError) {
        return c.json({ error: "ANCHOR_GROUP_MODIFICATION_REJECTED", group: groupCode }, 400);
      }
      if (err instanceof ConfigNotFoundError) {
        return c.json({ error: "CONFIG_NOT_FOUND" }, 404);
      }
      // Treat all other errors as validation failures
      const message = err instanceof Error ? err.message : "Invalid config value";
      return c.json({ error: "INVALID_CONFIG_VALUE", message }, 422);
    }

    // Reload cache after successful update
    const refreshConfig = deps.refreshConfig;
    if (refreshConfig !== undefined) {
      await refreshConfig();
    }

    return c.json({ group: groupCode, code, value }, 200);
  });

  return router;
}

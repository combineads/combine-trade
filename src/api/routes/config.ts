/**
 * Config route — GET /config
 *
 * Returns current configuration from memory cache:
 * execution modes per symbol and active trade blocks.
 *
 * Layer: L8 (api) — may import L0-L7.
 */

import { Hono } from "hono";

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
};

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates the config sub-router.
 *
 * GET /config — current execution modes and active trade blocks.
 */
export function createConfigRoutes(deps: ConfigDeps): Hono {
  const router = new Hono();

  router.get("/config", async (c) => {
    const config = await deps.getConfig();
    return c.json(config);
  });

  return router;
}

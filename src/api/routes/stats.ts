/**
 * Stats route — GET /stats
 *
 * Returns performance statistics for CLOSED tickets.
 * Query params:
 *   ?period=today|7d|30d|all  (default: all)
 *
 * Layer: L8 (api) — route handler only, no DB access.
 */

import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Stats result from the DI query function. All numerics as strings. */
export type StatsResult = {
  total_pnl: string;
  total_trades: number;
  win_count: number;
  loss_count: number;
  win_rate: string | null;
  avg_risk_reward: string;
  mdd: string;
};

/** Dependency injection interface for the stats route. */
export type StatsDeps = {
  getStats(period: "today" | "7d" | "30d" | "all"): Promise<StatsResult>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PERIODS = new Set(["today", "7d", "30d", "all"]);

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates the stats sub-router.
 *
 * GET /stats — aggregate performance statistics for CLOSED tickets.
 */
export function createStatsRoutes(deps: StatsDeps): Hono {
  const router = new Hono();

  router.get("/stats", async (c) => {
    // ---- Parse & validate query params ----
    const periodParam = c.req.query("period") ?? "all";
    if (!VALID_PERIODS.has(periodParam)) {
      return c.json({ error: "Invalid period" }, 400);
    }
    const period = periodParam as "today" | "7d" | "30d" | "all";

    // ---- Query via DI ----
    const stats = await deps.getStats(period);

    return c.json(stats);
  });

  return router;
}

/**
 * Signals route — GET /signals/recent
 *
 * Returns recent N signal records for the dashboard signal list.
 * All numeric fields are serialized as strings (Decimal.js safety).
 *
 * Layer: L8 (api) — may import L0-L7.
 */

import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Row shape returned by the DI query function.
 * Numeric fields are already strings (Decimal.js .toString()).
 */
export type SignalRow = {
  id: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  signal_type: string;
  direction: string;
  safety_passed: boolean;
  knn_decision: string;
  a_grade: string;
  created_at: string;
};

/**
 * Dependency injection interface for signals route.
 */
export type SignalsDeps = {
  /** Returns the most recent N signals, newest first */
  getRecentSignals(limit: number): Promise<SignalRow[]>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates the signals sub-router.
 *
 * GET /signals/recent — recent N signals, newest first.
 */
export function createSignalsRoutes(deps: SignalsDeps): Hono {
  const router = new Hono();

  router.get("/signals/recent", async (c) => {
    const limitParam = c.req.query("limit");
    let limit = DEFAULT_LIMIT;
    if (limitParam !== undefined) {
      const parsed = Number.parseInt(limitParam, 10);
      if (!Number.isNaN(parsed) && parsed >= 1) {
        limit = Math.min(parsed, MAX_LIMIT);
      } else {
        limit = DEFAULT_LIMIT;
      }
    }

    const rows = await deps.getRecentSignals(limit);
    return c.json(rows);
  });

  return router;
}

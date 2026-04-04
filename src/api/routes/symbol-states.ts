/**
 * Symbol states route — GET /symbol-states
 *
 * Returns all SymbolState records for the dashboard symbol cards.
 * All numeric fields are serialized as strings (Decimal.js safety).
 *
 * Layer: L8 (api) — may import L0-L7.
 */

import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Row shape returned by the DB query function.
 * Numeric fields are already strings (Decimal.js .toString()).
 */
export type SymbolStateRow = {
  id: string;
  symbol: string;
  exchange: string;
  fsm_state: string;
  execution_mode: string;
  daily_bias: string | null;
  daily_open: string | null;
  session_box_high: string | null;
  session_box_low: string | null;
  losses_today: string;
  losses_session: string;
  losses_this_1h_5m: string;
  losses_this_1h_1m: string;
  updated_at: string;
};

/**
 * Dependency injection interface for symbol-states route.
 */
export type SymbolStatesDeps = {
  /** Returns all SymbolState rows with numeric fields as strings */
  getSymbolStates(): Promise<SymbolStateRow[]>;
};

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates symbol-states route as a Hono sub-router.
 *
 * Routes:
 * - GET /symbol-states -> SymbolStateRow[]
 */
export function createSymbolStatesRoutes(deps: SymbolStatesDeps): Hono {
  const router = new Hono();

  router.get("/symbol-states", async (c) => {
    const rows = await deps.getSymbolStates();
    return c.json(rows);
  });

  return router;
}

/**
 * Positions route — GET /positions
 *
 * Returns active tickets (state != 'CLOSED') for the dashboard positions table.
 * All price/size/pnl fields are serialized as strings (Decimal.js safety).
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
export type PositionRow = {
  id: string;
  symbol: string;
  exchange: string;
  signal_id: string;
  parent_ticket_id: string | null;
  timeframe: string;
  direction: string;
  state: string;
  entry_price: string;
  sl_price: string;
  current_sl_price: string;
  size: string;
  remaining_size: string;
  leverage: string;
  tp1_price: string | null;
  tp2_price: string | null;
  trailing_active: boolean;
  trailing_price: string | null;
  max_profit: string;
  pyramid_count: string;
  opened_at: string;
  closed_at: string | null;
  close_reason: string | null;
  result: string | null;
  pnl: string | null;
  pnl_pct: string | null;
  max_favorable: string | null;
  max_adverse: string | null;
  hold_duration_sec: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Dependency injection interface for positions route.
 */
export type PositionsDeps = {
  /** Returns active tickets (state != 'CLOSED') with numeric fields as strings */
  getActivePositions(): Promise<PositionRow[]>;
};

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates positions route as a Hono sub-router.
 *
 * Routes:
 * - GET /positions -> PositionRow[]
 */
export function createPositionsRoutes(deps: PositionsDeps): Hono {
  const router = new Hono();

  router.get("/positions", async (c) => {
    const rows = await deps.getActivePositions();
    return c.json(rows);
  });

  return router;
}

/**
 * Events route — GET /events/recent
 *
 * Returns recent N event log records for the dashboard event list.
 *
 * Layer: L8 (api) — may import L0-L7.
 */

import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Row shape returned by the DI query function.
 */
export type EventRow = {
  id: string;
  event_type: string;
  symbol: string;
  exchange: string;
  data: unknown;
  created_at: string;
};

/**
 * Dependency injection interface for events route.
 */
export type EventsDeps = {
  /** Returns the most recent N events, newest first */
  getRecentEvents(limit: number): Promise<EventRow[]>;
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
 * Creates the events sub-router.
 *
 * GET /events/recent — recent N events, newest first.
 */
export function createEventsRoutes(deps: EventsDeps): Hono {
  const router = new Hono();

  router.get("/events/recent", async (c) => {
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

    const rows = await deps.getRecentEvents(limit);
    return c.json(rows);
  });

  return router;
}

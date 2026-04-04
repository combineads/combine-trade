/**
 * Health check route — GET /health
 *
 * Returns system health status including DB connectivity and uptime.
 * This endpoint is publicly accessible (no auth required).
 *
 * Layer: L8 (api) — may import L0-L7.
 */

import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Dependency injection interface for health route.
 */
export type HealthDeps = {
  /** Check if the database connection is alive */
  checkDb(): Promise<boolean>;
};

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

type HealthResponse = {
  status: "ok" | "degraded";
  db: "connected" | "disconnected";
  uptime_seconds: number;
};

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates health check route as a Hono sub-router.
 *
 * Routes:
 * - GET /health -> { status, db, uptime_seconds }
 */
export function createHealthRoutes(deps: HealthDeps): Hono {
  const router = new Hono();
  const startTime = Date.now();

  router.get("/health", async (c) => {
    let dbConnected: boolean;
    try {
      dbConnected = await deps.checkDb();
    } catch {
      dbConnected = false;
    }

    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    const body: HealthResponse = {
      status: dbConnected ? "ok" : "degraded",
      db: dbConnected ? "connected" : "disconnected",
      uptime_seconds: uptimeSeconds,
    };

    return c.json(body);
  });

  return router;
}

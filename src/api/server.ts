/**
 * Hono + Bun.serve API server factory.
 *
 * Responsibilities:
 * - Serve static files from ./public (Hono serveStatic for Bun)
 * - Mount /api/* route namespace (future routes plug in here)
 * - SPA fallback: non-/api/ paths that miss static files → index.html
 * - /api/* 404 → JSON { error: "Not Found" }
 *
 * Layer: L8 (api) — may import L0-L7.
 */

import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { corsMiddleware, createAuthGuard, errorHandler, queryTimeout } from "@/api/middleware";
import { createHealthRoutes } from "@/api/routes/health";
import { createPositionsRoutes } from "@/api/routes/positions";
import { createStatsRoutes } from "@/api/routes/stats";
import { createSymbolStatesRoutes } from "@/api/routes/symbol-states";
import { createTicketRoutes } from "@/api/routes/tickets";
import type { ApiServerDeps, ApiServerHandle, RouteDeps } from "@/api/types";

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 3100;
const DEFAULT_STATIC_DIR = "./public";

// ---------------------------------------------------------------------------
// API sub-router
// ---------------------------------------------------------------------------

/**
 * Creates the /api sub-router. Mounts dashboard route modules when routeDeps
 * is provided; otherwise, returns a bare router with only the 404 catch-all.
 */
function createApiRouter(routeDeps?: RouteDeps): Hono {
  const api = new Hono();

  // Mount dashboard routes when dependencies are provided
  if (routeDeps !== undefined) {
    api.route("/", createHealthRoutes(routeDeps));
    api.route("/", createSymbolStatesRoutes(routeDeps));
    api.route("/", createPositionsRoutes(routeDeps));
    api.route("/", createTicketRoutes(routeDeps));
    api.route("/", createStatsRoutes(routeDeps));
  }

  // Catch-all: any /api/* path that doesn't match a registered route → 404 JSON
  api.all("/*", (c) => {
    return c.json({ error: "Not Found" }, 404);
  });

  return api;
}

// ---------------------------------------------------------------------------
// createApiServer factory
// ---------------------------------------------------------------------------

/**
 * Creates an API server with Hono + Bun.serve.
 *
 * Usage:
 * ```ts
 * const server = createApiServer({ logger });
 * await server.start();
 * // ... later
 * await server.stop();
 * ```
 */
export function createApiServer(deps: ApiServerDeps): ApiServerHandle {
  const {
    logger,
    port = DEFAULT_PORT,
    staticDir = DEFAULT_STATIC_DIR,
    jwtSecret,
    queryTimeoutMs = 5000,
    routeDeps,
  } = deps;

  const app = new Hono();

  // ---- Middleware (order: CORS → errorHandler → authGuard → queryTimeout) ----
  app.use("*", corsMiddleware());
  app.onError(errorHandler());
  if (jwtSecret !== undefined) {
    app.use("*", createAuthGuard(jwtSecret));
  }
  app.use("*", queryTimeout(queryTimeoutMs));

  // ---- Mount /api/* routes ----
  const apiRouter = createApiRouter(routeDeps);
  app.route("/api", apiRouter);

  // ---- Static file serving from ./public ----
  app.use("*", serveStatic({ root: staticDir }));

  // ---- SPA fallback: non-/api/ paths serve index.html ----
  app.get("*", serveStatic({ root: staticDir, path: "index.html" }));

  // ---- Server lifecycle ----
  let server: ReturnType<typeof Bun.serve> | null = null;

  async function start(): Promise<void> {
    if (server !== null) {
      logger.warn("api_server_already_running");
      return;
    }

    server = Bun.serve({
      port,
      fetch: app.fetch,
    });

    logger.info("api_server_started", { details: { port: server.port } });
  }

  async function stop(): Promise<void> {
    if (server === null) {
      return;
    }

    server.stop(true);
    server = null;
    logger.info("api_server_stopped");
  }

  return { start, stop };
}

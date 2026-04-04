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
import type { ApiServerDeps, ApiServerHandle } from "@/api/types";

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 3100;
const DEFAULT_STATIC_DIR = "./public";

// ---------------------------------------------------------------------------
// API sub-router
// ---------------------------------------------------------------------------

/**
 * Creates the /api sub-router. Individual route modules will be mounted
 * here in later tasks (T-11-004 onwards).
 */
function createApiRouter(): Hono {
  const api = new Hono();

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
  const { logger, port = DEFAULT_PORT, staticDir = DEFAULT_STATIC_DIR } = deps;

  const app = new Hono();

  // ---- Mount /api/* routes ----
  const apiRouter = createApiRouter();
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

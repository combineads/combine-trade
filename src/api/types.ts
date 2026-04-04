/**
 * API server types — dependency injection interfaces.
 *
 * Layer: L8 (api) — may import L0-L7.
 */

import type { Logger } from "@/core/logger";

// ---------------------------------------------------------------------------
// ApiServerDeps — everything the API server needs, injected from outside
// ---------------------------------------------------------------------------

/**
 * Dependency injection interface for the API server.
 * Passed to createApiServer() so the server can be tested without real
 * DB connections or exchange adapters.
 */
export type ApiServerDeps = {
  /** Logger instance (module = "api") */
  logger: Logger;

  /** Port to listen on (default: 3100) */
  port?: number;

  /** Directory to serve static files from (default: "./public") */
  staticDir?: string;

  /** JWT secret for auth guard middleware. When omitted, auth guard is not applied. */
  jwtSecret?: string;

  /** Query timeout in milliseconds (default: 5000) */
  queryTimeoutMs?: number;
};

// ---------------------------------------------------------------------------
// ApiServerHandle — returned by createApiServer()
// ---------------------------------------------------------------------------

/**
 * Handle returned by createApiServer(). Call start() to begin listening,
 * stop() to shut down gracefully.
 */
export type ApiServerHandle = {
  /** Start the HTTP server. Resolves once listening. */
  start(): Promise<void>;

  /** Stop the HTTP server. Resolves once shut down. */
  stop(): Promise<void>;
};

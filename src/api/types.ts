/**
 * API server types — dependency injection interfaces.
 *
 * Layer: L8 (api) — may import L0-L7.
 */

import type { ConfigDeps } from "@/api/routes/config";
import type { ControlDeps } from "@/api/routes/control";
import type { EventsDeps } from "@/api/routes/events";
import type { HealthDeps } from "@/api/routes/health";
import type { PositionsDeps } from "@/api/routes/positions";
import type { SignalsDeps } from "@/api/routes/signals";
import type { StatsDeps } from "@/api/routes/stats";
import type { SymbolStatesDeps } from "@/api/routes/symbol-states";
import type { TicketsDeps } from "@/api/routes/tickets";
import type { Logger } from "@/core/logger";

// ---------------------------------------------------------------------------
// RouteDeps — combined dependency interface for all route modules
// ---------------------------------------------------------------------------

/**
 * Combined dependency interface for all dashboard route modules.
 * Each route's deps are merged into a single flat interface.
 */
export type RouteDeps = HealthDeps &
  SymbolStatesDeps &
  PositionsDeps &
  TicketsDeps &
  StatsDeps &
  SignalsDeps &
  EventsDeps &
  ConfigDeps &
  ControlDeps;

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

  /** Route dependencies for dashboard endpoints. When omitted, routes are not mounted. */
  routeDeps?: RouteDeps;
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

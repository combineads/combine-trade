/**
 * API middleware — auth guard, CORS, error handler, query timeout.
 *
 * Responsibilities:
 * - JWT auth guard: verify token from cookie, skip public paths
 * - CORS: allow localhost:5173 in development
 * - Error handler: map all errors to JSON responses
 * - Query timeout: set timeout value on context for downstream handlers
 *
 * Layer: L8 (api) — may import L0-L7.
 */

import type { Context, ErrorHandler, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { verify } from "hono/jwt";
import { JwtTokenExpired } from "hono/utils/jwt/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Paths that skip JWT authentication (exact match). */
const PUBLIC_PATHS = new Set(["/api/login", "/api/logout", "/api/health"]);

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

/**
 * Creates a Hono middleware that reads JWT from the "token" cookie and verifies
 * it using hono/jwt verify(). Skips authentication for public paths.
 *
 * Error responses:
 * - Missing JWT → 401 { error: "Unauthorized" }
 * - Expired JWT → 401 { error: "Token expired" }
 * - Invalid JWT → 401 { error: "Invalid token" }
 */
export function createAuthGuard(secret: string): MiddlewareHandler {
  return async (c, next) => {
    // Skip auth for public paths
    if (PUBLIC_PATHS.has(c.req.path)) {
      await next();
      return;
    }

    const token = getCookie(c, "token");

    if (token === undefined) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const payload = await verify(token, secret, "HS256");
      c.set("jwtPayload", payload);
    } catch (err) {
      if (err instanceof JwtTokenExpired) {
        return c.json({ error: "Token expired" }, 401);
      }
      return c.json({ error: "Invalid token" }, 401);
    }

    await next();
  };
}

// ---------------------------------------------------------------------------
// CORS middleware
// ---------------------------------------------------------------------------

/**
 * Returns Hono CORS middleware configured for development.
 * Allows http://localhost:5173 (Vite dev server) as origin.
 */
export function corsMiddleware(): MiddlewareHandler {
  return cors({
    origin: "http://localhost:5173",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });
}

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

/**
 * Global error handler for the Hono app (app.onError).
 * Maps HTTPException to its status code and message;
 * all other errors become 500 Internal Server Error.
 */
export function errorHandler(): ErrorHandler {
  return (err: Error, c: Context) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }

    return c.json({ error: "Internal Server Error" }, 500);
  };
}

// ---------------------------------------------------------------------------
// Query timeout
// ---------------------------------------------------------------------------

/**
 * Middleware that sets a query timeout value on the context for downstream
 * handlers to use when executing database queries.
 *
 * Usage in route handler:
 * ```ts
 * const timeout = c.get("queryTimeout"); // number (ms)
 * ```
 */
export function queryTimeout(ms: number): MiddlewareHandler {
  return async (c, next) => {
    c.set("queryTimeout", ms);
    await next();
  };
}

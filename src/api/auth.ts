/**
 * Authentication module — Bun.password + hono/jwt + HttpOnly cookie.
 *
 * Responsibilities:
 * - Password verification via Bun.password.verify()
 * - JWT generation via hono/jwt sign()
 * - POST /api/login — verify password, set JWT cookie
 * - POST /api/logout — clear JWT cookie
 * - CSRF protection via Origin header validation on mutation requests
 *
 * Layer: L8 (api) — may import L0-L7.
 */

import { Hono } from "hono";
import { sign } from "hono/jwt";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Dependency injection interface for auth routes.
 * Allows testing without real env vars or DB.
 */
export type AuthDeps = {
  /** Returns the bcrypt/argon2 password hash to verify against */
  getPasswordHash(): Promise<string>;
  /** Returns the JWT signing secret */
  getJwtSecret(): string;
  /** Returns allowed origins for CSRF validation */
  getAllowedOrigins(): string[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** JWT expiration in seconds — 24 hours */
const JWT_MAX_AGE_SEC = 86400;

/** Cookie name for the JWT token */
const COOKIE_NAME = "token";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verifies a plaintext password against a hash using Bun.password.verify().
 */
export async function verifyPassword(input: string, hash: string): Promise<boolean> {
  return Bun.password.verify(input, hash);
}

/**
 * Generates a signed JWT with 24h expiration using hono/jwt sign().
 */
export async function generateToken(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      ...payload,
      iat: now,
      exp: now + JWT_MAX_AGE_SEC,
    },
    secret,
    "HS256",
  );
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Builds a Set-Cookie header value for setting the JWT cookie.
 */
function buildSetCookie(token: string): string {
  return [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${JWT_MAX_AGE_SEC}`,
  ].join("; ");
}

/**
 * Builds a Set-Cookie header value that clears the JWT cookie.
 */
function buildClearCookie(): string {
  return [`${COOKIE_NAME}=`, "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=0"].join("; ");
}

// ---------------------------------------------------------------------------
// CSRF middleware
// ---------------------------------------------------------------------------

const MUTATION_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates auth routes as a Hono sub-router.
 *
 * Routes:
 * - POST /login — body { password } → verify → JWT cookie → 200
 * - POST /logout — clear cookie → 200
 *
 * CSRF: mutation requests (POST/PUT/DELETE/PATCH) must include an Origin
 * header that matches the allowed origins list.
 */
export function createAuthRoutes(deps: AuthDeps): Hono {
  const router = new Hono();

  // ---- CSRF middleware for mutation requests ----
  router.use("*", async (c, next) => {
    if (!MUTATION_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    const origin = c.req.header("Origin");
    const allowed = deps.getAllowedOrigins();

    if (origin === undefined || !allowed.includes(origin)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  });

  // ---- POST /login ----
  router.post("/login", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Password required" }, 400);
    }

    const password =
      typeof body === "object" && body !== null && "password" in body
        ? (body as Record<string, unknown>).password
        : undefined;

    if (typeof password !== "string" || password.length === 0) {
      return c.json({ error: "Password required" }, 400);
    }

    const hash = await deps.getPasswordHash();
    const valid = await verifyPassword(password, hash);

    if (!valid) {
      return c.json({ error: "Invalid password" }, 401);
    }

    const secret = deps.getJwtSecret();
    const token = await generateToken({ sub: "admin" }, secret);

    c.header("Set-Cookie", buildSetCookie(token));
    return c.json({ ok: true });
  });

  // ---- POST /logout ----
  router.post("/logout", async (c) => {
    c.header("Set-Cookie", buildClearCookie());
    return c.json({ ok: true });
  });

  return router;
}

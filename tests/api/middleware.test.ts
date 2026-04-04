/**
 * Tests for API middleware — auth guard, CORS, error handler, query timeout.
 *
 * Covers:
 * - createAuthGuard(): valid JWT, expired JWT, missing JWT, invalid JWT, skip paths
 * - corsMiddleware(): CORS headers in dev mode
 * - errorHandler(): generic Error → 500, HTTPException → custom status
 * - queryTimeout(): sets queryTimeout on context for downstream handlers
 */

import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sign } from "hono/jwt";
import { createAuthGuard, corsMiddleware, errorHandler, queryTimeout } from "../../src/api/middleware";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TEST_SECRET = "test-jwt-secret-at-least-32-chars-long!";

/** Generate a valid JWT with 24h expiry. */
async function makeValidToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: "admin", iat: now, exp: now + 86400 }, TEST_SECRET, "HS256");
}

/** Generate an expired JWT (exp in the past). */
async function makeExpiredToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: "admin", iat: now - 200, exp: now - 100 }, TEST_SECRET, "HS256");
}

// ---------------------------------------------------------------------------
// Helper: build app with middleware stack
// ---------------------------------------------------------------------------

function buildApp(opts?: { skipAuth?: boolean }): Hono {
  const app = new Hono();

  // Apply middleware in order matching server.ts integration
  app.use("*", corsMiddleware());

  // Error handler
  app.onError(errorHandler());

  if (!opts?.skipAuth) {
    app.use("*", createAuthGuard(TEST_SECRET));
  }

  app.use("*", queryTimeout(5000));

  // Test routes
  app.get("/api/health", (c) => c.json({ status: "ok" }));
  app.post("/api/login", (c) => c.json({ ok: true }));
  app.post("/api/logout", (c) => c.json({ ok: true }));
  app.get("/api/protected", (c) => c.json({ data: "secret" }));
  app.get("/api/error-test", () => {
    throw new Error("Something went wrong");
  });
  app.get("/api/http-error-test", () => {
    throw new HTTPException(404, { message: "Resource not found" });
  });
  app.get("/api/timeout-check", (c) => {
    const timeout = (c as any).get("queryTimeout");
    return c.json({ queryTimeout: timeout });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tests: createAuthGuard
// ---------------------------------------------------------------------------

describe("createAuthGuard", () => {
  it("allows request with valid JWT cookie", async () => {
    const app = buildApp();
    const token = await makeValidToken();

    const res = await app.request("/api/protected", {
      headers: { Cookie: `token=${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: "secret" });
  });

  it("returns 401 when JWT cookie is missing", async () => {
    const app = buildApp();

    const res = await app.request("/api/protected");

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 with expired JWT", async () => {
    const app = buildApp();
    const token = await makeExpiredToken();

    const res = await app.request("/api/protected", {
      headers: { Cookie: `token=${token}` },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Token expired" });
  });

  it("returns 401 with invalid JWT (wrong secret)", async () => {
    const app = buildApp();
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { sub: "admin", iat: now, exp: now + 86400 },
      "completely-different-secret-key-here!!",
      "HS256",
    );

    const res = await app.request("/api/protected", {
      headers: { Cookie: `token=${token}` },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid token" });
  });

  it("skips auth for /api/login", async () => {
    const app = buildApp();

    const res = await app.request("/api/login", { method: "POST" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("skips auth for /api/logout", async () => {
    const app = buildApp();

    const res = await app.request("/api/logout", { method: "POST" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("skips auth for /api/health", async () => {
    const app = buildApp();

    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});

// ---------------------------------------------------------------------------
// Tests: errorHandler
// ---------------------------------------------------------------------------

describe("errorHandler", () => {
  it("maps generic Error to 500 JSON response", async () => {
    const app = buildApp({ skipAuth: true });

    const res = await app.request("/api/error-test");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error", "Internal Server Error");
  });

  it("maps HTTPException to its status code", async () => {
    const app = buildApp({ skipAuth: true });

    const res = await app.request("/api/http-error-test");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Resource not found" });
  });
});

// ---------------------------------------------------------------------------
// Tests: queryTimeout
// ---------------------------------------------------------------------------

describe("queryTimeout", () => {
  it("sets queryTimeout on context", async () => {
    const app = buildApp({ skipAuth: true });

    const res = await app.request("/api/timeout-check");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ queryTimeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: corsMiddleware
// ---------------------------------------------------------------------------

describe("corsMiddleware", () => {
  it("sets CORS headers for allowed origin", async () => {
    const app = buildApp({ skipAuth: true });

    const res = await app.request("/api/health", {
      headers: { Origin: "http://localhost:5173" },
    });

    expect(res.status).toBe(200);
    const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
    expect(allowOrigin).toBe("http://localhost:5173");
  });

  it("handles OPTIONS preflight request", async () => {
    const app = buildApp({ skipAuth: true });

    const res = await app.request("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
      },
    });

    // Preflight should return 204 or 200
    expect(res.status).toBeLessThanOrEqual(204);
    const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
    expect(allowOrigin).toBe("http://localhost:5173");
  });
});

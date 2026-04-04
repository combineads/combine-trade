/**
 * Tests for authentication — Bun.password + hono/jwt + HttpOnly cookie.
 *
 * Covers:
 * - verifyPassword() helper
 * - generateToken() helper
 * - POST /api/login (200, 400, 401)
 * - POST /api/logout (200 + cookie deletion)
 * - Cookie flags (HttpOnly, SameSite=Strict)
 * - CSRF: Origin header validation for mutation requests
 */

import { afterEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { verify as jwtVerify } from "hono/jwt";
import { createAuthRoutes, generateToken, verifyPassword } from "../../src/api/auth";
import type { AuthDeps } from "../../src/api/auth";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TEST_PASSWORD = "correct-password-123";
const TEST_SECRET = "test-jwt-secret-at-least-32-chars-long!";
let TEST_HASH: string;

// Pre-compute hash once before tests run (top-level await in Bun)
TEST_HASH = await Bun.password.hash(TEST_PASSWORD);

function createMockDeps(overrides?: Partial<AuthDeps>): AuthDeps {
  return {
    getPasswordHash: mock(async () => TEST_HASH),
    getJwtSecret: mock(() => TEST_SECRET),
    getAllowedOrigins: mock(() => ["http://localhost:3100"]),
    ...overrides,
  };
}

/**
 * Build a Hono app with auth routes mounted, suitable for app.request() testing.
 */
function buildApp(deps?: Partial<AuthDeps>): Hono {
  const app = new Hono();
  const authRouter = createAuthRoutes(createMockDeps(deps));
  app.route("/api", authRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests: verifyPassword
// ---------------------------------------------------------------------------

describe("verifyPassword", () => {
  it("returns true for correct password", async () => {
    const result = await verifyPassword(TEST_PASSWORD, TEST_HASH);
    expect(result).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const result = await verifyPassword("wrong-password", TEST_HASH);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: generateToken
// ---------------------------------------------------------------------------

describe("generateToken", () => {
  it("returns a valid JWT that can be decoded with the same secret", async () => {
    const token = await generateToken({ sub: "admin" }, TEST_SECRET);

    // Should be a string with 3 dot-separated parts
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    // Should be verifiable with hono/jwt verify
    const payload = await jwtVerify(token, TEST_SECRET, "HS256");
    expect(payload.sub).toBe("admin");
  });

  it("includes exp claim set to 24h from now", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await generateToken({ sub: "admin" }, TEST_SECRET);
    const after = Math.floor(Date.now() / 1000);

    const payload = await jwtVerify(token, TEST_SECRET, "HS256");
    const exp = payload.exp as number;

    // exp should be ~24h (86400s) from now
    expect(exp).toBeGreaterThanOrEqual(before + 86400);
    expect(exp).toBeLessThanOrEqual(after + 86400 + 1);
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/login
// ---------------------------------------------------------------------------

describe("POST /api/login", () => {
  it("returns 200 + Set-Cookie with valid password", async () => {
    const app = buildApp();

    const res = await app.request("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3100",
      },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("ok", true);

    // Check Set-Cookie header
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("token=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=86400");
  });

  it("returns 401 with wrong password", async () => {
    const app = buildApp();

    const res = await app.request("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3100",
      },
      body: JSON.stringify({ password: "wrong-password" }),
    });

    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body).toEqual({ error: "Invalid password" });
  });

  it("returns 400 with empty body", async () => {
    const app = buildApp();

    const res = await app.request("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3100",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toEqual({ error: "Password required" });
  });

  it("returns 400 when password is not a string", async () => {
    const app = buildApp();

    const res = await app.request("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3100",
      },
      body: JSON.stringify({ password: 12345 }),
    });

    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toEqual({ error: "Password required" });
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/logout
// ---------------------------------------------------------------------------

describe("POST /api/logout", () => {
  it("returns 200 and clears the cookie (Max-Age=0)", async () => {
    const app = buildApp();

    const res = await app.request("/api/logout", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3100",
      },
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("ok", true);

    // Cookie should be cleared
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("token=");
    expect(setCookie).toContain("Max-Age=0");
  });
});

// ---------------------------------------------------------------------------
// Tests: CSRF — Origin header validation
// ---------------------------------------------------------------------------

describe("CSRF origin validation", () => {
  it("rejects POST with no Origin header", async () => {
    const app = buildApp();

    const res = await app.request("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });

    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("rejects POST with disallowed Origin header", async () => {
    const app = buildApp();

    const res = await app.request("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.com",
      },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });

    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("allows POST with allowed Origin header", async () => {
    const app = buildApp();

    const res = await app.request("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3100",
      },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });

    // Should pass CSRF check (may be 200 or auth error, but not 403)
    expect(res.status).not.toBe(403);
  });

  it("does not apply CSRF check to GET requests", async () => {
    const app = buildApp();

    // GET to a non-existent route — should be 404, not 403
    const res = await app.request("/api/something", {
      method: "GET",
    });

    expect(res.status).not.toBe(403);
  });
});

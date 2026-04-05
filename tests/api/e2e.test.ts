/**
 * E2E integration tests — full API server with real HTTP requests.
 *
 * Strategy:
 * - Build a full Hono app with auth routes + API routes + auth guard middleware
 * - Serve via Bun.serve on ephemeral port 0
 * - Test complete auth flow: login → cookie → authenticated request → logout
 * - Test all read/control endpoints with auth
 * - Test error handling and static file serving
 */

import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { createAuthRoutes } from "../../src/api/auth";
import type { AuthDeps } from "../../src/api/auth";
import { corsMiddleware, createAuthGuard, errorHandler, queryTimeout } from "../../src/api/middleware";
import { createConfigRoutes } from "../../src/api/routes/config";
import { createControlRoutes } from "../../src/api/routes/control";
import { createEventsRoutes } from "../../src/api/routes/events";
import { createHealthRoutes } from "../../src/api/routes/health";
import { createPositionsRoutes } from "../../src/api/routes/positions";
import { createSignalsRoutes } from "../../src/api/routes/signals";
import { createStatsRoutes } from "../../src/api/routes/stats";
import { createSymbolStatesRoutes } from "../../src/api/routes/symbol-states";
import { createTicketRoutes } from "../../src/api/routes/tickets";
import { createTransferRoutes } from "../../src/api/routes/transfers";
import type { RouteDeps } from "../../src/api/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = "e2e-test-password-42";
const JWT_SECRET = "e2e-jwt-secret-must-be-at-least-32-chars!!";
const ALLOWED_ORIGIN = "http://localhost:3100";
const TEST_PUBLIC_DIR = join(import.meta.dir, ".test-e2e-public");
const INDEX_HTML = "<!DOCTYPE html><html><body>E2E Test</body></html>";

// ---------------------------------------------------------------------------
// Pre-compute password hash (top-level await — Bun supports this)
// ---------------------------------------------------------------------------

const TEST_HASH = await Bun.password.hash(TEST_PASSWORD);

// ---------------------------------------------------------------------------
// Mock RouteDeps — all query functions return sensible test data
// ---------------------------------------------------------------------------

function createMockRouteDeps(): RouteDeps {
  return {
    // HealthDeps
    checkDb: mock(async () => true),

    // SymbolStatesDeps
    getSymbolStates: mock(async () => [
      {
        id: "ss-1",
        symbol: "BTCUSDT",
        exchange: "binance",
        fsm_state: "IDLE",
        execution_mode: "analysis",
        daily_bias: "LONG",
        daily_open: "50000",
        session_box_high: "51000",
        session_box_low: "49000",
        losses_today: "0",
        losses_session: "0",
        losses_this_1h_5m: "0",
        losses_this_1h_1m: "0",
        updated_at: "2025-01-01T00:00:00Z",
      },
    ]),

    // PositionsDeps
    getActivePositions: mock(async () => []),

    // TicketsDeps
    getTickets: mock(async () => ({
      data: [],
      total: 0,
    })),

    // StatsDeps
    getStats: mock(async () => ({
      total_pnl: "0",
      total_trades: 0,
      win_count: 0,
      loss_count: 0,
      win_rate: null,
      avg_risk_reward: "0",
      mdd: "0",
      expectancy: "0",
      max_consecutive_losses: 0,
    })),

    // SignalsDeps
    getRecentSignals: mock(async () => []),

    // EventsDeps
    getRecentEvents: mock(async () => []),

    // ConfigDeps
    getConfig: mock(async () => ({
      execution_modes: { BTCUSDT_binance: "analysis" },
      trade_blocks: [],
    })),

    // ControlDeps
    updateMode: mock(async () => {}),
    killSwitch: mock(async () => ({
      positions_closed: 0,
      orders_cancelled: 0,
      errors: [],
    })),
    createTradeBlock: mock(async () => ({ id: "tb-1", created: true })),
    deleteTradeBlock: mock(async () => true),
    recordEvent: mock(async () => {}),

    // TransfersDeps
    getTransferHistory: mock(async () => []),
    triggerTransfer: mock(async () => ({
      success: true,
      transferable: {
        walletBalance: { toString: () => "1000" } as unknown as import("../../src/core/decimal").Decimal,
        openMargin: { toString: () => "0" } as unknown as import("../../src/core/decimal").Decimal,
        dailyProfit: { toString: () => "200" } as unknown as import("../../src/core/decimal").Decimal,
        reserve: { toString: () => "50" } as unknown as import("../../src/core/decimal").Decimal,
        transferAmount: { toString: () => "100" } as unknown as import("../../src/core/decimal").Decimal,
        skip: false,
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Mock AuthDeps
// ---------------------------------------------------------------------------

function createMockAuthDeps(): AuthDeps {
  return {
    getPasswordHash: mock(async () => TEST_HASH),
    getJwtSecret: mock(() => JWT_SECRET),
    getAllowedOrigins: mock(() => [ALLOWED_ORIGIN]),
  };
}

// ---------------------------------------------------------------------------
// Build full Hono app (mirrors production setup + auth routes)
// ---------------------------------------------------------------------------

function buildFullApp(routeDeps: RouteDeps, authDeps: AuthDeps, staticDir: string): Hono {
  const app = new Hono();

  // Middleware: CORS → errorHandler → authGuard → queryTimeout
  app.use("*", corsMiddleware());
  app.onError(errorHandler());
  app.use("*", createAuthGuard(JWT_SECRET));
  app.use("*", queryTimeout(5000));

  // Mount auth routes at /api (login, logout)
  const authRouter = createAuthRoutes(authDeps);
  app.route("/api", authRouter);

  // Mount API routes at /api
  const api = new Hono();
  api.route("/", createHealthRoutes(routeDeps));
  api.route("/", createSymbolStatesRoutes(routeDeps));
  api.route("/", createPositionsRoutes(routeDeps));
  api.route("/", createTicketRoutes(routeDeps));
  api.route("/", createStatsRoutes(routeDeps));
  api.route("/", createSignalsRoutes(routeDeps));
  api.route("/", createEventsRoutes(routeDeps));
  api.route("/", createConfigRoutes(routeDeps));
  api.route("/", createControlRoutes(routeDeps));
  api.route("/", createTransferRoutes(routeDeps));
  api.all("/*", (c) => c.json({ error: "Not Found" }, 404));
  app.route("/api", api);

  // Static file serving
  app.use("*", serveStatic({ root: staticDir }));
  app.get("*", serveStatic({ root: staticDir, path: "index.html" }));

  return app;
}

// ---------------------------------------------------------------------------
// Server state
// ---------------------------------------------------------------------------

let server: ReturnType<typeof Bun.serve> | null = null;
let baseUrl: string;
let routeDeps: RouteDeps;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Create temp public directory with index.html
  mkdirSync(TEST_PUBLIC_DIR, { recursive: true });
  writeFileSync(join(TEST_PUBLIC_DIR, "index.html"), INDEX_HTML);

  // Build deps
  routeDeps = createMockRouteDeps();
  const authDeps = createMockAuthDeps();

  // Build Hono app
  const app = buildFullApp(routeDeps, authDeps, TEST_PUBLIC_DIR);

  // Start Bun.serve on ephemeral port
  server = Bun.serve({
    port: 0,
    fetch: app.fetch,
  });

  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  // Stop server
  if (server !== null) {
    server.stop(true);
    server = null;
  }

  // Clean up temp directory
  try {
    rmSync(TEST_PUBLIC_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Login and return the auth cookie string for subsequent requests. */
async function login(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ALLOWED_ORIGIN,
    },
    body: JSON.stringify({ password: TEST_PASSWORD }),
  });

  if (res.status !== 200) {
    throw new Error(`Login failed with status ${res.status}`);
  }

  const setCookie = res.headers.get("set-cookie");
  if (setCookie === null) {
    throw new Error("No Set-Cookie header in login response");
  }

  // Extract "token=..." from the Set-Cookie header
  const match = setCookie.match(/token=([^;]+)/);
  if (match === null || match[1] === undefined) {
    throw new Error("Could not extract token from Set-Cookie");
  }

  return `token=${match[1]}`;
}

/** Make a GET request with auth cookie. */
async function authGet(path: string, cookie: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: { Cookie: cookie },
  });
}

/** Make a request with auth cookie and JSON body. */
async function authRequest(
  method: string,
  path: string,
  cookie: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {
    Cookie: cookie,
    Origin: ALLOWED_ORIGIN,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// ---------------------------------------------------------------------------
// Tests: Full auth flow
// ---------------------------------------------------------------------------

describe("E2E: Full auth flow", () => {
  it("POST /api/login with correct password → 200 + Set-Cookie", async () => {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("ok", true);

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("token=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
  });

  it("POST /api/login with wrong password → 401", async () => {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ password: "wrong-password" }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid password" });
  });

  it("POST /api/login with missing password → 400", async () => {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Password required" });
  });

  it("authenticated request with cookie → 200", async () => {
    const cookie = await login();

    const res = await authGet("/api/positions", cookie);
    expect(res.status).toBe(200);
  });

  it("unauthenticated request without cookie → 401", async () => {
    const res = await fetch(`${baseUrl}/api/positions`);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("POST /api/logout → clears cookie (Max-Age=0)", async () => {
    const cookie = await login();

    const res = await fetch(`${baseUrl}/api/logout`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: ALLOWED_ORIGIN,
      },
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("ok", true);

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("Max-Age=0");
  });
});

// ---------------------------------------------------------------------------
// Tests: Read endpoints (authenticated)
// ---------------------------------------------------------------------------

describe("E2E: Read endpoints with auth", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await login();
  });

  it("GET /api/health → 200 (no auth needed)", async () => {
    // Health should work without auth
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("db");
    expect(body).toHaveProperty("uptime_seconds");
  });

  it("GET /api/symbol-states → 200 with array", async () => {
    const res = await authGet("/api/symbol-states", cookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty("symbol", "BTCUSDT");
  });

  it("GET /api/positions → 200 with array", async () => {
    const res = await authGet("/api/positions", cookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/tickets → 200 with paginated response", async () => {
    const res = await authGet("/api/tickets", cookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("hasMore");
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("GET /api/stats → 200 with stats object", async () => {
    const res = await authGet("/api/stats", cookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("total_pnl");
    expect(body).toHaveProperty("total_trades");
    expect(body).toHaveProperty("win_count");
    expect(body).toHaveProperty("loss_count");
  });

  it("GET /api/signals/recent → 200 with array", async () => {
    const res = await authGet("/api/signals/recent", cookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/events/recent → 200 with array", async () => {
    const res = await authGet("/api/events/recent", cookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/config → 200 with config object", async () => {
    const res = await authGet("/api/config", cookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("execution_modes");
    expect(body).toHaveProperty("trade_blocks");
  });
});

// ---------------------------------------------------------------------------
// Tests: All protected read endpoints reject unauthenticated requests
// ---------------------------------------------------------------------------

describe("E2E: Unauthenticated → 401 for all protected routes", () => {
  const protectedRoutes = [
    "/api/symbol-states",
    "/api/positions",
    "/api/tickets",
    "/api/stats",
    "/api/signals/recent",
    "/api/events/recent",
    "/api/config",
  ];

  for (const route of protectedRoutes) {
    it(`GET ${route} without auth → 401`, async () => {
      const res = await fetch(`${baseUrl}${route}`);
      expect(res.status).toBe(401);
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: Control endpoints
// ---------------------------------------------------------------------------

describe("E2E: Control endpoints", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await login();
  });

  it("PUT /api/mode → 200, mode changed", async () => {
    const res = await authRequest("PUT", "/api/mode", cookie, { mode: "alert" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("mode", "alert");
  });

  it("PUT /api/mode with 'live' → 200 with warning", async () => {
    const res = await authRequest("PUT", "/api/mode", cookie, { mode: "live" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("mode", "live");
    expect(body).toHaveProperty("warning");
  });

  it("PUT /api/mode with invalid mode → 400", async () => {
    const res = await authRequest("PUT", "/api/mode", cookie, { mode: "invalid" });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("POST /api/kill-switch → 200", async () => {
    const res = await authRequest("POST", "/api/kill-switch", cookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("positions_closed");
    expect(body).toHaveProperty("orders_cancelled");
  });
});

// ---------------------------------------------------------------------------
// Tests: Error handling
// ---------------------------------------------------------------------------

describe("E2E: Error handling", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await login();
  });

  it("PUT /api/mode with invalid JSON body → 400", async () => {
    const res = await fetch(`${baseUrl}/api/mode`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        Origin: ALLOWED_ORIGIN,
        "Content-Type": "application/json",
      },
      body: "this is not json{{{",
    });

    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("GET /api/unknown → 404 JSON", async () => {
    const res = await authGet("/api/unknown", cookie);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body).toEqual({ error: "Not Found" });
  });
});

// ---------------------------------------------------------------------------
// Tests: Static file serving (auth guard applies to all paths)
// ---------------------------------------------------------------------------

describe("E2E: Static file serving", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await login();
  });

  it("GET / with auth → 200 HTML content", async () => {
    const res = await authGet("/", cookie);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain("E2E Test");
  });

  it("GET /nonexistent-route with auth → SPA fallback to index.html", async () => {
    const res = await authGet("/some/client/route", cookie);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain("E2E Test");
  });

  it("GET / without auth → 401 (auth guard protects static files too)", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(401);
  });
});

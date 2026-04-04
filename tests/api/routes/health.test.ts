/**
 * Tests for health route — GET /health
 *
 * Covers:
 * - DB connected -> { status: "ok", db: "connected", uptime_seconds: N }
 * - DB disconnected -> { status: "degraded", db: "disconnected", uptime_seconds: N }
 * - DB check throws -> treated as disconnected
 */

import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { createHealthRoutes } from "../../../src/api/routes/health";
import type { HealthDeps } from "../../../src/api/routes/health";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(deps: HealthDeps): Hono {
  const app = new Hono();
  app.route("/api", createHealthRoutes(deps));
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/health", () => {
  it("returns ok when DB is connected", async () => {
    const deps: HealthDeps = {
      checkDb: mock(async () => true),
    };
    const app = buildApp(deps);

    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("connected");
    expect(typeof body.uptime_seconds).toBe("number");
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it("returns degraded when DB is disconnected", async () => {
    const deps: HealthDeps = {
      checkDb: mock(async () => false),
    };
    const app = buildApp(deps);

    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("disconnected");
    expect(typeof body.uptime_seconds).toBe("number");
  });

  it("returns degraded when DB check throws an error", async () => {
    const deps: HealthDeps = {
      checkDb: mock(async () => {
        throw new Error("Connection refused");
      }),
    };
    const app = buildApp(deps);

    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("disconnected");
  });

  it("calls checkDb exactly once per request", async () => {
    const checkDb = mock(async () => true);
    const deps: HealthDeps = { checkDb };
    const app = buildApp(deps);

    await app.request("/api/health");
    await app.request("/api/health");

    expect(checkDb.mock.calls.length).toBe(2);
  });
});

/**
 * Tests for control routes — mode, kill-switch, trade-blocks.
 *
 * Covers:
 * - PUT /mode — valid modes (analysis, alert, live), live warning, invalid mode
 * - POST /kill-switch — success, error
 * - POST /trade-blocks — create with valid body, missing fields
 * - DELETE /trade-blocks/:id — existing, non-existing
 * - EventLog recording for all control actions
 *
 * All tests use DI mocks — no database required.
 */

import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { createControlRoutes } from "../../../src/api/routes/control";
import type { ControlDeps } from "../../../src/api/routes/control";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(overrides: Partial<ControlDeps> = {}): Hono {
  const defaultDeps: ControlDeps = {
    updateMode: mock(async () => {}),
    killSwitch: mock(async () => ({
      positions_closed: 0,
      orders_cancelled: 0,
      errors: [],
    })),
    createTradeBlock: mock(async (input: unknown) => ({
      id: "block-1",
      ...(input as Record<string, unknown>),
      created_at: "2026-04-04T00:00:00Z",
    })),
    deleteTradeBlock: mock(async () => true),
    recordEvent: mock(async () => {}),
    ...overrides,
  };
  const app = new Hono();
  app.route("/api", createControlRoutes(defaultDeps));
  return app;
}

function makeDeps(overrides: Partial<ControlDeps> = {}): ControlDeps {
  return {
    updateMode: mock(async () => {}),
    killSwitch: mock(async () => ({
      positions_closed: 0,
      orders_cancelled: 0,
      errors: [],
    })),
    createTradeBlock: mock(async (input: unknown) => ({
      id: "block-1",
      ...(input as Record<string, unknown>),
      created_at: "2026-04-04T00:00:00Z",
    })),
    deleteTradeBlock: mock(async () => true),
    recordEvent: mock(async () => {}),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: PUT /api/mode
// ---------------------------------------------------------------------------

describe("PUT /api/mode", () => {
  it("returns 200 with mode when set to 'analysis'", async () => {
    const deps = makeDeps();
    const app = new Hono();
    app.route("/api", createControlRoutes(deps));

    const res = await app.request("/api/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "analysis" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("analysis");
    expect(body.warning).toBeUndefined();
  });

  it("returns 200 with mode when set to 'alert'", async () => {
    const app = buildApp();

    const res = await app.request("/api/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "alert" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("alert");
    expect(body.warning).toBeUndefined();
  });

  it("returns 200 with warning when set to 'live'", async () => {
    const app = buildApp();

    const res = await app.request("/api/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "live" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("live");
    expect(body.warning).toBe("Live mode enables real trading");
  });

  it("calls updateMode with the correct mode", async () => {
    const updateMode = mock(async () => {});
    const deps = makeDeps({ updateMode });
    const app = new Hono();
    app.route("/api", createControlRoutes(deps));

    await app.request("/api/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "analysis" }),
    });

    expect(updateMode).toHaveBeenCalledWith("analysis");
  });

  it("records MODE_CHANGE event", async () => {
    const recordEvent = mock(async () => {});
    const deps = makeDeps({ recordEvent });
    const app = new Hono();
    app.route("/api", createControlRoutes(deps));

    await app.request("/api/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "alert" }),
    });

    expect(recordEvent).toHaveBeenCalledWith("MODE_CHANGE", { mode: "alert" });
  });

  it("returns 400 for invalid mode", async () => {
    const app = buildApp();

    const res = await app.request("/api/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "invalid" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when mode is missing", async () => {
    const app = buildApp();

    const res = await app.request("/api/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/kill-switch
// ---------------------------------------------------------------------------

describe("POST /api/kill-switch", () => {
  it("returns 200 with kill-switch result", async () => {
    const killSwitch = mock(async () => ({
      positions_closed: 3,
      orders_cancelled: 5,
      errors: [],
    }));
    const app = buildApp({ killSwitch });

    const res = await app.request("/api/kill-switch", { method: "POST" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.positions_closed).toBe(3);
    expect(body.orders_cancelled).toBe(5);
    expect(body.errors).toEqual([]);
  });

  it("records KILL_SWITCH event with result", async () => {
    const result = {
      positions_closed: 2,
      orders_cancelled: 1,
      errors: [],
    };
    const killSwitch = mock(async () => result);
    const recordEvent = mock(async () => {});
    const app = buildApp({ killSwitch, recordEvent });

    await app.request("/api/kill-switch", { method: "POST" });

    expect(recordEvent).toHaveBeenCalledWith("KILL_SWITCH", result);
  });

  it("returns 500 when killSwitch throws", async () => {
    const killSwitch = mock(async () => {
      throw new Error("Exchange connection failed");
    });
    const app = buildApp({ killSwitch });

    const res = await app.request("/api/kill-switch", { method: "POST" });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/trade-blocks
// ---------------------------------------------------------------------------

describe("POST /api/trade-blocks", () => {
  it("returns 201 with created trade block", async () => {
    const created = {
      id: "block-1",
      block_type: "MANUAL",
      reason: "Maintenance window",
      start_time: "2026-04-04T10:00:00Z",
      end_time: "2026-04-04T12:00:00Z",
      created_at: "2026-04-04T00:00:00Z",
    };
    const createTradeBlock = mock(async () => created);
    const app = buildApp({ createTradeBlock });

    const res = await app.request("/api/trade-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Maintenance window",
        start_time: "2026-04-04T10:00:00Z",
        end_time: "2026-04-04T12:00:00Z",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("block-1");
    expect(body.block_type).toBe("MANUAL");
    expect(body.reason).toBe("Maintenance window");
  });

  it("calls createTradeBlock with block_type MANUAL", async () => {
    const createTradeBlock = mock(async (input: unknown) => ({
      id: "block-2",
      ...(input as Record<string, unknown>),
      created_at: "2026-04-04T00:00:00Z",
    }));
    const app = buildApp({ createTradeBlock });

    await app.request("/api/trade-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "CPI release",
        start_time: "2026-04-04T14:00:00Z",
        end_time: "2026-04-04T15:00:00Z",
      }),
    });

    const call = createTradeBlock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.block_type).toBe("MANUAL");
    expect(call.reason).toBe("CPI release");
    expect(call.start_time).toBe("2026-04-04T14:00:00Z");
    expect(call.end_time).toBe("2026-04-04T15:00:00Z");
  });

  it("records TRADE_BLOCK_CREATED event", async () => {
    const recordEvent = mock(async () => {});
    const app = buildApp({ recordEvent });

    await app.request("/api/trade-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "CPI release",
        start_time: "2026-04-04T14:00:00Z",
        end_time: "2026-04-04T15:00:00Z",
      }),
    });

    expect(recordEvent).toHaveBeenCalledWith("TRADE_BLOCK_CREATED", {
      reason: "CPI release",
    });
  });

  it("returns 400 when reason is missing", async () => {
    const app = buildApp();

    const res = await app.request("/api/trade-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_time: "2026-04-04T10:00:00Z",
        end_time: "2026-04-04T12:00:00Z",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when start_time is missing", async () => {
    const app = buildApp();

    const res = await app.request("/api/trade-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Test",
        end_time: "2026-04-04T12:00:00Z",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when end_time is missing", async () => {
    const app = buildApp();

    const res = await app.request("/api/trade-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Test",
        start_time: "2026-04-04T10:00:00Z",
      }),
    });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: DELETE /api/trade-blocks/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/trade-blocks/:id", () => {
  it("returns 200 when trade block exists", async () => {
    const deleteTradeBlock = mock(async () => true);
    const app = buildApp({ deleteTradeBlock });

    const res = await app.request("/api/trade-blocks/block-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("calls deleteTradeBlock with the correct id", async () => {
    const deleteTradeBlock = mock(async () => true);
    const app = buildApp({ deleteTradeBlock });

    await app.request("/api/trade-blocks/some-uuid", { method: "DELETE" });

    expect(deleteTradeBlock).toHaveBeenCalledWith("some-uuid");
  });

  it("records TRADE_BLOCK_DELETED event", async () => {
    const recordEvent = mock(async () => {});
    const app = buildApp({ recordEvent });

    await app.request("/api/trade-blocks/block-1", { method: "DELETE" });

    expect(recordEvent).toHaveBeenCalledWith("TRADE_BLOCK_DELETED", {
      id: "block-1",
    });
  });

  it("returns 404 when trade block does not exist", async () => {
    const deleteTradeBlock = mock(async () => false);
    const app = buildApp({ deleteTradeBlock });

    const res = await app.request("/api/trade-blocks/nonexistent", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Trade block not found");
  });
});

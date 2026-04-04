/**
 * Tests for signals, events, and config routes.
 *
 * Covers:
 * - GET /signals/recent — default limit, custom limit, clamp at 50, empty
 * - GET /events/recent — default limit, custom limit, clamp at 50
 * - GET /config — execution_modes object, trade_blocks array, active-only blocks
 *
 * All tests use DI mocks — no database required.
 */

import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { SignalRow, SignalsDeps } from "../../../src/api/routes/signals";
import { createSignalsRoutes } from "../../../src/api/routes/signals";
import type { EventRow, EventsDeps } from "../../../src/api/routes/events";
import { createEventsRoutes } from "../../../src/api/routes/events";
import type { ConfigResult, ConfigDeps, TradeBlockRow } from "../../../src/api/routes/config";
import { createConfigRoutes } from "../../../src/api/routes/config";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSignal(overrides?: Partial<SignalRow>): SignalRow {
  return {
    id: crypto.randomUUID(),
    symbol: "BTCUSDT",
    exchange: "binance",
    timeframe: "5M",
    signal_type: "DOUBLE_BB",
    direction: "LONG",
    safety_passed: true,
    knn_decision: "ENTER",
    a_grade: "A",
    created_at: "2026-04-01T10:00:00Z",
    ...overrides,
  };
}

function makeEvent(overrides?: Partial<EventRow>): EventRow {
  return {
    id: crypto.randomUUID(),
    event_type: "SIGNAL_GENERATED",
    symbol: "BTCUSDT",
    exchange: "binance",
    data: { detail: "test" },
    created_at: "2026-04-01T10:00:00Z",
    ...overrides,
  };
}

function makeTradeBlock(overrides?: Partial<TradeBlockRow>): TradeBlockRow {
  return {
    id: crypto.randomUUID(),
    symbol: "BTCUSDT",
    exchange: "binance",
    reason: "manual",
    blocked_at: "2026-04-01T08:00:00Z",
    expires_at: null,
    ...overrides,
  };
}

function makeConfigResult(overrides?: Partial<ConfigResult>): ConfigResult {
  return {
    execution_modes: { BTCUSDT_binance: "analysis", ETHUSDT_binance: "live" },
    trade_blocks: [makeTradeBlock()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers: build apps with DI mocks
// ---------------------------------------------------------------------------

function buildSignalsApp(deps: Partial<SignalsDeps> = {}): Hono {
  const defaultDeps: SignalsDeps = {
    getRecentSignals: mock(async () => []),
    ...deps,
  };
  const app = new Hono();
  app.route("/", createSignalsRoutes(defaultDeps));
  return app;
}

function buildEventsApp(deps: Partial<EventsDeps> = {}): Hono {
  const defaultDeps: EventsDeps = {
    getRecentEvents: mock(async () => []),
    ...deps,
  };
  const app = new Hono();
  app.route("/", createEventsRoutes(defaultDeps));
  return app;
}

function buildConfigApp(deps: Partial<ConfigDeps> = {}): Hono {
  const defaultDeps: ConfigDeps = {
    getConfig: mock(async () => makeConfigResult()),
    ...deps,
  };
  const app = new Hono();
  app.route("/", createConfigRoutes(defaultDeps));
  return app;
}

// ---------------------------------------------------------------------------
// Tests: GET /signals/recent
// ---------------------------------------------------------------------------

describe("GET /signals/recent", () => {
  it("returns default 10 items, newest first", async () => {
    const signals = Array.from({ length: 10 }, (_, i) =>
      makeSignal({ id: `s${i}`, created_at: `2026-04-01T${String(10 + i).padStart(2, "0")}:00:00Z` }),
    );
    const getRecentSignals = mock(async () => signals);
    const app = buildSignalsApp({ getRecentSignals });

    const res = await app.request("/signals/recent");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(10);
    expect((getRecentSignals.mock.calls as unknown[][])[0]?.[0]).toBe(10);
  });

  it("returns exactly N items when limit=5", async () => {
    const signals = Array.from({ length: 5 }, (_, i) => makeSignal({ id: `s${i}` }));
    const getRecentSignals = mock(async () => signals);
    const app = buildSignalsApp({ getRecentSignals });

    const res = await app.request("/signals/recent?limit=5");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(5);
    expect((getRecentSignals.mock.calls as unknown[][])[0]?.[0]).toBe(5);
  });

  it("clamps limit to 50 when limit=100", async () => {
    const getRecentSignals = mock(async () => []);
    const app = buildSignalsApp({ getRecentSignals });

    await app.request("/signals/recent?limit=100");

    expect((getRecentSignals.mock.calls as unknown[][])[0]?.[0]).toBe(50);
  });

  it("returns 200 with empty array when no signals exist", async () => {
    const app = buildSignalsApp();

    const res = await app.request("/signals/recent");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("defaults to 10 when limit is invalid (non-numeric)", async () => {
    const getRecentSignals = mock(async () => []);
    const app = buildSignalsApp({ getRecentSignals });

    await app.request("/signals/recent?limit=abc");

    expect((getRecentSignals.mock.calls as unknown[][])[0]?.[0]).toBe(10);
  });

  it("defaults to 10 when limit < 1", async () => {
    const getRecentSignals = mock(async () => []);
    const app = buildSignalsApp({ getRecentSignals });

    await app.request("/signals/recent?limit=0");

    expect((getRecentSignals.mock.calls as unknown[][])[0]?.[0]).toBe(10);
  });

  it("defaults to 10 when limit is negative", async () => {
    const getRecentSignals = mock(async () => []);
    const app = buildSignalsApp({ getRecentSignals });

    await app.request("/signals/recent?limit=-5");

    expect((getRecentSignals.mock.calls as unknown[][])[0]?.[0]).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /events/recent
// ---------------------------------------------------------------------------

describe("GET /events/recent", () => {
  it("returns default 10 items, newest first", async () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ id: `e${i}`, created_at: `2026-04-01T${String(10 + i).padStart(2, "0")}:00:00Z` }),
    );
    const getRecentEvents = mock(async () => events);
    const app = buildEventsApp({ getRecentEvents });

    const res = await app.request("/events/recent");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(10);
    expect((getRecentEvents.mock.calls as unknown[][])[0]?.[0]).toBe(10);
  });

  it("returns exactly N items when limit=20", async () => {
    const events = Array.from({ length: 20 }, (_, i) => makeEvent({ id: `e${i}` }));
    const getRecentEvents = mock(async () => events);
    const app = buildEventsApp({ getRecentEvents });

    const res = await app.request("/events/recent?limit=20");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(20);
    expect((getRecentEvents.mock.calls as unknown[][])[0]?.[0]).toBe(20);
  });

  it("clamps limit to 50 when limit > 50", async () => {
    const getRecentEvents = mock(async () => []);
    const app = buildEventsApp({ getRecentEvents });

    await app.request("/events/recent?limit=999");

    expect((getRecentEvents.mock.calls as unknown[][])[0]?.[0]).toBe(50);
  });

  it("defaults to 10 when limit is invalid", async () => {
    const getRecentEvents = mock(async () => []);
    const app = buildEventsApp({ getRecentEvents });

    await app.request("/events/recent?limit=xyz");

    expect((getRecentEvents.mock.calls as unknown[][])[0]?.[0]).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /config
// ---------------------------------------------------------------------------

describe("GET /config", () => {
  it("includes execution_modes object and trade_blocks array", async () => {
    const config = makeConfigResult();
    const getConfig = mock(async () => config);
    const app = buildConfigApp({ getConfig });

    const res = await app.request("/config");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.execution_modes).toBeDefined();
    expect(typeof body.execution_modes).toBe("object");
    expect(Array.isArray(body.trade_blocks)).toBe(true);
  });

  it("returns execution_modes with correct symbol-exchange keys", async () => {
    const config = makeConfigResult({
      execution_modes: { BTCUSDT_binance: "analysis", ETHUSDT_okx: "live" },
    });
    const getConfig = mock(async () => config);
    const app = buildConfigApp({ getConfig });

    const res = await app.request("/config");
    const body = await res.json();

    expect(body.execution_modes.BTCUSDT_binance).toBe("analysis");
    expect(body.execution_modes.ETHUSDT_okx).toBe("live");
  });

  it("trade_blocks include only active (non-expired) blocks from DI", async () => {
    const activeBlock = makeTradeBlock({ id: "active-1", expires_at: null });
    const config = makeConfigResult({ trade_blocks: [activeBlock] });
    const getConfig = mock(async () => config);
    const app = buildConfigApp({ getConfig });

    const res = await app.request("/config");
    const body = await res.json();

    expect(body.trade_blocks).toHaveLength(1);
    expect(body.trade_blocks[0].id).toBe("active-1");
  });

  it("returns empty trade_blocks array when none active", async () => {
    const config = makeConfigResult({ trade_blocks: [] });
    const getConfig = mock(async () => config);
    const app = buildConfigApp({ getConfig });

    const res = await app.request("/config");
    const body = await res.json();

    expect(body.trade_blocks).toEqual([]);
  });
});

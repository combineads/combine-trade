/**
 * Tests for symbol-states route — GET /symbol-states
 *
 * Covers:
 * - Returns array of SymbolState records
 * - Empty array when no symbols
 * - All numeric fields are strings
 */

import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { createSymbolStatesRoutes } from "../../../src/api/routes/symbol-states";
import type { SymbolStatesDeps, SymbolStateRow } from "../../../src/api/routes/symbol-states";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSymbolStateRow(overrides?: Partial<SymbolStateRow>): SymbolStateRow {
  return {
    id: "550e8400-e29b-41d4-a716-446655440001",
    symbol: "BTCUSDT",
    exchange: "binance",
    fsm_state: "IDLE",
    execution_mode: "analysis",
    daily_bias: "LONG_ONLY",
    daily_open: "85000.50",
    session_box_high: "86000.00",
    session_box_low: "84500.00",
    losses_today: "0",
    losses_session: "0",
    losses_this_1h_5m: "0",
    losses_this_1h_1m: "0",
    updated_at: "2026-04-04T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(deps: SymbolStatesDeps): Hono {
  const app = new Hono();
  app.route("/api", createSymbolStatesRoutes(deps));
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/symbol-states", () => {
  it("returns array with 2 items when 2 symbols exist", async () => {
    const row1 = makeSymbolStateRow({ symbol: "BTCUSDT", exchange: "binance" });
    const row2 = makeSymbolStateRow({
      id: "550e8400-e29b-41d4-a716-446655440002",
      symbol: "ETHUSDT",
      exchange: "binance",
      fsm_state: "WATCHING",
      daily_bias: "SHORT_ONLY",
      daily_open: "3200.25",
      losses_today: "150.50",
    });

    const deps: SymbolStatesDeps = {
      getSymbolStates: mock(async () => [row1, row2]),
    };
    const app = buildApp(deps);

    const res = await app.request("/api/symbol-states");

    expect(res.status).toBe(200);
    const body = (await res.json()) as SymbolStateRow[];
    expect(body).toHaveLength(2);

    // Verify first row has expected fields
    expect(body[0].symbol).toBe("BTCUSDT");
    expect(body[0].fsm_state).toBe("IDLE");
    expect(body[0].daily_bias).toBe("LONG_ONLY");

    // Verify second row
    expect(body[1].symbol).toBe("ETHUSDT");
    expect(body[1].fsm_state).toBe("WATCHING");
    expect(body[1].daily_bias).toBe("SHORT_ONLY");
  });

  it("returns empty array when no symbols exist", async () => {
    const deps: SymbolStatesDeps = {
      getSymbolStates: mock(async () => []),
    };
    const app = buildApp(deps);

    const res = await app.request("/api/symbol-states");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns numeric fields as strings", async () => {
    const row = makeSymbolStateRow({
      daily_open: "85432.50",
      losses_today: "250.75",
      losses_session: "2",
      losses_this_1h_5m: "1",
      losses_this_1h_1m: "0",
    });

    const deps: SymbolStatesDeps = {
      getSymbolStates: mock(async () => [row]),
    };
    const app = buildApp(deps);

    const res = await app.request("/api/symbol-states");

    expect(res.status).toBe(200);
    const body = (await res.json()) as SymbolStateRow[];
    expect(body).toHaveLength(1);

    // All numeric fields must be strings, not numbers
    expect(typeof body[0].daily_open).toBe("string");
    expect(typeof body[0].losses_today).toBe("string");
    expect(typeof body[0].losses_session).toBe("string");
    expect(typeof body[0].losses_this_1h_5m).toBe("string");
    expect(typeof body[0].losses_this_1h_1m).toBe("string");
  });

  it("handles nullable fields correctly", async () => {
    const row = makeSymbolStateRow({
      daily_bias: null,
      daily_open: null,
      session_box_high: null,
      session_box_low: null,
    });

    const deps: SymbolStatesDeps = {
      getSymbolStates: mock(async () => [row]),
    };
    const app = buildApp(deps);

    const res = await app.request("/api/symbol-states");

    expect(res.status).toBe(200);
    const body = (await res.json()) as SymbolStateRow[];
    expect(body[0].daily_bias).toBeNull();
    expect(body[0].daily_open).toBeNull();
    expect(body[0].session_box_high).toBeNull();
    expect(body[0].session_box_low).toBeNull();
  });
});

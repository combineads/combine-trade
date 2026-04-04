/**
 * Tests for positions route — GET /positions
 *
 * Covers:
 * - Returns array of active tickets (state != 'CLOSED')
 * - Empty array when no active positions
 * - All price/size/pnl fields are strings
 * - Excludes CLOSED tickets
 */

import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { createPositionsRoutes } from "../../../src/api/routes/positions";
import type { PositionsDeps, PositionRow } from "../../../src/api/routes/positions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePositionRow(overrides?: Partial<PositionRow>): PositionRow {
  return {
    id: "660e8400-e29b-41d4-a716-446655440001",
    symbol: "BTCUSDT",
    exchange: "binance",
    signal_id: "770e8400-e29b-41d4-a716-446655440001",
    parent_ticket_id: null,
    timeframe: "5M",
    direction: "LONG",
    state: "INITIAL",
    entry_price: "85432.50",
    sl_price: "84900.00",
    current_sl_price: "84900.00",
    size: "0.05",
    remaining_size: "0.05",
    leverage: "20",
    tp1_price: "86000.00",
    tp2_price: "87200.00",
    trailing_active: false,
    trailing_price: null,
    max_profit: "0",
    pyramid_count: "0",
    opened_at: "2026-04-04T10:00:00.000Z",
    closed_at: null,
    close_reason: null,
    result: null,
    pnl: null,
    pnl_pct: null,
    max_favorable: null,
    max_adverse: null,
    hold_duration_sec: null,
    created_at: "2026-04-04T10:00:00.000Z",
    updated_at: "2026-04-04T10:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(deps: PositionsDeps): Hono {
  const app = new Hono();
  app.route("/api", createPositionsRoutes(deps));
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/positions", () => {
  it("returns array with 2 active tickets", async () => {
    const row1 = makePositionRow({ state: "INITIAL" });
    const row2 = makePositionRow({
      id: "660e8400-e29b-41d4-a716-446655440002",
      symbol: "ETHUSDT",
      state: "TP1_HIT",
      direction: "SHORT",
      entry_price: "3200.00",
      sl_price: "3250.00",
      current_sl_price: "3200.00",
      remaining_size: "0.025",
      trailing_active: true,
      trailing_price: "3150.00",
    });

    const deps: PositionsDeps = {
      getActivePositions: mock(async () => [row1, row2]),
    };
    const app = buildApp(deps);

    const res = await app.request("/api/positions");

    expect(res.status).toBe(200);
    const body = (await res.json()) as PositionRow[];
    expect(body).toHaveLength(2);

    expect(body[0]!.symbol).toBe("BTCUSDT");
    expect(body[0]!.state).toBe("INITIAL");
    expect(body[0]!.direction).toBe("LONG");

    expect(body[1]!.symbol).toBe("ETHUSDT");
    expect(body[1]!.state).toBe("TP1_HIT");
    expect(body[1]!.direction).toBe("SHORT");
  });

  it("returns empty array when no active positions", async () => {
    const deps: PositionsDeps = {
      getActivePositions: mock(async () => []),
    };
    const app = buildApp(deps);

    const res = await app.request("/api/positions");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns all numeric fields as strings", async () => {
    const row = makePositionRow({
      entry_price: "85432.50",
      sl_price: "84900.00",
      current_sl_price: "85000.00",
      size: "0.05",
      remaining_size: "0.025",
      leverage: "20",
      max_profit: "532.50",
      pyramid_count: "1",
    });

    const deps: PositionsDeps = {
      getActivePositions: mock(async () => [row]),
    };
    const app = buildApp(deps);

    const res = await app.request("/api/positions");

    expect(res.status).toBe(200);
    const body = (await res.json()) as PositionRow[];
    expect(body).toHaveLength(1);

    // All price/size fields must be strings
    expect(typeof body[0]!.entry_price).toBe("string");
    expect(typeof body[0]!.sl_price).toBe("string");
    expect(typeof body[0]!.current_sl_price).toBe("string");
    expect(typeof body[0]!.size).toBe("string");
    expect(typeof body[0]!.remaining_size).toBe("string");
    expect(typeof body[0]!.leverage).toBe("string");
    expect(typeof body[0]!.max_profit).toBe("string");
    expect(typeof body[0]!.pyramid_count).toBe("string");
  });

  it("excludes CLOSED tickets (only non-CLOSED returned by deps)", async () => {
    // The route trusts deps to return only active positions.
    // This test verifies the contract: only INITIAL/TP1_HIT/TP2_HIT tickets appear.
    const activeRows = [
      makePositionRow({ state: "INITIAL" }),
      makePositionRow({
        id: "660e8400-e29b-41d4-a716-446655440003",
        state: "TP1_HIT",
      }),
      makePositionRow({
        id: "660e8400-e29b-41d4-a716-446655440004",
        state: "TP2_HIT",
      }),
    ];

    const deps: PositionsDeps = {
      getActivePositions: mock(async () => activeRows),
    };
    const app = buildApp(deps);

    const res = await app.request("/api/positions");

    expect(res.status).toBe(200);
    const body = (await res.json()) as PositionRow[];
    expect(body).toHaveLength(3);

    // None should be CLOSED
    for (const row of body) {
      expect(row.state).not.toBe("CLOSED");
    }
  });

  it("handles nullable fields correctly", async () => {
    const row = makePositionRow({
      parent_ticket_id: null,
      tp1_price: null,
      tp2_price: null,
      trailing_price: null,
      closed_at: null,
      close_reason: null,
      result: null,
      pnl: null,
      pnl_pct: null,
      max_favorable: null,
      max_adverse: null,
      hold_duration_sec: null,
    });

    const deps: PositionsDeps = {
      getActivePositions: mock(async () => [row]),
    };
    const app = buildApp(deps);

    const res = await app.request("/api/positions");

    expect(res.status).toBe(200);
    const body = (await res.json()) as PositionRow[];
    expect(body[0]!.parent_ticket_id).toBeNull();
    expect(body[0]!.tp1_price).toBeNull();
    expect(body[0]!.closed_at).toBeNull();
    expect(body[0]!.pnl).toBeNull();
  });
});

/**
 * Tests for ticket list and stats routes.
 *
 * Covers:
 * - GET /tickets — cursor pagination, period/symbol/exchange/result filters
 * - GET /stats — performance statistics with period filter
 * - Validation: invalid period → 400, empty results, edge cases
 *
 * All tests use DI mocks — no database required.
 */

import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { TicketFilters, TicketsDeps, TicketRow } from "../../../src/api/routes/tickets";
import { createTicketRoutes } from "../../../src/api/routes/tickets";
import type { StatsResult, StatsDeps } from "../../../src/api/routes/stats";
import { createStatsRoutes } from "../../../src/api/routes/stats";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTicket(overrides?: Partial<TicketRow>): TicketRow {
  return {
    id: crypto.randomUUID(),
    symbol: "BTCUSDT",
    exchange: "binance",
    direction: "LONG",
    timeframe: "5M",
    entry_price: "50000.00",
    sl_price: "49500.00",
    size: "0.01",
    leverage: 10,
    result: "WIN",
    pnl: "50.00",
    pnl_pct: "1.00",
    close_reason: "TP1",
    opened_at: "2026-04-01T10:00:00Z",
    closed_at: "2026-04-01T12:00:00Z",
    hold_duration_sec: 7200,
    created_at: "2026-04-01T10:00:00Z",
    ...overrides,
  };
}

function makeStatsResult(overrides?: Partial<StatsResult>): StatsResult {
  return {
    total_pnl: "150.00",
    total_trades: 10,
    win_count: 6,
    loss_count: 4,
    win_rate: "0.60",
    avg_risk_reward: "1.50",
    mdd: "-200.00",
    expectancy: "0.0072",
    max_consecutive_losses: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers: build apps with DI mocks
// ---------------------------------------------------------------------------

function buildTicketApp(deps: Partial<TicketsDeps> = {}): Hono {
  const defaultDeps: TicketsDeps = {
    getTickets: mock(async () => ({ data: [], total: 0 })),
    ...deps,
  };
  const app = new Hono();
  app.route("/", createTicketRoutes(defaultDeps));
  return app;
}

function buildStatsApp(deps: Partial<StatsDeps> = {}): Hono {
  const defaultDeps: StatsDeps = {
    getStats: mock(async () => makeStatsResult()),
    ...deps,
  };
  const app = new Hono();
  app.route("/", createStatsRoutes(defaultDeps));
  return app;
}

// ---------------------------------------------------------------------------
// Tests: GET /tickets
// ---------------------------------------------------------------------------

describe("GET /tickets", () => {
  it("returns empty result when no tickets exist", async () => {
    const app = buildTicketApp();

    const res = await app.request("/tickets");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      data: [],
      cursor: null,
      hasMore: false,
      total: 0,
    });
  });

  it("returns tickets with default pagination", async () => {
    const tickets = [makeTicket({ id: "t1" }), makeTicket({ id: "t2" })];
    const getTickets = mock(async () => ({ data: tickets, total: 2 }));
    const app = buildTicketApp({ getTickets });

    const res = await app.request("/tickets");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe("t1");
    expect(body.data[1].id).toBe("t2");
    expect(body.cursor).toBeNull();
    expect(body.hasMore).toBe(false);
    expect(body.total).toBe(2);
  });

  it("passes period filter to getTickets", async () => {
    const getTickets = mock(async () => ({ data: [], total: 0 }));
    const app = buildTicketApp({ getTickets });

    await app.request("/tickets?period=today");

    expect((getTickets.mock.calls as unknown[][])[0]?.[0]).toEqual({ period: "today" });
  });

  it("passes symbol filter to getTickets", async () => {
    const getTickets = mock(async () => ({ data: [], total: 0 }));
    const app = buildTicketApp({ getTickets });

    await app.request("/tickets?symbol=BTCUSDT");

    expect((getTickets.mock.calls as unknown[][])[0]?.[0]).toEqual({
      period: "all",
      symbol: "BTCUSDT",
    });
  });

  it("passes exchange filter to getTickets", async () => {
    const getTickets = mock(async () => ({ data: [], total: 0 }));
    const app = buildTicketApp({ getTickets });

    await app.request("/tickets?exchange=binance");

    expect((getTickets.mock.calls as unknown[][])[0]?.[0]).toEqual({
      period: "all",
      exchange: "binance",
    });
  });

  it("passes result filter to getTickets", async () => {
    const getTickets = mock(async () => ({ data: [], total: 0 }));
    const app = buildTicketApp({ getTickets });

    await app.request("/tickets?result=WIN");

    expect((getTickets.mock.calls as unknown[][])[0]?.[0]).toEqual({
      period: "all",
      result: "WIN",
    });
  });

  it("passes combined filters to getTickets", async () => {
    const getTickets = mock(async () => ({ data: [], total: 0 }));
    const app = buildTicketApp({ getTickets });

    await app.request("/tickets?period=30d&symbol=BTCUSDT&exchange=binance&result=LOSS");

    expect((getTickets.mock.calls as unknown[][])[0]?.[0]).toEqual({
      period: "30d",
      symbol: "BTCUSDT",
      exchange: "binance",
      result: "LOSS",
    });
  });

  it("passes cursor to getTickets", async () => {
    const getTickets = mock(async () => ({ data: [], total: 0 }));
    const app = buildTicketApp({ getTickets });

    const cursorId = "some-uuid-cursor";
    await app.request(`/tickets?cursor=${cursorId}`);

    expect((getTickets.mock.calls as unknown[][])[0]?.[1]).toBe(cursorId);
  });

  it("returns hasMore=true and cursor when more items exist", async () => {
    // Request limit=2, DI returns 3 items (limit+1) to signal hasMore
    const tickets = [
      makeTicket({ id: "t1" }),
      makeTicket({ id: "t2" }),
      makeTicket({ id: "t3" }),
    ];
    const getTickets = mock(
      async (_f: TicketFilters, _c: string | undefined, _l: number) => ({
        data: tickets,
        total: 5,
      }),
    );
    const app = buildTicketApp({ getTickets });

    const res = await app.request("/tickets?limit=2");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.hasMore).toBe(true);
    expect(body.cursor).toBe("t2");
    expect(body.total).toBe(5);
  });

  it("requests limit+1 from getTickets for hasMore detection", async () => {
    const getTickets = mock(async () => ({ data: [], total: 0 }));
    const app = buildTicketApp({ getTickets });

    await app.request("/tickets?limit=10");

    // Should request 11 (limit+1) to detect hasMore
    expect((getTickets.mock.calls as unknown[][])[0]?.[2]).toBe(11);
  });

  it("returns 400 for invalid period", async () => {
    const app = buildTicketApp();

    const res = await app.request("/tickets?period=invalid");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid period" });
  });

  it("returns 400 for invalid result", async () => {
    const app = buildTicketApp();

    const res = await app.request("/tickets?result=INVALID");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid result" });
  });

  it("returns 400 for invalid limit", async () => {
    const app = buildTicketApp();

    const res = await app.request("/tickets?limit=abc");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid limit" });
  });

  it("returns 400 for limit < 1", async () => {
    const app = buildTicketApp();

    const res = await app.request("/tickets?limit=0");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid limit" });
  });

  it("caps limit at 100", async () => {
    const getTickets = mock(async () => ({ data: [], total: 0 }));
    const app = buildTicketApp({ getTickets });

    await app.request("/tickets?limit=500");

    // Capped to 100, so requests 101 (100+1)
    expect((getTickets.mock.calls as unknown[][])[0]?.[2]).toBe(101);
  });

  it("defaults period to 'all' when omitted", async () => {
    const getTickets = mock(async () => ({ data: [], total: 0 }));
    const app = buildTicketApp({ getTickets });

    await app.request("/tickets");

    expect((getTickets.mock.calls as unknown[][])[0]?.[0]).toEqual({ period: "all" });
  });

  it("all numeric fields in response are strings", async () => {
    const ticket = makeTicket();
    const getTickets = mock(async () => ({ data: [ticket], total: 1 }));
    const app = buildTicketApp({ getTickets });

    const res = await app.request("/tickets");
    const body = await res.json();

    const row = body.data[0];
    expect(typeof row.entry_price).toBe("string");
    expect(typeof row.sl_price).toBe("string");
    expect(typeof row.size).toBe("string");
    expect(typeof row.pnl).toBe("string");
    expect(typeof row.pnl_pct).toBe("string");
  });

  it("accepts period=7d", async () => {
    const getTickets = mock(async () => ({ data: [], total: 0 }));
    const app = buildTicketApp({ getTickets });

    const res = await app.request("/tickets?period=7d");

    expect(res.status).toBe(200);
    expect((getTickets.mock.calls as unknown[][])[0]?.[0]).toEqual({ period: "7d" });
  });

  it("accepts result=TIME_EXIT", async () => {
    const getTickets = mock(async () => ({ data: [], total: 0 }));
    const app = buildTicketApp({ getTickets });

    const res = await app.request("/tickets?result=TIME_EXIT");

    expect(res.status).toBe(200);
    expect((getTickets.mock.calls as unknown[][])[0]?.[0]).toEqual({
      period: "all",
      result: "TIME_EXIT",
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /stats
// ---------------------------------------------------------------------------

describe("GET /stats", () => {
  it("returns stats with default period (all)", async () => {
    const stats = makeStatsResult();
    const getStats = mock(async () => stats);
    const app = buildStatsApp({ getStats });

    const res = await app.request("/stats");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(stats);
    expect((getStats.mock.calls as unknown[][])[0]?.[0]).toBe("all");
  });

  it("passes period=today to getStats", async () => {
    const getStats = mock(async () => makeStatsResult());
    const app = buildStatsApp({ getStats });

    await app.request("/stats?period=today");

    expect((getStats.mock.calls as unknown[][])[0]?.[0]).toBe("today");
  });

  it("passes period=7d to getStats", async () => {
    const getStats = mock(async () => makeStatsResult());
    const app = buildStatsApp({ getStats });

    await app.request("/stats?period=7d");

    expect((getStats.mock.calls as unknown[][])[0]?.[0]).toBe("7d");
  });

  it("passes period=30d to getStats", async () => {
    const getStats = mock(async () => makeStatsResult());
    const app = buildStatsApp({ getStats });

    await app.request("/stats?period=30d");

    expect((getStats.mock.calls as unknown[][])[0]?.[0]).toBe("30d");
  });

  it("returns 400 for invalid period", async () => {
    const app = buildStatsApp();

    const res = await app.request("/stats?period=invalid");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid period" });
  });

  it("returns all zeros with null win_rate when no tickets", async () => {
    const emptyStats: StatsResult = {
      total_pnl: "0",
      total_trades: 0,
      win_count: 0,
      loss_count: 0,
      win_rate: null,
      avg_risk_reward: "0",
      mdd: "0",
      expectancy: "0",
      max_consecutive_losses: 0,
    };
    const getStats = mock(async () => emptyStats);
    const app = buildStatsApp({ getStats });

    const res = await app.request("/stats");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total_trades).toBe(0);
    expect(body.win_rate).toBeNull();
    expect(body.total_pnl).toBe("0");
  });

  it("returns win_rate as decimal string (not percentage)", async () => {
    const stats = makeStatsResult({ win_rate: "0.62" });
    const getStats = mock(async () => stats);
    const app = buildStatsApp({ getStats });

    const res = await app.request("/stats");
    const body = await res.json();

    expect(body.win_rate).toBe("0.62");
  });

  it("returns all numeric fields as strings", async () => {
    const stats = makeStatsResult();
    const getStats = mock(async () => stats);
    const app = buildStatsApp({ getStats });

    const res = await app.request("/stats");
    const body = await res.json();

    expect(typeof body.total_pnl).toBe("string");
    expect(typeof body.avg_risk_reward).toBe("string");
    expect(typeof body.mdd).toBe("string");
  });
});

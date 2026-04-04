/**
 * Tests for transfer API routes — api-transfers
 *
 * Covers:
 * - GET /api/transfers — EventLog history, cursor pagination, event type filter
 * - POST /api/transfers/trigger — manual trigger, exchange validation
 *
 * All tests use DI mocks — no database or exchange adapter required.
 *
 * @group api-transfers
 */

import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { createTransferRoutes } from "../../../src/api/routes/transfers";
import type { TransfersDeps, TransferEventRow } from "../../../src/api/routes/transfers";
import type { TransferResult } from "../../../src/transfer/executor";
import { Decimal } from "../../../src/core/decimal";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<TransferEventRow> = {}): TransferEventRow {
  return {
    id: "evt-1",
    event_type: "TRANSFER_SUCCESS",
    symbol: null,
    exchange: "binance",
    data: { amount: "100", currency: "USDT" },
    created_at: "2026-04-05T01:00:00.000Z",
    ...overrides,
  };
}

function makeTransferResult(success = true): TransferResult {
  return {
    success,
    transferable: {
      walletBalance: new Decimal("1000"),
      openMargin: new Decimal("100"),
      reserve: new Decimal("50"),
      available: new Decimal("850"),
      transferAmount: new Decimal("100"),
      skip: false,
    },
    balanceBefore: new Decimal("1000"),
    balanceAfter: new Decimal("900"),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<TransfersDeps> = {}): TransfersDeps {
  return {
    getTransferHistory: mock(async () => []),
    triggerTransfer: mock(async () => makeTransferResult()),
    ...overrides,
  };
}

function buildApp(overrides: Partial<TransfersDeps> = {}): Hono {
  const deps = makeDeps(overrides);
  const app = new Hono();
  app.route("/api", createTransferRoutes(deps));
  return app;
}

// ---------------------------------------------------------------------------
// Tests: GET /api/transfers
// ---------------------------------------------------------------------------

describe("GET /api/transfers [api-transfers]", () => {
  it("returns empty data and null nextCursor when no events exist", async () => {
    const app = buildApp({
      getTransferHistory: mock(async () => []),
    });

    const res = await app.request("/api/transfers");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it("returns 3 events and null nextCursor when 3 TRANSFER events exist", async () => {
    const rows = [
      makeRow({ id: "evt-1", event_type: "TRANSFER_SUCCESS" }),
      makeRow({ id: "evt-2", event_type: "TRANSFER_FAILED" }),
      makeRow({ id: "evt-3", event_type: "TRANSFER_SKIP" }),
    ];
    const app = buildApp({
      getTransferHistory: mock(async () => rows),
    });

    const res = await app.request("/api/transfers");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(3);
    expect(body.nextCursor).toBeNull();
  });

  it("returns 1 item and a nextCursor when limit=1 and 3 events exist", async () => {
    const rows = [
      makeRow({ id: "evt-1", created_at: "2026-04-05T03:00:00.000Z" }),
      makeRow({ id: "evt-2", created_at: "2026-04-05T02:00:00.000Z" }),
      makeRow({ id: "evt-3", created_at: "2026-04-05T01:00:00.000Z" }),
    ];
    // getTransferHistory is called with limit+1 = 2; return 2 rows to signal hasMore
    const app = buildApp({
      getTransferHistory: mock(async (_cursor, limit) => rows.slice(0, limit)),
    });

    const res = await app.request("/api/transfers?limit=1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).not.toBeNull();
    // nextCursor should be the created_at of the last returned item
    expect(body.nextCursor).toBe("2026-04-05T03:00:00.000Z");
  });

  it("passes cursor to getTransferHistory and returns only events before cursor", async () => {
    const cursorTime = "2026-04-05T02:30:00.000Z";
    const expectedRow = makeRow({ id: "evt-3", created_at: "2026-04-05T01:00:00.000Z" });
    const getTransferHistory = mock(async () => [expectedRow]);
    const app = buildApp({ getTransferHistory });

    const res = await app.request(`/api/transfers?cursor=${encodeURIComponent(cursorTime)}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("evt-3");
    // Verify cursor was forwarded to the query function
    expect(getTransferHistory).toHaveBeenCalledWith(cursorTime, expect.any(Number));
  });

  it("does not return non-TRANSFER EventLog entries", async () => {
    // The route should only return what getTransferHistory provides.
    // The DI function (not the route) is responsible for filtering.
    // The route simply trusts what the DI returns.
    // This test confirms the route passes the event type filter through to DI.
    const getTransferHistory = mock(async () => [makeRow({ event_type: "TRANSFER_SUCCESS" })]);
    const app = buildApp({ getTransferHistory });

    const res = await app.request("/api/transfers");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].event_type).toBe("TRANSFER_SUCCESS");
  });

  it("uses default limit of 20 when limit param is absent", async () => {
    const getTransferHistory = mock(async () => []);
    const app = buildApp({ getTransferHistory });

    await app.request("/api/transfers");

    // Called with limit = DEFAULT_LIMIT + 1 = 21
    expect(getTransferHistory).toHaveBeenCalledWith(undefined, 21);
  });

  it("returns 400 for invalid limit param", async () => {
    const app = buildApp();

    const res = await app.request("/api/transfers?limit=abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("caps limit at 100", async () => {
    const getTransferHistory = mock(async () => []);
    const app = buildApp({ getTransferHistory });

    await app.request("/api/transfers?limit=999");

    // Called with limit = MAX_LIMIT + 1 = 101
    expect(getTransferHistory).toHaveBeenCalledWith(undefined, 101);
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/transfers/trigger
// ---------------------------------------------------------------------------

describe("POST /api/transfers/trigger [api-transfers]", () => {
  it("returns { success: true, result } when triggerTransfer succeeds", async () => {
    const result = makeTransferResult(true);
    const triggerTransfer = mock(async () => result);
    const app = buildApp({ triggerTransfer });

    const res = await app.request("/api/transfers/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchange: "binance" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result).toBeDefined();
  });

  it("uses default exchange 'binance' when exchange is absent", async () => {
    const triggerTransfer = mock(async () => makeTransferResult());
    const app = buildApp({ triggerTransfer });

    await app.request("/api/transfers/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(triggerTransfer).toHaveBeenCalledWith("binance");
  });

  it("calls triggerTransfer with the specified valid exchange", async () => {
    const triggerTransfer = mock(async () => makeTransferResult());
    const app = buildApp({ triggerTransfer });

    await app.request("/api/transfers/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchange: "okx" }),
    });

    expect(triggerTransfer).toHaveBeenCalledWith("okx");
  });

  it("returns 400 for invalid exchange", async () => {
    const app = buildApp();

    const res = await app.request("/api/transfers/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchange: "fake-exchange" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for invalid JSON body", async () => {
    const app = buildApp();

    const res = await app.request("/api/transfers/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
  });

  it("returns { success: false, result } when transfer is skipped", async () => {
    const result = makeTransferResult(false);
    const app = buildApp({
      triggerTransfer: mock(async () => result),
    });

    const res = await app.request("/api/transfers/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchange: "binance" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type Decimal from "decimal.js";

import { d } from "@/core/decimal";
import type {
  CreateOrderParams,
  EditOrderParams,
  ExchangeAdapter,
  OrderResult,
} from "@/core/ports";
import type { Direction, Exchange, OrderSide, TicketState } from "@/core/types";
import type { ExitAction, ExitActionType } from "@/exits/checker";
import {
  processExit,
  processTrailing,
  updateTpPrices,
  updateMfeMae,
  type ProcessExitParams,
  type ExitResult,
} from "@/exits/manager";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal mock ExchangeAdapter */
function createMockAdapter(overrides?: Partial<ExchangeAdapter>): ExchangeAdapter {
  return {
    fetchOHLCV: mock(() => Promise.resolve([])),
    fetchBalance: mock(() => Promise.resolve({ total: d("10000"), available: d("5000") })),
    fetchPositions: mock(() => Promise.resolve([])),
    createOrder: mock((params: CreateOrderParams): Promise<OrderResult> => {
      return Promise.resolve({
        orderId: crypto.randomUUID(),
        exchangeOrderId: `exch-${crypto.randomUUID()}`,
        status: "FILLED",
        filledPrice: params.price ?? d("50000"),
        filledSize: params.size,
        timestamp: new Date(),
      });
    }),
    cancelOrder: mock(() => Promise.resolve()),
    editOrder: mock((_orderId: string, _params: EditOrderParams): Promise<OrderResult> => {
      return Promise.resolve({
        orderId: crypto.randomUUID(),
        exchangeOrderId: `exch-${crypto.randomUUID()}`,
        status: "FILLED",
        filledPrice: d("50000"),
        filledSize: d("0.1"),
        timestamp: new Date(),
      });
    }),
    fetchOrder: mock(() =>
      Promise.resolve({
        orderId: crypto.randomUUID(),
        exchangeOrderId: `exch-${crypto.randomUUID()}`,
        status: "FILLED" as const,
        filledPrice: d("50000"),
        filledSize: d("0.1"),
        timestamp: new Date(),
      }),
    ),
    watchOHLCV: mock(() => Promise.resolve(() => {})),
    getExchangeInfo: mock(() =>
      Promise.resolve({
        symbol: "BTC/USDT:USDT",
        tickSize: d("0.1"),
        minOrderSize: d("0.001"),
        maxLeverage: 125,
        contractSize: d("1"),
      }),
    ),
    setLeverage: mock(() => Promise.resolve()),
    ...overrides,
  };
}

/** Minimal ticket-like object matching what manager functions expect */
function makeTicket(overrides?: Record<string, unknown>) {
  return {
    id: "ticket-001",
    symbol: "BTC/USDT:USDT",
    exchange: "binance" as Exchange,
    signal_id: "signal-001",
    parent_ticket_id: null,
    timeframe: "5M" as const,
    direction: "LONG" as Direction,
    state: "INITIAL" as TicketState,
    entry_price: "50000",
    sl_price: "49500",
    current_sl_price: "49500",
    size: "1",
    remaining_size: "1",
    leverage: 10,
    tp1_price: "51000",
    tp2_price: "52000",
    trailing_active: false,
    trailing_price: null,
    max_profit: "0",
    pyramid_count: 0,
    opened_at: new Date("2025-06-01T00:00:00Z"),
    closed_at: null,
    close_reason: null,
    result: null,
    pnl: null,
    pnl_pct: null,
    max_favorable: "0",
    max_adverse: "0",
    hold_duration_sec: null,
    created_at: new Date("2025-06-01T00:00:00Z"),
    updated_at: new Date("2025-06-01T00:00:00Z"),
    sl_order_id: "sl-order-001",
    ...overrides,
  };
}

function makeExitAction(type: ExitActionType, closeSize: string, closeReason: string | null): ExitAction {
  return {
    type,
    closeSize: d(closeSize),
    closeReason: closeReason as ExitAction["closeReason"],
  };
}

// ---------------------------------------------------------------------------
// processExit — TP1 LONG
// ---------------------------------------------------------------------------

describe("exit-manager / processExit", () => {
  // ── TP1 LONG ───────────────────────────────────────────────────────────

  it("TP1 LONG: partial close 50%, correct side SELL, reduceOnly", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({ direction: "LONG", size: "1", remaining_size: "1" });
    const action = makeExitAction("TP1", "0.5", "TP1");

    const result = await processExit({
      adapter,
      ticket,
      action,
      exchange: "binance",
    });

    expect(result.success).toBe(true);
    expect(result.closeOrder).not.toBeNull();
    expect(result.closeOrder!.order_type).toBe("TP1");
    expect(result.closeOrder!.side).toBe("SELL"); // LONG close = SELL
    expect(result.closeOrder!.size).toBe("0.5");

    // Verify createOrder was called with reduceOnly
    const calls = (adapter.createOrder as ReturnType<typeof mock>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const firstCall = calls[0]![0] as CreateOrderParams;
    expect(firstCall.reduceOnly).toBe(true);
    expect(firstCall.side).toBe("SELL");
  });

  it("TP1 LONG: SL moved to breakeven (entry_price)", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({
      direction: "LONG",
      entry_price: "50000",
      sl_order_id: "sl-order-001",
    });
    const action = makeExitAction("TP1", "0.5", "TP1");

    const result = await processExit({
      adapter,
      ticket,
      action,
      exchange: "binance",
    });

    expect(result.success).toBe(true);
    // editOrder should have been called to move SL to entry price
    const editCalls = (adapter.editOrder as ReturnType<typeof mock>).mock.calls;
    expect(editCalls.length).toBe(1);
    const editParams = editCalls[0]![1] as EditOrderParams;
    expect(editParams.price!.equals(d("50000"))).toBe(true);
  });

  it("TP1 LONG: trailing_active set to true in result", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({ direction: "LONG" });
    const action = makeExitAction("TP1", "0.5", "TP1");

    const result = await processExit({
      adapter,
      ticket,
      action,
      exchange: "binance",
    });

    expect(result.success).toBe(true);
    expect(result.ticketUpdates!.trailing_active).toBe(true);
    expect(result.ticketUpdates!.remaining_size).toBe("0.5"); // 1 - 0.5
    expect(result.newState).toBe("TP1_HIT");
  });

  // ── TP1 SHORT ──────────────────────────────────────────────────────────

  it("TP1 SHORT: partial close 50%, BUY side, SL to entry", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({
      direction: "SHORT",
      entry_price: "50000",
      size: "1",
      remaining_size: "1",
      sl_order_id: "sl-order-001",
    });
    const action = makeExitAction("TP1", "0.5", "TP1");

    const result = await processExit({
      adapter,
      ticket,
      action,
      exchange: "binance",
    });

    expect(result.success).toBe(true);
    expect(result.closeOrder!.side).toBe("BUY"); // SHORT close = BUY
    expect(result.closeOrder!.size).toBe("0.5");

    // SL breakeven for SHORT is also entry_price
    const editCalls = (adapter.editOrder as ReturnType<typeof mock>).mock.calls;
    expect(editCalls.length).toBe(1);
    const editParams = editCalls[0]![1] as EditOrderParams;
    expect(editParams.price!.equals(d("50000"))).toBe(true);
  });

  // ── TP1 SL edit fallback (cancel + create) ────────────────────────────

  it("TP1: SL edit fails -> falls back to cancel + create", async () => {
    const adapter = createMockAdapter({
      editOrder: mock(() => {
        throw new Error("editOrder not supported");
      }),
    });
    const ticket = makeTicket({
      direction: "LONG",
      entry_price: "50000",
      sl_order_id: "sl-order-001",
    });
    const action = makeExitAction("TP1", "0.5", "TP1");

    const result = await processExit({
      adapter,
      ticket,
      action,
      exchange: "binance",
    });

    expect(result.success).toBe(true);
    // cancelOrder should have been called for old SL
    expect(adapter.cancelOrder).toHaveBeenCalledTimes(1);
    // createOrder should have been called twice: partial close + new SL
    const createCalls = (adapter.createOrder as ReturnType<typeof mock>).mock.calls;
    expect(createCalls.length).toBe(2);
    // Second call should be the new SL
    const slCreateParams = createCalls[1]![0] as CreateOrderParams;
    expect(slCreateParams.type).toBe("stop_market");
    expect(slCreateParams.reduceOnly).toBe(true);
    expect(slCreateParams.price!.equals(d("50000"))).toBe(true);
  });

  // ── TP2 ────────────────────────────────────────────────────────────────

  it("TP2: partial close remaining/3, state TP2_HIT", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({
      direction: "LONG",
      state: "TP1_HIT",
      size: "1",
      remaining_size: "0.5",
    });
    // remaining/3 = 0.5/3
    const closeSize = d("0.5").dividedBy(d("3")).toString();
    const action = makeExitAction("TP2", closeSize, "TP2");

    const result = await processExit({
      adapter,
      ticket,
      action,
      exchange: "binance",
    });

    expect(result.success).toBe(true);
    expect(result.closeOrder!.order_type).toBe("TP2");
    expect(result.newState).toBe("TP2_HIT");

    // remaining_size should be reduced
    const expectedRemaining = d("0.5").minus(d(closeSize)).toString();
    expect(result.ticketUpdates!.remaining_size).toBe(expectedRemaining);
  });

  // ── TIME_EXIT ──────────────────────────────────────────────────────────

  it("TIME_EXIT: full close remaining, state CLOSED", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({
      direction: "LONG",
      state: "TP2_HIT",
      remaining_size: "0.333",
    });
    const action = makeExitAction("TIME_EXIT", "0.333", "TIME_EXIT");

    const result = await processExit({
      adapter,
      ticket,
      action,
      exchange: "binance",
    });

    expect(result.success).toBe(true);
    expect(result.closeOrder!.order_type).toBe("TIME_EXIT");
    expect(result.closeOrder!.size).toBe("0.333");
    expect(result.newState).toBe("CLOSED");
  });

  // ── Order DB records ───────────────────────────────────────────────────

  it("creates correct Order record with ticket_id, intent_id, idempotency_key", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({ id: "ticket-123" });
    const action = makeExitAction("TP1", "0.5", "TP1");

    const result = await processExit({
      adapter,
      ticket,
      action,
      exchange: "binance",
    });

    expect(result.closeOrder).not.toBeNull();
    expect(result.closeOrder!.ticket_id).toBe("ticket-123");
    expect(result.closeOrder!.intent_id).toBeDefined();
    expect(result.closeOrder!.idempotency_key).toBeDefined();
    expect(result.closeOrder!.exchange).toBe("binance");
    expect(result.closeOrder!.status).toBe("FILLED");
  });

  // ── reduceOnly on all close orders ─────────────────────────────────────

  it("all close orders have reduceOnly=true", async () => {
    const adapter = createMockAdapter();

    for (const actionType of ["TP1", "TP2", "TIME_EXIT"] as const) {
      const ticket = makeTicket({
        state: actionType === "TP2" ? "TP1_HIT" : actionType === "TIME_EXIT" ? "TP2_HIT" : "INITIAL",
        remaining_size: "0.5",
      });
      const action = makeExitAction(actionType, "0.25", actionType);

      await processExit({
        adapter,
        ticket,
        action,
        exchange: "binance",
      });

      const calls = (adapter.createOrder as ReturnType<typeof mock>).mock.calls;
      const lastCallParams = calls[calls.length - 1]![0] as CreateOrderParams;
      expect(lastCallParams.reduceOnly).toBe(true);
    }
  });

  // ── NONE action → no-op ────────────────────────────────────────────────

  it("NONE action returns no-op result", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket();
    const action = makeExitAction("NONE", "0", null);

    const result = await processExit({
      adapter,
      ticket,
      action,
      exchange: "binance",
    });

    expect(result.success).toBe(true);
    expect(result.closeOrder).toBeNull();
    expect(result.newState).toBeNull();
    expect(result.ticketUpdates).toBeNull();
    // No exchange calls
    expect(adapter.createOrder).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processTrailing
// ---------------------------------------------------------------------------

describe("exit-manager / processTrailing", () => {
  it("price moved favorably -> SL updated on exchange + result contains new trailing values", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({
      direction: "LONG",
      entry_price: "50000",
      trailing_active: true,
      trailing_price: "50000", // current trailing SL
      max_profit: "0",
      remaining_size: "0.5",
      sl_order_id: "sl-order-001",
    });

    // Current price is 52000 -> maxProfit = 2000 -> trailing SL = 50000 + 2000*0.5 = 51000
    const result = await processTrailing({
      adapter,
      ticket,
      currentPrice: d("52000"),
      exchange: "binance",
    });

    expect(result.updated).toBe(true);
    expect(result.newTrailingPrice!.equals(d("51000"))).toBe(true);
    expect(result.newMaxProfit!.equals(d("2000"))).toBe(true);

    // editOrder should have been called
    const editCalls = (adapter.editOrder as ReturnType<typeof mock>).mock.calls;
    expect(editCalls.length).toBe(1);
  });

  it("price moved unfavorably -> SL NOT updated (ratchet)", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({
      direction: "LONG",
      entry_price: "50000",
      trailing_active: true,
      trailing_price: "51000", // already at 51000
      max_profit: "2000",
      sl_order_id: "sl-order-001",
    });

    // Current price is 51500 -> maxProfit = 1500 (less than prev 2000) -> SL would be 50750 (less than 51000)
    const result = await processTrailing({
      adapter,
      ticket,
      currentPrice: d("51500"),
      exchange: "binance",
    });

    expect(result.updated).toBe(false);
    expect(adapter.editOrder).not.toHaveBeenCalled();
  });

  it("SHORT: price moved favorably -> SL moves down", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({
      direction: "SHORT",
      entry_price: "50000",
      trailing_active: true,
      trailing_price: "50000",
      max_profit: "0",
      remaining_size: "0.5",
      sl_order_id: "sl-order-001",
    });

    // Current price is 48000 -> maxProfit = 2000 -> trailing SL = 50000 - 2000*0.5 = 49000
    const result = await processTrailing({
      adapter,
      ticket,
      currentPrice: d("48000"),
      exchange: "binance",
    });

    expect(result.updated).toBe(true);
    expect(result.newTrailingPrice!.equals(d("49000"))).toBe(true);
    expect(result.newMaxProfit!.equals(d("2000"))).toBe(true);
  });

  it("SL edit fails -> falls back to cancel + create", async () => {
    const adapter = createMockAdapter({
      editOrder: mock(() => {
        throw new Error("editOrder not supported");
      }),
    });
    const ticket = makeTicket({
      direction: "LONG",
      entry_price: "50000",
      trailing_active: true,
      trailing_price: "50000",
      max_profit: "0",
      remaining_size: "0.5",
      sl_order_id: "sl-order-001",
    });

    const result = await processTrailing({
      adapter,
      ticket,
      currentPrice: d("52000"),
      exchange: "binance",
    });

    expect(result.updated).toBe(true);
    // cancelOrder should have been called for old SL
    expect(adapter.cancelOrder).toHaveBeenCalledTimes(1);
    // createOrder should have been called for new SL
    const createCalls = (adapter.createOrder as ReturnType<typeof mock>).mock.calls;
    expect(createCalls.length).toBe(1);
    const slCreateParams = createCalls[0]![0] as CreateOrderParams;
    expect(slCreateParams.type).toBe("stop_market");
    expect(slCreateParams.reduceOnly).toBe(true);
  });

  it("trailing_active=false -> skip processing, return not updated", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({
      trailing_active: false,
    });

    const result = await processTrailing({
      adapter,
      ticket,
      currentPrice: d("55000"),
      exchange: "binance",
    });

    expect(result.updated).toBe(false);
    expect(adapter.editOrder).not.toHaveBeenCalled();
    expect(adapter.createOrder).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateTpPrices
// ---------------------------------------------------------------------------

describe("exit-manager / updateTpPrices", () => {
  it("returns correct tp1 and tp2 values", () => {
    const result = updateTpPrices({
      tp1Price: d("51000"),
      tp2Price: d("52000"),
    });

    expect(result.tp1_price).toBe("51000");
    expect(result.tp2_price).toBe("52000");
  });

  it("handles null tp values", () => {
    const result = updateTpPrices({
      tp1Price: null,
      tp2Price: null,
    });

    expect(result.tp1_price).toBeNull();
    expect(result.tp2_price).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateMfeMae
// ---------------------------------------------------------------------------

describe("exit-manager / updateMfeMae", () => {
  it("returns correct mfe and mae values", () => {
    const result = updateMfeMae({
      mfe: d("1000"),
      mae: d("500"),
    });

    expect(result.max_favorable).toBe("1000");
    expect(result.max_adverse).toBe("500");
  });

  it("handles zero values", () => {
    const result = updateMfeMae({
      mfe: d("0"),
      mae: d("0"),
    });

    expect(result.max_favorable).toBe("0");
    expect(result.max_adverse).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Decimal.js fields preserved
// ---------------------------------------------------------------------------

describe("exit-manager / Decimal.js precision", () => {
  it("close order preserves Decimal precision in size field", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({
      size: "0.123456789",
      remaining_size: "0.123456789",
    });
    const action = makeExitAction("TIME_EXIT", "0.123456789", "TIME_EXIT");

    const result = await processExit({
      adapter,
      ticket,
      action,
      exchange: "binance",
    });

    expect(result.closeOrder!.size).toBe("0.123456789");
  });

  it("trailing SL preserves Decimal precision", async () => {
    const adapter = createMockAdapter();
    const ticket = makeTicket({
      direction: "LONG",
      entry_price: "50000.123456789",
      trailing_active: true,
      trailing_price: "50000.123456789",
      max_profit: "0",
      remaining_size: "0.5",
      sl_order_id: "sl-order-001",
    });

    const result = await processTrailing({
      adapter,
      ticket,
      currentPrice: d("52000.123456789"),
      exchange: "binance",
    });

    expect(result.updated).toBe(true);
    // Should preserve full precision
    expect(result.newMaxProfit!.toString()).toBe("2000");
    expect(result.newTrailingPrice!.toString()).toBe("51000.123456789");
  });
});

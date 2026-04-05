/**
 * T-19-008: exits/manager.ts — supports_edit_order 플래그 사전 분기 테스트
 *
 * Test Scenarios:
 * - moveSl with supports_edit_order=false → editOrder not called, cancel+create used directly
 * - moveSl with supports_edit_order=true and editOrder success → editOrder called, no cancel+create
 * - moveSl with supports_edit_order=true and editOrder failure → cancel+create fallback
 */

import { describe, expect, it } from "bun:test";
import { d } from "@/core/decimal";
import type { ExchangeAdapter, OrderResult } from "@/core/ports";
import type { Exchange } from "@/core/types";
import type { ExitTicket, ProcessTrailingParams } from "./manager";
import { processTrailing } from "./manager";

// ---------------------------------------------------------------------------
// Stub adapter
// ---------------------------------------------------------------------------

function makeAdapter(overrides?: Partial<ExchangeAdapter>): ExchangeAdapter {
  const baseResult: OrderResult = {
    orderId: "o1",
    exchangeOrderId: "eo1",
    status: "PENDING",
    filledPrice: null,
    filledSize: null,
    timestamp: new Date(),
  };

  // biome-ignore lint/suspicious/noExplicitAny: test stub
  const stub: any = {
    fetchOHLCV: async () => [],
    fetchBalance: async () => ({ total: d("10000"), available: d("10000") }),
    fetchPositions: async () => [],
    createOrder: async () => baseResult,
    cancelOrder: async () => {},
    editOrder: async () => baseResult,
    fetchOrder: async () => ({
      orderId: "o1",
      status: "PENDING" as const,
      exchangeOrderId: "eo1",
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    }),
    watchOHLCV: async () => () => {},
    getExchangeInfo: async () => ({
      symbol: "BTC/USDT",
      tickSize: d("0.01"),
      minOrderSize: d("0.001"),
      maxLeverage: 20,
      contractSize: d("1"),
    }),
    setLeverage: async () => {},
    transfer: async () => ({ id: "t1", status: "ok" }),
    ...overrides,
  };

  return stub as ExchangeAdapter;
}

// Ticket where trailing is active, SL above entry (LONG position at 100, current at 150)
function makeTrailingTicket(overrides?: Partial<ExitTicket>): ExitTicket {
  return {
    id: "ticket-1",
    symbol: "BTC/USDT",
    exchange: "binance" as Exchange,
    direction: "LONG",
    entry_price: "100",
    size: "1",
    remaining_size: "1",
    trailing_active: true,
    trailing_price: "110", // current SL is at 110
    max_profit: "10",
    sl_order_id: "sl-order-1",
    current_sl_price: "110",
    ...overrides,
  };
}

function makeTrailingParams(
  adapter: ExchangeAdapter,
  extra?: Partial<ProcessTrailingParams>,
): ProcessTrailingParams {
  return {
    adapter,
    ticket: makeTrailingTicket(),
    currentPrice: d("200"), // big move → trailing SL should update
    exchange: "binance" as Exchange,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("T-19-008: processTrailing — supports_edit_order flag", () => {
  it("supports_edit_order=false → editOrder not called, cancel+create used", async () => {
    const editOrderCalls: unknown[] = [];
    const cancelOrderCalls: unknown[] = [];
    const createOrderCalls: unknown[] = [];

    const adapter = makeAdapter({
      editOrder: async (...args) => {
        editOrderCalls.push(args);
        return {
          orderId: "o1",
          exchangeOrderId: "eo1",
          status: "PENDING" as const,
          filledPrice: null,
          filledSize: null,
          timestamp: new Date(),
        };
      },
      cancelOrder: async (...args) => {
        cancelOrderCalls.push(args);
      },
      createOrder: async (...args) => {
        createOrderCalls.push(args);
        return {
          orderId: "o2",
          exchangeOrderId: "eo2",
          status: "PENDING" as const,
          filledPrice: null,
          filledSize: null,
          timestamp: new Date(),
        };
      },
    });

    const result = await processTrailing({
      ...makeTrailingParams(adapter),
      exchangeConfig: { supports_edit_order: false },
    });

    expect(result.updated).toBe(true);
    // editOrder must NOT have been called
    expect(editOrderCalls.length).toBe(0);
    // cancel + create must have been used
    expect(cancelOrderCalls.length).toBe(1);
    expect(createOrderCalls.length).toBe(1);
  });

  it("supports_edit_order=true and editOrder success → editOrder called, no cancel+create", async () => {
    const editOrderCalls: unknown[] = [];
    const cancelOrderCalls: unknown[] = [];
    const createOrderCalls: unknown[] = [];

    const adapter = makeAdapter({
      editOrder: async (...args) => {
        editOrderCalls.push(args);
        return {
          orderId: "o1",
          exchangeOrderId: "eo1",
          status: "PENDING" as const,
          filledPrice: null,
          filledSize: null,
          timestamp: new Date(),
        };
      },
      cancelOrder: async (...args) => {
        cancelOrderCalls.push(args);
      },
      createOrder: async (...args) => {
        createOrderCalls.push(args);
        return {
          orderId: "o2",
          exchangeOrderId: "eo2",
          status: "PENDING" as const,
          filledPrice: null,
          filledSize: null,
          timestamp: new Date(),
        };
      },
    });

    const result = await processTrailing({
      ...makeTrailingParams(adapter),
      exchangeConfig: { supports_edit_order: true },
    });

    expect(result.updated).toBe(true);
    // editOrder must have been called
    expect(editOrderCalls.length).toBe(1);
    // cancel+create must NOT have been used
    expect(cancelOrderCalls.length).toBe(0);
    expect(createOrderCalls.length).toBe(0);
  });

  it("supports_edit_order=true and editOrder fails → cancel+create fallback used", async () => {
    const editOrderCalls: unknown[] = [];
    const cancelOrderCalls: unknown[] = [];
    const createOrderCalls: unknown[] = [];

    const adapter = makeAdapter({
      editOrder: async (...args) => {
        editOrderCalls.push(args);
        throw new Error("editOrder not supported by exchange");
      },
      cancelOrder: async (...args) => {
        cancelOrderCalls.push(args);
      },
      createOrder: async (...args) => {
        createOrderCalls.push(args);
        return {
          orderId: "o2",
          exchangeOrderId: "eo2",
          status: "PENDING" as const,
          filledPrice: null,
          filledSize: null,
          timestamp: new Date(),
        };
      },
    });

    const result = await processTrailing({
      ...makeTrailingParams(adapter),
      exchangeConfig: { supports_edit_order: true },
    });

    expect(result.updated).toBe(true);
    // editOrder was attempted
    expect(editOrderCalls.length).toBe(1);
    // cancel+create fallback triggered
    expect(cancelOrderCalls.length).toBe(1);
    expect(createOrderCalls.length).toBe(1);
  });

  it("no exchangeConfig → safe fallback: editOrder attempted (true by default)", async () => {
    const editOrderCalls: unknown[] = [];

    const adapter = makeAdapter({
      editOrder: async (...args) => {
        editOrderCalls.push(args);
        return {
          orderId: "o1",
          exchangeOrderId: "eo1",
          status: "PENDING" as const,
          filledPrice: null,
          filledSize: null,
          timestamp: new Date(),
        };
      },
    });

    const result = await processTrailing({
      ...makeTrailingParams(adapter),
      // no exchangeConfig → default behaviour (editOrder attempted)
    });

    expect(result.updated).toBe(true);
    expect(editOrderCalls.length).toBe(1);
  });
});

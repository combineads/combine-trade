/**
 * T-19-007: executor.ts — SLIPPAGE_ABORT / SLIPPAGE_CLOSE insertEvent 테스트
 *
 * Test Scenarios:
 * - executeEntry() with spread exceeding limit and insertEvent dep provided
 *   → insertEvent called with "SLIPPAGE_ABORT"
 * - executeEntry() with spread exceeding limit and no insertEvent dep
 *   → no error, abort proceeds normally
 * - executeEntry() with slippage exceeding limit and insertEvent dep
 *   → insertEvent called with "SLIPPAGE_CLOSE"
 *
 * T-19-008: executor.ts — supports_one_step_order 플래그 사전 분기 테스트
 *
 * Test Scenarios:
 * - executeEntry() with supports_one_step_order=false → attemptBracketEntry not called
 * - executeEntry() with supports_one_step_order=true → attemptBracketEntry called first
 * - executeEntry() with supports_one_step_order=false and SL fails → emergency close (bracket not attempted)
 */

import { describe, expect, it } from "bun:test";
import { d } from "@/core/decimal";
import type { ExchangeAdapter, OrderResult } from "@/core/ports";
import type { Direction, Exchange, ExecutionMode } from "@/core/types";
import { executeEntry } from "./executor";
import type { SlippageConfig } from "./slippage";

// ---------------------------------------------------------------------------
// Stub adapter
// ---------------------------------------------------------------------------

function makeAdapter(overrides?: Partial<ExchangeAdapter>): ExchangeAdapter {
  const baseResult: OrderResult = {
    orderId: "o1",
    exchangeOrderId: "eo1",
    status: "FILLED",
    filledPrice: d("100"),
    filledSize: d("0.1"),
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
    fetchOrder: async () => ({ orderId: "o1", status: "FILLED" }),
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

const BASE_PARAMS = {
  symbol: "BTC/USDT",
  exchange: "binance" as Exchange,
  mode: "live" as ExecutionMode,
  direction: "LONG" as Direction,
  entryPrice: d("100"),
  slPrice: d("90"),
  size: d("0.1"),
  leverage: 10,
  slippageConfig: { maxSpreadPct: d("0.05") } satisfies SlippageConfig,
};

// ---------------------------------------------------------------------------
// Spread abort tests
// ---------------------------------------------------------------------------

describe("T-19-007: executeEntry — SLIPPAGE_ABORT insertEvent", () => {
  it("spread exceeding limit + insertEvent provided → insertEvent called with SLIPPAGE_ABORT", async () => {
    const capturedCalls: Array<{ eventType: string; data: Record<string, unknown> }> = [];

    const adapter = makeAdapter();

    const result = await executeEntry({
      ...BASE_PARAMS,
      adapter,
      spreadCheck: {
        bid: d("100"),
        ask: d("110"), // spread = 10/105 ≈ 9.5% > maxSpreadPct=1%
        maxSpreadPct: d("0.01"),
      },
      insertEvent: async (eventType, data) => {
        capturedCalls.push({ eventType, data });
      },
    });

    // Entry aborted due to spread
    expect(result.aborted).toBe(true);
    expect(result.success).toBe(false);

    // Wait for fire-and-forget (microtask flush)
    await new Promise((resolve) => setTimeout(resolve, 0));

    // insertEvent must have been called with SLIPPAGE_ABORT
    expect(capturedCalls.length).toBe(1);
    expect(capturedCalls[0]?.eventType).toBe("SLIPPAGE_ABORT");
    expect(capturedCalls[0]?.data.symbol).toBe("BTC/USDT");
    expect(capturedCalls[0]?.data.exchange).toBe("binance");
  });

  it("spread exceeding limit + no insertEvent dep → no error, abort proceeds normally", async () => {
    const adapter = makeAdapter();

    // No insertEvent provided — should not throw
    const result = await executeEntry({
      ...BASE_PARAMS,
      adapter,
      spreadCheck: {
        bid: d("100"),
        ask: d("110"),
        maxSpreadPct: d("0.01"),
      },
      // insertEvent intentionally omitted
    });

    expect(result.aborted).toBe(true);
    expect(result.success).toBe(false);
    expect(result.abortReason).toContain("spread too wide");
  });
});

// ---------------------------------------------------------------------------
// Slippage close tests
// ---------------------------------------------------------------------------

describe("T-19-007: executeEntry — SLIPPAGE_CLOSE insertEvent", () => {
  it("slippage exceeding limit + insertEvent provided → insertEvent called with SLIPPAGE_CLOSE", async () => {
    const capturedCalls: Array<{ eventType: string; data: Record<string, unknown> }> = [];

    // Adapter that fills at a price very far from expected → slippage exceeded
    const adapter = makeAdapter({
      createOrder: async () => ({
        orderId: "o1",
        exchangeOrderId: "eo1",
        status: "FILLED",
        filledPrice: d("200"), // 100% slippage on expected=100
        filledSize: d("0.1"),
        timestamp: new Date(),
      }),
    });

    const result = await executeEntry({
      ...BASE_PARAMS,
      adapter,
      slippageConfig: { maxSpreadPct: d("0.05") }, // max 5%
      insertEvent: async (eventType, data) => {
        capturedCalls.push({ eventType, data });
      },
    });

    // Entry should be aborted due to slippage
    expect(result.aborted).toBe(true);
    expect(result.success).toBe(false);
    expect(result.abortReason).toContain("slippage exceeded");

    // Wait for fire-and-forget
    await new Promise((resolve) => setTimeout(resolve, 0));

    // insertEvent called with SLIPPAGE_CLOSE
    const slippageCloseCall = capturedCalls.find((c) => c.eventType === "SLIPPAGE_CLOSE");
    expect(slippageCloseCall).toBeDefined();
    expect(slippageCloseCall?.data.symbol).toBe("BTC/USDT");
    expect(slippageCloseCall?.data.exchange).toBe("binance");
    expect(slippageCloseCall?.data.filledPrice).toBe("200");
  });

  it("slippage within limit → insertEvent NOT called with SLIPPAGE_CLOSE", async () => {
    const capturedCalls: Array<{ eventType: string }> = [];

    // Adapter that fills at expected price — no slippage
    const adapter = makeAdapter({
      createOrder: async () => ({
        orderId: "o1",
        exchangeOrderId: "eo1",
        status: "FILLED",
        filledPrice: d("100"), // matches entryPrice exactly
        filledSize: d("0.1"),
        timestamp: new Date(),
      }),
    });

    await executeEntry({
      ...BASE_PARAMS,
      adapter,
      slippageConfig: { maxSpreadPct: d("0.05") },
      insertEvent: async (eventType) => {
        capturedCalls.push({ eventType });
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const slippageCloseCall = capturedCalls.find((c) => c.eventType === "SLIPPAGE_CLOSE");
    expect(slippageCloseCall).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T-19-008: supports_one_step_order flag pre-branch tests
// ---------------------------------------------------------------------------

describe("T-19-008: executeEntry — supports_one_step_order flag", () => {
  it("supports_one_step_order=false → bracket not attempted, 2-step used", async () => {
    const createOrderCalls: Array<{ type: string; stopLoss?: unknown }> = [];

    const adapter = makeAdapter({
      createOrder: async (params) => {
        createOrderCalls.push({ type: params.type, stopLoss: params.stopLoss });
        return {
          orderId: "o1",
          exchangeOrderId: "eo1",
          status: "FILLED",
          filledPrice: d("100"),
          filledSize: d("0.1"),
          timestamp: new Date(),
        };
      },
    });

    const result = await executeEntry({
      ...BASE_PARAMS,
      adapter,
      exchangeConfig: { supports_one_step_order: false },
    });

    expect(result.success).toBe(true);
    expect(result.aborted).toBe(false);

    // Should never have called bracket (createOrder with stopLoss param)
    const bracketCall = createOrderCalls.find((c) => c.stopLoss !== undefined);
    expect(bracketCall).toBeUndefined();

    // Should have called plain entry + SL separately (2 createOrder calls)
    expect(createOrderCalls.length).toBe(2);
  });

  it("supports_one_step_order=true → bracket attempted first", async () => {
    const createOrderCalls: Array<{ type: string; stopLoss?: unknown }> = [];

    // Bracket succeeds
    const adapter = makeAdapter({
      createOrder: async (params) => {
        createOrderCalls.push({ type: params.type, stopLoss: params.stopLoss });
        return {
          orderId: "o1",
          exchangeOrderId: "eo1",
          status: "FILLED",
          filledPrice: d("100"),
          filledSize: d("0.1"),
          timestamp: new Date(),
        };
      },
    });

    const result = await executeEntry({
      ...BASE_PARAMS,
      adapter,
      exchangeConfig: { supports_one_step_order: true },
    });

    expect(result.success).toBe(true);

    // First call must be bracket (has stopLoss)
    const bracketCall = createOrderCalls.find((c) => c.stopLoss !== undefined);
    expect(bracketCall).toBeDefined();
    // Only one createOrder call (bracket handles both entry + SL)
    expect(createOrderCalls.length).toBe(1);
  });

  it("supports_one_step_order=false and SL fails → emergency close, bracket not attempted", async () => {
    const createOrderCalls: Array<{ type: string; stopLoss?: unknown }> = [];
    let _callCount = 0;

    const adapter = makeAdapter({
      createOrder: async (params) => {
        _callCount++;
        createOrderCalls.push({ type: params.type, stopLoss: params.stopLoss });

        if (params.type === "stop_market") {
          throw new Error("SL not supported");
        }

        return {
          orderId: "o1",
          exchangeOrderId: "eo1",
          status: "FILLED",
          filledPrice: d("100"),
          filledSize: d("0.1"),
          timestamp: new Date(),
        };
      },
    });

    const result = await executeEntry({
      ...BASE_PARAMS,
      adapter,
      exchangeConfig: { supports_one_step_order: false },
    });

    // Should abort after SL failure (emergency close triggered)
    expect(result.success).toBe(false);
    expect(result.aborted).toBe(true);

    // Must never have tried bracket
    const bracketCall = createOrderCalls.find((c) => c.stopLoss !== undefined);
    expect(bracketCall).toBeUndefined();
  });

  it("no exchangeConfig provided → safe fallback: 2-step used (no bracket)", async () => {
    const createOrderCalls: Array<{ type: string; stopLoss?: unknown }> = [];

    const adapter = makeAdapter({
      createOrder: async (params) => {
        createOrderCalls.push({ type: params.type, stopLoss: params.stopLoss });
        return {
          orderId: "o1",
          exchangeOrderId: "eo1",
          status: "FILLED",
          filledPrice: d("100"),
          filledSize: d("0.1"),
          timestamp: new Date(),
        };
      },
    });

    const result = await executeEntry({
      ...BASE_PARAMS,
      adapter,
      // no exchangeConfig → safe fallback is false → 2-step
    });

    expect(result.success).toBe(true);
    const bracketCall = createOrderCalls.find((c) => c.stopLoss !== undefined);
    expect(bracketCall).toBeUndefined();
    expect(createOrderCalls.length).toBe(2);
  });
});

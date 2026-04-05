import { describe, expect, it, mock } from "bun:test";

import { d } from "../../src/core/decimal";
import type { ExchangeAdapter, CreateOrderParams, OrderResult } from "../../src/core/ports";
import type { Direction, Exchange, ExecutionMode } from "../../src/core/types";
import {
  executeEntry,
  emergencyClose,
  recordOrder,
  ExecutionModeError,
  type ExecuteEntryParams,
  type SpreadCheckConfig,
} from "../../src/orders/executor";

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
    editOrder: mock(() =>
      Promise.resolve({
        orderId: crypto.randomUUID(),
        exchangeOrderId: `exch-${crypto.randomUUID()}`,
        status: "FILLED",
        filledPrice: d("50000"),
        filledSize: d("0.1"),
        timestamp: new Date(),
      }),
    ) as any,
    fetchOrder: mock(() =>
      Promise.resolve({
        orderId: crypto.randomUUID(),
        exchangeOrderId: `exch-${crypto.randomUUID()}`,
        status: "FILLED",
        filledPrice: d("50000"),
        filledSize: d("0.1"),
        timestamp: new Date(),
      }),
    ) as any,
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
    transfer: mock(() => Promise.resolve({ id: "mock-transfer-id", status: "ok" })),
    ...overrides,
  };
}

/** Standard entry parameters for tests */
function makeEntryParams(overrides?: Partial<ExecuteEntryParams>): ExecuteEntryParams {
  return {
    adapter: createMockAdapter(),
    symbol: "BTC/USDT:USDT",
    exchange: "binance" as Exchange,
    mode: "live" as ExecutionMode,
    direction: "LONG" as Direction,
    entryPrice: d("50000"),
    slPrice: d("49500"),
    size: d("0.1"),
    leverage: 10,
    slippageConfig: { maxSpreadPct: d("0.05") },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mode Guard Tests
// ---------------------------------------------------------------------------

describe("executor", () => {
  describe("mode guard", () => {
    it("throws ExecutionModeError in analysis mode", async () => {
      const params = makeEntryParams({ mode: "analysis" });
      await expect(executeEntry(params)).rejects.toThrow(ExecutionModeError);
    });

    it("throws ExecutionModeError with descriptive message in analysis mode", async () => {
      const params = makeEntryParams({ mode: "analysis" });
      await expect(executeEntry(params)).rejects.toThrow(/analysis/i);
    });

    it("does NOT throw in alert mode", async () => {
      const params = makeEntryParams({ mode: "alert" });
      const result = await executeEntry(params);
      expect(result.success).toBe(true);
    });

    it("does NOT throw in live mode", async () => {
      const params = makeEntryParams({ mode: "live" });
      const result = await executeEntry(params);
      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Leverage setting
  // ---------------------------------------------------------------------------

  describe("leverage setting", () => {
    it("calls adapter.setLeverage before creating orders", async () => {
      const adapter = createMockAdapter();
      const params = makeEntryParams({ adapter, leverage: 20 });
      await executeEntry(params);

      expect(adapter.setLeverage).toHaveBeenCalledTimes(1);
      expect(adapter.setLeverage).toHaveBeenCalledWith(20, "BTC/USDT:USDT");
    });
  });

  // ---------------------------------------------------------------------------
  // Bracket order (single-call SL)
  // ---------------------------------------------------------------------------

  describe("bracket order support", () => {
    it("passes stopLoss to createOrder for bracket order", async () => {
      const adapter = createMockAdapter({
        createOrder: mock((params: CreateOrderParams): Promise<OrderResult> => {
          return Promise.resolve({
            orderId: crypto.randomUUID(),
            exchangeOrderId: `exch-${crypto.randomUUID()}`,
            status: "FILLED",
            filledPrice: d("50000"),
            filledSize: params.size,
            timestamp: new Date(),
          });
        }),
      });

      // Explicitly enable bracket (one-step) ordering for this test
      const params = makeEntryParams({
        adapter,
        exchangeConfig: { supports_one_step_order: true },
      });
      const result = await executeEntry(params);

      expect(result.success).toBe(true);
      expect(result.entryOrder).not.toBeNull();

      // First call should be entry with stopLoss param
      const firstCall = (adapter.createOrder as ReturnType<typeof mock>).mock.calls[0];
      expect(firstCall).toBeDefined();
      const createParams = firstCall![0] as CreateOrderParams;
      expect(createParams.type).toBe("market");
      expect(createParams.stopLoss).toBeDefined();
    });

    it("creates entry + SL orders when bracket succeeds", async () => {
      const adapter = createMockAdapter();
      // Explicitly enable bracket (one-step) ordering for this test
      const params = makeEntryParams({
        adapter,
        exchangeConfig: { supports_one_step_order: true },
      });
      const result = await executeEntry(params);

      expect(result.success).toBe(true);
      expect(result.entryOrder).not.toBeNull();
      expect(result.slOrder).not.toBeNull();
      expect(result.aborted).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2-step SL fallback
  // ---------------------------------------------------------------------------

  describe("2-step SL fallback", () => {
    it("attempts SL separately when bracket order returns no SL (filledPrice on entry but no SL ID)", async () => {
      // Bracket fails by throwing (indicating no bracket support), fallback to 2-step
      let callCount = 0;
      const adapter = createMockAdapter({
        createOrder: mock((params: CreateOrderParams): Promise<OrderResult> => {
          callCount++;
          if (callCount === 1 && params.stopLoss) {
            // First call with bracket: reject bracket, caller should retry without
            throw new Error("Bracket orders not supported");
          }
          // Non-bracket calls succeed
          return Promise.resolve({
            orderId: crypto.randomUUID(),
            exchangeOrderId: `exch-${crypto.randomUUID()}`,
            status: "FILLED",
            filledPrice: d("50000"),
            filledSize: params.size,
            timestamp: new Date(),
          });
        }),
      });

      const params = makeEntryParams({ adapter });
      const result = await executeEntry(params);

      expect(result.success).toBe(true);
      // Should have made multiple calls: bracket attempt, entry without bracket, SL
      expect((adapter.createOrder as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("SL registration fails 1st, succeeds on 2nd retry", async () => {
      let entryDone = false;
      let slAttempts = 0;
      const adapter = createMockAdapter({
        createOrder: mock((params: CreateOrderParams): Promise<OrderResult> => {
          // Bracket call fails
          if (!entryDone && params.stopLoss) {
            throw new Error("Bracket not supported");
          }
          // Entry without bracket
          if (!entryDone && params.type === "market" && !params.stopLoss) {
            entryDone = true;
            return Promise.resolve({
              orderId: crypto.randomUUID(),
              exchangeOrderId: `exch-${crypto.randomUUID()}`,
              status: "FILLED",
              filledPrice: d("50000"),
              filledSize: params.size,
              timestamp: new Date(),
            });
          }
          // SL attempts
          if (params.type === "stop_market") {
            slAttempts++;
            if (slAttempts === 1) {
              throw new Error("SL registration failed");
            }
            return Promise.resolve({
              orderId: crypto.randomUUID(),
              exchangeOrderId: `exch-${crypto.randomUUID()}`,
              status: "FILLED",
              filledPrice: null,
              filledSize: params.size,
              timestamp: new Date(),
            });
          }
          // Emergency close
          return Promise.resolve({
            orderId: crypto.randomUUID(),
            exchangeOrderId: `exch-${crypto.randomUUID()}`,
            status: "FILLED",
            filledPrice: d("50000"),
            filledSize: params.size,
            timestamp: new Date(),
          });
        }),
      });

      const params = makeEntryParams({ adapter });
      const result = await executeEntry(params);

      expect(result.success).toBe(true);
      expect(result.slOrder).not.toBeNull();
      expect(slAttempts).toBe(2);
    });

    it("SL registration fails all 3 retries -> emergencyClose called", async () => {
      let entryDone = false;
      let emergencyCloseCalled = false;
      const adapter = createMockAdapter({
        createOrder: mock((params: CreateOrderParams): Promise<OrderResult> => {
          // Bracket fails
          if (!entryDone && params.stopLoss) {
            throw new Error("Bracket not supported");
          }
          // Entry without bracket
          if (!entryDone && params.type === "market" && !params.stopLoss) {
            entryDone = true;
            return Promise.resolve({
              orderId: crypto.randomUUID(),
              exchangeOrderId: `exch-${crypto.randomUUID()}`,
              status: "FILLED",
              filledPrice: d("50000"),
              filledSize: params.size,
              timestamp: new Date(),
            });
          }
          // SL always fails
          if (params.type === "stop_market") {
            throw new Error("SL registration failed");
          }
          // Emergency close (market with reduceOnly)
          if (params.reduceOnly) {
            emergencyCloseCalled = true;
            return Promise.resolve({
              orderId: crypto.randomUUID(),
              exchangeOrderId: `exch-${crypto.randomUUID()}`,
              status: "FILLED",
              filledPrice: d("50000"),
              filledSize: params.size,
              timestamp: new Date(),
            });
          }
          return Promise.resolve({
            orderId: crypto.randomUUID(),
            exchangeOrderId: `exch-${crypto.randomUUID()}`,
            status: "FILLED",
            filledPrice: d("50000"),
            filledSize: params.size,
            timestamp: new Date(),
          });
        }),
      });

      const params = makeEntryParams({ adapter });
      const result = await executeEntry(params);

      expect(result.success).toBe(false);
      expect(result.aborted).toBe(true);
      expect(result.abortReason).toContain("SL");
      expect(emergencyCloseCalled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Slippage check
  // ---------------------------------------------------------------------------

  describe("slippage check", () => {
    it("slippage within threshold -> continues normally", async () => {
      // Default mock fills at 50000 which matches entryPrice
      const params = makeEntryParams({
        entryPrice: d("50000"),
        slippageConfig: { maxSpreadPct: d("0.05") },
      });
      const result = await executeEntry(params);

      expect(result.success).toBe(true);
      expect(result.aborted).toBe(false);
    });

    it("slippage exceeds threshold -> ABORT + emergencyClose", async () => {
      let emergencyCloseCalled = false;
      const adapter = createMockAdapter({
        createOrder: mock((params: CreateOrderParams): Promise<OrderResult> => {
          // Entry fills at a price 10% higher than expected
          if (params.type === "market" && !params.reduceOnly) {
            return Promise.resolve({
              orderId: crypto.randomUUID(),
              exchangeOrderId: `exch-${crypto.randomUUID()}`,
              status: "FILLED",
              filledPrice: d("55000"), // 10% slippage
              filledSize: params.size,
              timestamp: new Date(),
            });
          }
          // Emergency close
          if (params.reduceOnly) {
            emergencyCloseCalled = true;
          }
          return Promise.resolve({
            orderId: crypto.randomUUID(),
            exchangeOrderId: `exch-${crypto.randomUUID()}`,
            status: "FILLED",
            filledPrice: d("55000"),
            filledSize: params.size,
            timestamp: new Date(),
          });
        }),
      });

      const params = makeEntryParams({
        adapter,
        entryPrice: d("50000"),
        slippageConfig: { maxSpreadPct: d("0.05") }, // 5% max
      });
      const result = await executeEntry(params);

      expect(result.success).toBe(false);
      expect(result.aborted).toBe(true);
      expect(result.abortReason).toContain("slippage");
      expect(emergencyCloseCalled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2-step SL timeout
  // ---------------------------------------------------------------------------

  describe("2-step SL timeout", () => {
    it("SL within 3s timeout succeeds", async () => {
      let entryDone = false;
      const adapter = createMockAdapter({
        createOrder: mock((params: CreateOrderParams): Promise<OrderResult> => {
          // Bracket fails
          if (!entryDone && params.stopLoss) {
            throw new Error("Bracket not supported");
          }
          // Entry without bracket
          if (!entryDone && params.type === "market") {
            entryDone = true;
            return Promise.resolve({
              orderId: crypto.randomUUID(),
              exchangeOrderId: `exch-${crypto.randomUUID()}`,
              status: "FILLED",
              filledPrice: d("50000"),
              filledSize: params.size,
              timestamp: new Date(),
            });
          }
          // SL succeeds quickly
          return Promise.resolve({
            orderId: crypto.randomUUID(),
            exchangeOrderId: `exch-${crypto.randomUUID()}`,
            status: "FILLED",
            filledPrice: null,
            filledSize: params.size,
            timestamp: new Date(),
          });
        }),
      });

      const params = makeEntryParams({ adapter });
      const result = await executeEntry(params);

      expect(result.success).toBe(true);
      expect(result.slOrder).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // emergencyClose (standalone)
  // ---------------------------------------------------------------------------

  describe("emergencyClose", () => {
    it("creates market close order with reduceOnly", async () => {
      const adapter = createMockAdapter();

      const result = await emergencyClose({
        adapter,
        symbol: "BTC/USDT:USDT",
        exchange: "binance",
        size: d("0.1"),
        direction: "LONG",
        intentId: crypto.randomUUID(),
      });

      expect(result).not.toBeNull();
      expect(result.order_type).toBe("PANIC_CLOSE");
      expect(result.status).toBe("FILLED");

      // Verify createOrder was called with reduceOnly
      const calls = (adapter.createOrder as ReturnType<typeof mock>).mock.calls;
      expect(calls.length).toBe(1);
      const orderParams = calls[0]![0] as CreateOrderParams;
      expect(orderParams.reduceOnly).toBe(true);
      expect(orderParams.type).toBe("market");
      // LONG position closes with SELL
      expect(orderParams.side).toBe("SELL");
    });

    it("SHORT position emergency close uses BUY side", async () => {
      const adapter = createMockAdapter();

      await emergencyClose({
        adapter,
        symbol: "BTC/USDT:USDT",
        exchange: "binance",
        size: d("0.1"),
        direction: "SHORT",
        intentId: crypto.randomUUID(),
      });

      const calls = (adapter.createOrder as ReturnType<typeof mock>).mock.calls;
      const orderParams = calls[0]![0] as CreateOrderParams;
      expect(orderParams.side).toBe("BUY");
    });
  });

  // ---------------------------------------------------------------------------
  // recordOrder
  // ---------------------------------------------------------------------------

  describe("recordOrder", () => {
    it("returns an order row with all required fields", () => {
      const row = recordOrder({
        exchange: "binance",
        orderType: "ENTRY",
        status: "FILLED",
        side: "BUY",
        size: d("0.1"),
        intentId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
      });

      expect(row.exchange).toBe("binance");
      expect(row.order_type).toBe("ENTRY");
      expect(row.status).toBe("FILLED");
      expect(row.side).toBe("BUY");
      expect(row.size).toBe("0.1");
      expect(row.intent_id).toBeDefined();
      expect(row.idempotency_key).toBeDefined();
    });

    it("records all price fields as strings (Decimal serialization)", () => {
      const row = recordOrder({
        exchange: "binance",
        orderType: "ENTRY",
        status: "FILLED",
        side: "BUY",
        size: d("0.1"),
        intentId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        price: d("50000"),
        expectedPrice: d("50000"),
        filledPrice: d("50010"),
        filledSize: d("0.1"),
        slippage: d("10"),
      });

      expect(row.price).toBe("50000");
      expect(row.expected_price).toBe("50000");
      expect(row.filled_price).toBe("50010");
      expect(row.filled_size).toBe("0.1");
      expect(row.slippage).toBe("10");
    });

    it("idempotency_key is unique per call", () => {
      const key1 = crypto.randomUUID();
      const key2 = crypto.randomUUID();

      const row1 = recordOrder({
        exchange: "binance",
        orderType: "ENTRY",
        status: "FILLED",
        side: "BUY",
        size: d("0.1"),
        intentId: "same-intent",
        idempotencyKey: key1,
      });

      const row2 = recordOrder({
        exchange: "binance",
        orderType: "SL",
        status: "FILLED",
        side: "SELL",
        size: d("0.1"),
        intentId: "same-intent",
        idempotencyKey: key2,
      });

      expect(row1.idempotency_key).not.toBe(row2.idempotency_key);
      expect(row1.intent_id).toBe(row2.intent_id);
    });
  });

  // ---------------------------------------------------------------------------
  // Intent ID grouping
  // ---------------------------------------------------------------------------

  describe("intent_id grouping", () => {
    it("entry and SL orders share the same intent_id", async () => {
      const params = makeEntryParams();
      const result = await executeEntry(params);

      expect(result.entryOrder).not.toBeNull();
      expect(result.slOrder).not.toBeNull();
      expect(result.entryOrder!.intent_id).toBe(result.slOrder!.intent_id);
    });
  });

  // ---------------------------------------------------------------------------
  // Order side correctness
  // ---------------------------------------------------------------------------

  describe("order side correctness", () => {
    it("LONG entry uses BUY side", async () => {
      const params = makeEntryParams({ direction: "LONG" });
      const result = await executeEntry(params);

      expect(result.entryOrder).not.toBeNull();
      expect(result.entryOrder!.side).toBe("BUY");
    });

    it("SHORT entry uses SELL side", async () => {
      const adapter = createMockAdapter();
      const params = makeEntryParams({ adapter, direction: "SHORT" });
      const result = await executeEntry(params);

      expect(result.entryOrder).not.toBeNull();
      expect(result.entryOrder!.side).toBe("SELL");
    });

    it("LONG SL uses SELL side", async () => {
      const params = makeEntryParams({ direction: "LONG" });
      const result = await executeEntry(params);

      expect(result.slOrder).not.toBeNull();
      expect(result.slOrder!.side).toBe("SELL");
    });

    it("SHORT SL uses BUY side", async () => {
      const params = makeEntryParams({ direction: "SHORT" });
      const result = await executeEntry(params);

      expect(result.slOrder).not.toBeNull();
      expect(result.slOrder!.side).toBe("BUY");
    });
  });

  // ---------------------------------------------------------------------------
  // Exchange field
  // ---------------------------------------------------------------------------

  describe("exchange field", () => {
    it("order exchange matches the provided exchange parameter", async () => {
      const params = makeEntryParams({ exchange: "binance" });
      const result = await executeEntry(params);

      expect(result.entryOrder).not.toBeNull();
      expect(result.entryOrder!.exchange).toBe("binance");
      if (result.slOrder) {
        expect(result.slOrder.exchange).toBe("binance");
      }
    });

    it("uses okx exchange when specified", async () => {
      const params = makeEntryParams({ exchange: "okx" });
      const result = await executeEntry(params);

      expect(result.entryOrder).not.toBeNull();
      expect(result.entryOrder!.exchange).toBe("okx");
    });
  });

  // ---------------------------------------------------------------------------
  // Pre-order spread check
  // ---------------------------------------------------------------------------

  describe("spread check (pre-order)", () => {
    it("no spreadCheck provided -> proceeds normally (spread check skipped)", async () => {
      const params = makeEntryParams(); // spreadCheck not set
      const result = await executeEntry(params);

      expect(result.success).toBe(true);
      expect(result.aborted).toBe(false);
    });

    it("spreadCheck within threshold -> proceeds to place order", async () => {
      const adapter = createMockAdapter();
      const spreadCheck: SpreadCheckConfig = {
        bid: d("49990"),
        ask: d("50010"),
        // spreadPct = 20/50000 = 0.0004 < 0.001
        maxSpreadPct: d("0.001"),
      };
      const params = makeEntryParams({ adapter, spreadCheck });
      const result = await executeEntry(params);

      expect(result.success).toBe(true);
      expect(result.aborted).toBe(false);
      // setLeverage must have been called (order was placed)
      expect(adapter.setLeverage).toHaveBeenCalledTimes(1);
    });

    it("spreadCheck above threshold -> aborts BEFORE placing any order", async () => {
      const adapter = createMockAdapter();
      const spreadCheck: SpreadCheckConfig = {
        bid: d("49000"),
        ask: d("51000"),
        // spreadPct = 2000/50000 = 0.04 (4%) > 0.001
        maxSpreadPct: d("0.001"),
      };
      const params = makeEntryParams({ adapter, spreadCheck });
      const result = await executeEntry(params);

      expect(result.success).toBe(false);
      expect(result.aborted).toBe(true);
      expect(result.abortReason).toContain("spread too wide");
      expect(result.entryOrder).toBeNull();
      expect(result.slOrder).toBeNull();
      // No exchange calls should have been made
      expect(adapter.setLeverage).not.toHaveBeenCalled();
      expect(adapter.createOrder).not.toHaveBeenCalled();
    });

    it("spreadCheck abort reason includes computed spreadPct and maxSpreadPct", async () => {
      const spreadCheck: SpreadCheckConfig = {
        bid: d("49000"),
        ask: d("51000"),
        maxSpreadPct: d("0.001"),
      };
      const params = makeEntryParams({ spreadCheck });
      const result = await executeEntry(params);

      expect(result.abortReason).toContain("0.001");
    });

    it("spreadCheck at exact threshold (boundary) proceeds normally", async () => {
      // bid=99.95, ask=100.05 => spreadPct=0.001 == maxSpreadPct (should pass)
      const spreadCheck: SpreadCheckConfig = {
        bid: d("99.95"),
        ask: d("100.05"),
        maxSpreadPct: d("0.001"),
      };
      const params = makeEntryParams({ spreadCheck });
      const result = await executeEntry(params);

      expect(result.success).toBe(true);
      expect(result.aborted).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // All price fields are Decimal-safe strings
  // ---------------------------------------------------------------------------

  describe("Decimal precision", () => {
    it("entry order records prices as string representations of Decimal", async () => {
      const adapter = createMockAdapter({
        createOrder: mock((params: CreateOrderParams): Promise<OrderResult> => {
          return Promise.resolve({
            orderId: crypto.randomUUID(),
            exchangeOrderId: `exch-${crypto.randomUUID()}`,
            status: "FILLED",
            filledPrice: d("50010.123456789"),
            filledSize: params.size,
            timestamp: new Date(),
          });
        }),
      });

      const params = makeEntryParams({
        adapter,
        entryPrice: d("50000.987654321"),
      });
      const result = await executeEntry(params);

      expect(result.entryOrder).not.toBeNull();
      // Prices should be string (Decimal serialized), not floating point
      expect(typeof result.entryOrder!.expected_price).toBe("string");
      expect(result.entryOrder!.expected_price).toBe("50000.987654321");
    });
  });
});

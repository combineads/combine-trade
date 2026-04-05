import { describe, expect, it, mock } from "bun:test";
import { Decimal } from "../../src/core/decimal";
import type { ExchangeAdapter } from "../../src/core/ports";
import { executeTransfer } from "../../src/transfer/executor";
import type { TransferExecutorDeps } from "../../src/transfer/executor";
import type { TransferableParams } from "../../src/transfer/balance";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeParams(overrides: Partial<TransferableParams> = {}): TransferableParams {
  return {
    walletBalance: new Decimal("1000"),
    openMargin: new Decimal("200"),
    dailyProfit: new Decimal("600"), // amount = 600 * 50% = 300; safety: 1000-300=700 >= 200+300=500 ✓
    riskPct: new Decimal("0.03"),
    reserveMultiplier: 10,
    transferPct: 50,
    minTransferUsdt: new Decimal("10"),
    ...overrides,
  };
}

function makeMockAdapter(overrides: Partial<ExchangeAdapter> = {}): ExchangeAdapter {
  return {
    transfer: mock(() => Promise.resolve({ id: "tx-1", status: "ok" })),
    fetchBalance: mock(() =>
      Promise.resolve({ total: new Decimal("1000"), available: new Decimal("800") }),
    ),
    fetchOHLCV: mock(() => Promise.resolve([])),
    fetchPositions: mock(() => Promise.resolve([])),
    createOrder: mock(() => Promise.reject(new Error("not implemented"))),
    cancelOrder: mock(() => Promise.resolve()),
    editOrder: mock(() => Promise.reject(new Error("not implemented"))),
    fetchOrder: mock(() => Promise.reject(new Error("not implemented"))),
    watchOHLCV: mock(() => Promise.resolve(() => {})),
    getExchangeInfo: mock(() => Promise.reject(new Error("not implemented"))),
    setLeverage: mock(() => Promise.resolve()),
    ...overrides,
  } as unknown as ExchangeAdapter;
}

function makeDeps(
  adapter: ExchangeAdapter,
  params: TransferableParams,
  logEvent?: TransferExecutorDeps["logEvent"],
): TransferExecutorDeps {
  return {
    adapter,
    getTransferParams: () => Promise.resolve(params),
    logEvent: logEvent ?? mock(() => Promise.resolve()),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("transfer-executor", () => {
  describe("executeTransfer() with sufficient balance", () => {
    it("calls adapter.transfer() once and logs TRANSFER_SUCCESS", async () => {
      // reserve = max(1000 * 0.03 * 10, 50) = 300
      // available = 1000 - 200 - 300 = 500
      // transferAmount = 500 * 50 / 100 = 250 (>= 10 min)
      const adapter = makeMockAdapter();
      const logEvent = mock(() => Promise.resolve());
      const deps = makeDeps(adapter, makeParams(), logEvent);

      const result = await executeTransfer(deps);

      expect(result.success).toBe(true);
      expect(result.transferable.skip).toBe(false);
      expect(
        (adapter.transfer as ReturnType<typeof mock>).mock.calls.length,
      ).toBe(1);

      const logCalls = logEvent.mock.calls;
      const successCall = logCalls.find((c: unknown[]) => c[0] === "TRANSFER_SUCCESS");
      expect(successCall).toBeDefined();
    });
  });

  describe("executeTransfer() with skip (dailyProfit <= 0)", () => {
    it("does NOT call adapter.transfer() and logs TRANSFER_SKIP", async () => {
      // dailyProfit=0 → no_daily_profit → skip
      const adapter = makeMockAdapter();
      const logEvent = mock(() => Promise.resolve());
      const params = makeParams({
        dailyProfit: new Decimal("0"),
      });
      const deps = makeDeps(adapter, params, logEvent);

      const result = await executeTransfer(deps);

      expect(result.success).toBe(false);
      expect(result.transferable.skip).toBe(true);
      expect(
        (adapter.transfer as ReturnType<typeof mock>).mock.calls.length,
      ).toBe(0);

      const logCalls = logEvent.mock.calls;
      const skipCall = logCalls.find((c: unknown[]) => c[0] === "TRANSFER_SKIP");
      expect(skipCall).toBeDefined();
    });
  });

  describe("executeTransfer() retry on transient failure", () => {
    it("retries once and logs TRANSFER_SUCCESS on second attempt", async () => {
      let callCount = 0;
      const transferFn = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("transient network error"));
        }
        return Promise.resolve({ id: "tx-retry", status: "ok" });
      });

      const adapter = makeMockAdapter({ transfer: transferFn });
      const logEvent = mock(() => Promise.resolve());
      const deps = makeDeps(adapter, makeParams(), logEvent);

      const result = await executeTransfer(deps);

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);

      const logCalls = logEvent.mock.calls;
      const successCall = logCalls.find((c: unknown[]) => c[0] === "TRANSFER_SUCCESS");
      expect(successCall).toBeDefined();
      const failedCall = logCalls.find((c: unknown[]) => c[0] === "TRANSFER_FAILED");
      expect(failedCall).toBeUndefined();
    });
  });

  describe("executeTransfer() all 3 retries fail", () => {
    it("logs TRANSFER_FAILED with error_message after exhausting retries", async () => {
      const transferFn = mock(() => Promise.reject(new Error("exchange down")));

      const adapter = makeMockAdapter({ transfer: transferFn });
      const logEvent = mock(() => Promise.resolve());
      const deps = makeDeps(adapter, makeParams(), logEvent);

      const result = await executeTransfer(deps);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");

      const logCalls = logEvent.mock.calls;
      const failedCall = logCalls.find((c: unknown[]) => c[0] === "TRANSFER_FAILED");
      expect(failedCall).toBeDefined();

      const eventData = (failedCall as unknown as [string, Record<string, unknown>])?.[1];
      expect(typeof eventData.error_message).toBe("string");
    });

    it("calls adapter.transfer() exactly 3 times", async () => {
      const transferFn = mock(() => Promise.reject(new Error("exchange down")));
      const adapter = makeMockAdapter({ transfer: transferFn });
      const deps = makeDeps(adapter, makeParams());

      await executeTransfer(deps);

      expect(transferFn.mock.calls.length).toBe(3);
    });
  });

  describe("TRANSFER_SUCCESS event data", () => {
    it("contains exchange, currency, amount, from, to, balance_before, balance_after, reserve, daily_profit", async () => {
      const logEvent = mock(() => Promise.resolve());
      const deps = makeDeps(makeMockAdapter(), makeParams(), logEvent);

      await executeTransfer(deps, "binance");

      const logCalls = logEvent.mock.calls;
      const successCall = logCalls.find((c: unknown[]) => c[0] === "TRANSFER_SUCCESS");
      const data = (successCall as unknown as [string, Record<string, unknown>])?.[1];

      expect(data).toBeDefined();
      expect(typeof data.exchange).toBe("string");
      expect(data.currency).toBe("USDT");
      expect(data.from).toBe("future");
      expect(data.to).toBe("spot");
      expect(data.balance_before).toBeInstanceOf(Decimal);
      expect(data.balance_after).toBeInstanceOf(Decimal);
      expect(data.reserve).toBeInstanceOf(Decimal);
      expect(data.amount).toBeInstanceOf(Decimal);
      expect(data.daily_profit).toBeInstanceOf(Decimal);
    });
  });

  describe("return value", () => {
    it("includes transferAmount as Decimal (not number)", async () => {
      const deps = makeDeps(makeMockAdapter(), makeParams());

      const result = await executeTransfer(deps);

      expect(result.transferable.transferAmount).toBeInstanceOf(Decimal);
    });

    it("balanceBefore and balanceAfter are Decimal instances on success", async () => {
      const deps = makeDeps(makeMockAdapter(), makeParams());

      const result = await executeTransfer(deps);

      expect(result.success).toBe(true);
      expect(result.balanceBefore).toBeInstanceOf(Decimal);
      expect(result.balanceAfter).toBeInstanceOf(Decimal);
    });
  });

  describe("MockExchangeAdapter.transfer()", () => {
    it("resolves with { id, status: 'ok' } when added to mock adapter", async () => {
      const adapter = makeMockAdapter();
      const result = await (adapter.transfer as (
        currency: string,
        amount: Decimal,
        from: string,
        to: string,
      ) => Promise<{ id: string; status: string }>)("USDT", new Decimal("100"), "future", "spot");

      expect(result.id).toBeDefined();
      expect(result.status).toBe("ok");
    });
  });
});

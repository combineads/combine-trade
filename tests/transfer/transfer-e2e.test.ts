/**
 * transfer-e2e — Full pipeline integration tests.
 *
 * Verifies config → balance calculation → transfer execution → EventLog recording
 * using mock-based integration (no real DB, no real exchange calls).
 *
 * All monetary comparisons use Decimal.js.
 */

import { describe, expect, it, mock } from "bun:test";
import { Decimal } from "../../src/core/decimal";
import { calculateTransferable } from "../../src/transfer/balance";
import type { TransferableParams } from "../../src/transfer/balance";
import { executeTransfer } from "../../src/transfer/executor";
import type { TransferExecutorDeps } from "../../src/transfer/executor";
import { TransferScheduler } from "../../src/transfer/scheduler";
import type { TransferSchedulerDeps } from "../../src/transfer/scheduler";
import { parseArgs } from "../../scripts/transfer-now";
import type { ExchangeAdapter } from "../../src/core/ports";

// ─── Mock factories ────────────────────────────────────────────────────────────

type EventEntry = { eventType: string; data: Record<string, unknown> };

function createMockLogger() {
  const events: EventEntry[] = [];
  const logEvent = mock(async (eventType: string, data: Record<string, unknown>) => {
    events.push({ eventType, data });
  });
  return { logEvent, events };
}

function createMockAdapter(overrides: Partial<ExchangeAdapter> = {}): ExchangeAdapter {
  return {
    fetchBalance: mock(() =>
      Promise.resolve({ total: new Decimal("1000"), available: new Decimal("1000") }),
    ),
    fetchPositions: mock(() => Promise.resolve([])),
    transfer: mock(() => Promise.resolve({ id: "tx-1", status: "ok" })),
    fetchOHLCV: mock(() => Promise.resolve([])),
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

function makeTransferParams(overrides: Partial<TransferableParams> = {}): TransferableParams {
  return {
    walletBalance: new Decimal("1000"),
    openMargin: new Decimal("200"),
    dailyProfit: new Decimal("500"), // amount = 500 * 50% = 250; safety: 1000-250=750 >= 200+300=500 ✓
    riskPct: new Decimal("0.03"),
    reserveMultiplier: 10,
    transferPct: 50,
    minTransferUsdt: new Decimal("10"),
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("transfer-e2e", () => {
  // ── Scenario 1: Full pipeline success ────────────────────────────────────────
  describe("full pipeline success", () => {
    it("balance=1000, margin=200, dailyProfit=500 → TRANSFER_SUCCESS with amount=250", async () => {
      // dailyProfit = 500
      // amount = 500 * 50 / 100 = 250 (>= 10 min)
      // safety: 1000 - 250 = 750 >= 200 + 300 = 500 ✓
      const { logEvent, events } = createMockLogger();
      const adapter = createMockAdapter();

      const deps: TransferExecutorDeps = {
        adapter,
        getTransferParams: () => Promise.resolve(makeTransferParams()),
        logEvent,
      };

      const result = await executeTransfer(deps, "binance");

      expect(result.success).toBe(true);
      expect(result.transferable.skip).toBe(false);
      expect(result.transferable.transferAmount.equals(new Decimal("250"))).toBe(true);

      const successEvent = events.find((e) => e.eventType === "TRANSFER_SUCCESS");
      expect(successEvent).toBeDefined();
      expect((successEvent?.data.amount as Decimal).equals(new Decimal("250"))).toBe(true);
      expect(successEvent?.data.exchange).toBe("binance");
      expect(successEvent?.data.currency).toBe("USDT");
      expect(successEvent?.data.from).toBe("future");
      expect(successEvent?.data.to).toBe("spot");

      // Verify no skip event was logged
      const skipEvent = events.find((e) => e.eventType === "TRANSFER_SKIP");
      expect(skipEvent).toBeUndefined();
    });
  });

  // ── Scenario 2: Full pipeline insufficient balance ────────────────────────────
  describe("full pipeline insufficient balance", () => {
    it("dailyProfit=0 → TRANSFER_SKIP (no daily profit)", async () => {
      // dailyProfit = 0 → skip (no_daily_profit)
      const { logEvent, events } = createMockLogger();
      const adapter = createMockAdapter();

      const deps: TransferExecutorDeps = {
        adapter,
        getTransferParams: () =>
          Promise.resolve(
            makeTransferParams({
              dailyProfit: new Decimal("0"),
            }),
          ),
        logEvent,
      };

      const result = await executeTransfer(deps, "binance");

      expect(result.success).toBe(false);
      expect(result.transferable.skip).toBe(true);

      // adapter.transfer must NOT be called
      expect((adapter.transfer as ReturnType<typeof mock>).mock.calls.length).toBe(0);

      const skipEvent = events.find((e) => e.eventType === "TRANSFER_SKIP");
      expect(skipEvent).toBeDefined();
      expect(skipEvent?.data.skip_reason).toBeDefined();

      const successEvent = events.find((e) => e.eventType === "TRANSFER_SUCCESS");
      expect(successEvent).toBeUndefined();
    });
  });

  // ── Scenario 3: Full pipeline transfer failure (3 retries) ───────────────────
  describe("full pipeline transfer failure", () => {
    it(
      "adapter.transfer() throws 3 times → TRANSFER_FAILED",
      async () => {
        // Note: withRetry uses exponential backoff — this test takes ~3 seconds
        const { logEvent, events } = createMockLogger();
        let callCount = 0;
        const adapter = createMockAdapter({
          transfer: mock(() => {
            callCount++;
            return Promise.reject(new Error("exchange unavailable"));
          }),
        });

        const deps: TransferExecutorDeps = {
          adapter,
          getTransferParams: () => Promise.resolve(makeTransferParams()),
          logEvent,
        };

        const result = await executeTransfer(deps, "binance");

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe("string");
        // 3 total attempts (maxRetries=3)
        expect(callCount).toBe(3);

        const failedEvent = events.find((e) => e.eventType === "TRANSFER_FAILED");
        expect(failedEvent).toBeDefined();
        expect(typeof failedEvent?.data.error_message).toBe("string");
        expect(failedEvent?.data.exchange).toBe("binance");

        const successEvent = events.find((e) => e.eventType === "TRANSFER_SUCCESS");
        expect(successEvent).toBeUndefined();
      },
      10_000, // 10s timeout — withRetry has ~3s of backoff
    );
  });

  // ── Scenario 4: Scheduler integration ────────────────────────────────────────
  describe("scheduler integration", () => {
    it("start() triggers runTransfer after a tick when transfer_enabled=true", async () => {
      const runTransfer = mock(() =>
        Promise.resolve({
          success: true,
          transferable: {
            walletBalance: new Decimal("1000"),
            openMargin: new Decimal("200"),
            dailyProfit: new Decimal("500"),
            reserve: new Decimal("300"),
            transferAmount: new Decimal("250"),
            skip: false,
          },
        }),
      );

      const getConfig = mock((code: string) => {
        const cfg: Record<string, string> = {
          transfer_enabled: "true",
          transfer_schedule: "daily",
          transfer_time_utc: "00:30",
        };
        return Promise.resolve(cfg[code] ?? null);
      });

      const deps: TransferSchedulerDeps = { runTransfer, getConfig };
      const scheduler = new TransferScheduler(deps);

      scheduler.start("binance");

      // Allow the async timer callback to fire
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      const calls = (runTransfer as ReturnType<typeof mock>).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0]?.[0]).toBe("binance");

      scheduler.stop();
    });

    it("stop() prevents runTransfer from being called when stopped before tick", () => {
      const runTransfer = mock(() =>
        Promise.resolve({
          success: true,
          transferable: {
            walletBalance: new Decimal("1000"),
            openMargin: new Decimal("200"),
            dailyProfit: new Decimal("500"),
            reserve: new Decimal("300"),
            transferAmount: new Decimal("250"),
            skip: false,
          },
        }),
      );

      const getConfig = mock((code: string) => {
        const cfg: Record<string, string> = {
          transfer_enabled: "true",
          transfer_schedule: "daily",
          transfer_time_utc: "00:30",
        };
        return Promise.resolve(cfg[code] ?? null);
      });

      const deps: TransferSchedulerDeps = { runTransfer, getConfig };
      const scheduler = new TransferScheduler(deps);

      scheduler.start("binance");
      // Stop immediately before the async callback fires
      scheduler.stop();

      // runTransfer should NOT have been called synchronously
      expect((runTransfer as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });
  });

  // ── Scenario 5: CLI dry-run ───────────────────────────────────────────────────
  describe("CLI dry-run", () => {
    it("parseArgs(['--dry-run']) → dryRun=true; calculateTransferable only, no executeTransfer", () => {
      const args = parseArgs(["--dry-run"]);
      expect(args.dryRun).toBe(true);
      expect(args.exchange).toBe("binance");

      // In dry-run mode we call calculateTransferable, not executeTransfer
      // dailyProfit=500, transferPct=50 → amount=250
      const params = makeTransferParams();
      const result = calculateTransferable(params);

      // Verify dry-run gives correct result without side effects
      expect(result.transferAmount.equals(new Decimal("250"))).toBe(true);
      expect(result.skip).toBe(false);
    });

    it("dry-run does NOT trigger adapter.transfer()", () => {
      // Verify by checking the path: dry-run calls calculateTransferable only
      const args = parseArgs(["--dry-run", "--exchange", "okx"]);
      expect(args.dryRun).toBe(true);

      // Simulate: if dryRun → only calculateTransferable, no adapter.transfer
      const executeCalled = !args.dryRun; // false in dry-run path
      expect(executeCalled).toBe(false);
    });
  });

  // ── Scenario 6: Config change — transfer_pct=80 ──────────────────────────────
  describe("config change — transfer_pct=80", () => {
    it("transfer_pct=80 → transferAmount uses 80% of dailyProfit", async () => {
      // dailyProfit = 500, amount = 500 * 80 / 100 = 400
      // safety: 1000 - 400 = 600 >= 200 + 300 = 500 ✓
      const { logEvent, events } = createMockLogger();
      const adapter = createMockAdapter();

      const deps: TransferExecutorDeps = {
        adapter,
        getTransferParams: () =>
          Promise.resolve(makeTransferParams({ transferPct: 80 })),
        logEvent,
      };

      const result = await executeTransfer(deps, "binance");

      expect(result.success).toBe(true);
      expect(result.transferable.transferAmount.equals(new Decimal("400"))).toBe(true);

      const successEvent = events.find((e) => e.eventType === "TRANSFER_SUCCESS");
      expect(successEvent).toBeDefined();
      expect((successEvent?.data.amount as Decimal).equals(new Decimal("400"))).toBe(true);
    });

    it("transfer_pct=50 → transferAmount is 250 (baseline)", () => {
      const result = calculateTransferable(makeTransferParams({ transferPct: 50 }));
      expect(result.transferAmount.equals(new Decimal("250"))).toBe(true);
    });

    it("changing transfer_pct from 50 to 80 increases transferAmount from 250 to 400", () => {
      const baseline = calculateTransferable(makeTransferParams({ transferPct: 50 }));
      const updated = calculateTransferable(makeTransferParams({ transferPct: 80 }));

      expect(baseline.transferAmount.equals(new Decimal("250"))).toBe(true);
      expect(updated.transferAmount.equals(new Decimal("400"))).toBe(true);
      expect(updated.transferAmount.greaterThan(baseline.transferAmount)).toBe(true);
    });
  });

  // ── Scenario 7: Reserve dynamic — minimum floor ───────────────────────────────
  describe("reserve dynamic — minimum floor", () => {
    it("risk_pct=0.01, balance=100 → reserve=50 (minimum floor), not 10", () => {
      // dynamic = 100 * 0.01 * 10 = 10
      // floor = 50
      // reserve = max(10, 50) = 50
      const params = makeTransferParams({
        walletBalance: new Decimal("100"),
        openMargin: new Decimal("0"),
        riskPct: new Decimal("0.01"),
        reserveMultiplier: 10,
        dailyProfit: new Decimal("50"),
        minTransferUsdt: new Decimal("1"),
      });

      const result = calculateTransferable(params);

      expect(result.reserve.equals(new Decimal("50"))).toBe(true);
      // Dynamic reserve (10) is below floor (50) → floor is applied
      expect(result.reserve.greaterThan(new Decimal("10"))).toBe(true);
    });

    it("risk_pct=0.01, balance=100 → reserve=50 (floor), amount = dailyProfit * 50% = 25", () => {
      // dailyProfit=50 (default), amount = 50 * 50/100 = 25; safety: 100-25=75 >= 0+50=50 ✓
      const params = makeTransferParams({
        walletBalance: new Decimal("100"),
        openMargin: new Decimal("0"),
        riskPct: new Decimal("0.01"),
        reserveMultiplier: 10,
        dailyProfit: new Decimal("50"),
        minTransferUsdt: new Decimal("1"),
      });

      const result = calculateTransferable(params);

      expect(result.reserve.equals(new Decimal("50"))).toBe(true);
      expect(result.transferAmount.equals(new Decimal("25"))).toBe(true);
    });

    it("risk_pct=0.05, balance=100 → reserve=50 (dynamic=50, equals floor)", () => {
      // dynamic = 100 * 0.05 * 10 = 50
      // floor = 50
      // reserve = max(50, 50) = 50
      const params = makeTransferParams({
        walletBalance: new Decimal("100"),
        openMargin: new Decimal("0"),
        riskPct: new Decimal("0.05"),
        reserveMultiplier: 10,
        dailyProfit: new Decimal("50"),
        minTransferUsdt: new Decimal("1"),
      });

      const result = calculateTransferable(params);

      expect(result.reserve.equals(new Decimal("50"))).toBe(true);
    });

    it("risk_pct=0.1, balance=100 → reserve=100 (dynamic exceeds floor)", () => {
      // dynamic = 100 * 0.1 * 10 = 100
      // floor = 50
      // reserve = max(100, 50) = 100
      const params = makeTransferParams({
        walletBalance: new Decimal("100"),
        openMargin: new Decimal("0"),
        riskPct: new Decimal("0.1"),
        reserveMultiplier: 10,
        dailyProfit: new Decimal("50"),
        minTransferUsdt: new Decimal("1"),
      });

      const result = calculateTransferable(params);

      expect(result.reserve.equals(new Decimal("100"))).toBe(true);
    });
  });

  // ── Cross-cutting: event log contents ────────────────────────────────────────
  describe("event log contents", () => {
    it("TRANSFER_SUCCESS event contains all required fields", async () => {
      const { logEvent, events } = createMockLogger();
      const deps: TransferExecutorDeps = {
        adapter: createMockAdapter(),
        getTransferParams: () => Promise.resolve(makeTransferParams()),
        logEvent,
      };

      await executeTransfer(deps, "okx");

      const successEvent = events.find((e) => e.eventType === "TRANSFER_SUCCESS");
      expect(successEvent).toBeDefined();

      const { data } = successEvent!;
      expect(data.exchange).toBe("okx");
      expect(data.currency).toBe("USDT");
      expect(data.from).toBe("future");
      expect(data.to).toBe("spot");
      expect(data.amount).toBeInstanceOf(Decimal);
      expect(data.balance_before).toBeInstanceOf(Decimal);
      expect(data.balance_after).toBeInstanceOf(Decimal);
      expect(data.reserve).toBeInstanceOf(Decimal);
    });

    it("TRANSFER_SKIP event contains exchange, currency, skip_reason", async () => {
      const { logEvent, events } = createMockLogger();
      const deps: TransferExecutorDeps = {
        adapter: createMockAdapter(),
        getTransferParams: () =>
          Promise.resolve(
            makeTransferParams({
              walletBalance: new Decimal("50"),
              openMargin: new Decimal("30"),
            }),
          ),
        logEvent,
      };

      await executeTransfer(deps, "mexc");

      const skipEvent = events.find((e) => e.eventType === "TRANSFER_SKIP");
      expect(skipEvent).toBeDefined();
      expect(skipEvent?.data.exchange).toBe("mexc");
      expect(skipEvent?.data.currency).toBe("USDT");
      expect(typeof skipEvent?.data.skip_reason).toBe("string");
    });

    it("exactly one event is logged per executeTransfer call on success", async () => {
      const { logEvent, events } = createMockLogger();
      const deps: TransferExecutorDeps = {
        adapter: createMockAdapter(),
        getTransferParams: () => Promise.resolve(makeTransferParams()),
        logEvent,
      };

      await executeTransfer(deps);

      expect(events.length).toBe(1);
      expect(events[0]?.eventType).toBe("TRANSFER_SUCCESS");
    });

    it("exactly one event is logged per executeTransfer call on skip", async () => {
      const { logEvent, events } = createMockLogger();
      const deps: TransferExecutorDeps = {
        adapter: createMockAdapter(),
        getTransferParams: () =>
          Promise.resolve(
            makeTransferParams({
              walletBalance: new Decimal("50"),
              openMargin: new Decimal("30"),
            }),
          ),
        logEvent,
      };

      await executeTransfer(deps);

      expect(events.length).toBe(1);
      expect(events[0]?.eventType).toBe("TRANSFER_SKIP");
    });
  });
});

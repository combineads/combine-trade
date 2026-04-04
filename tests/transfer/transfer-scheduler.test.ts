import { describe, expect, it, mock } from "bun:test";
import { TransferScheduler } from "../../src/transfer/scheduler";
import type { TransferSchedulerDeps } from "../../src/transfer/scheduler";
import type { TransferResult } from "../../src/transfer/executor";
import type { TransferableResult } from "../../src/transfer/balance";
import { Decimal } from "../../src/core/decimal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTransferResult(success = true): TransferResult {
  const transferable: TransferableResult = {
    walletBalance: new Decimal("1000"),
    openMargin: new Decimal("200"),
    reserve: new Decimal("300"),
    available: new Decimal("500"),
    transferAmount: new Decimal("250"),
    skip: false,
  };
  return { success, transferable };
}

function makeDeps(overrides: Partial<TransferSchedulerDeps> = {}): TransferSchedulerDeps {
  return {
    runTransfer: mock(() => Promise.resolve(makeTransferResult())),
    getConfig: mock((code: string) => {
      const defaults: Record<string, unknown> = {
        transfer_enabled: "true",
        transfer_schedule: "daily",
        transfer_time_utc: "00:30",
      };
      return Promise.resolve(defaults[code] ?? null);
    }),
    ...overrides,
  };
}

// Monday 2026-04-06 00:00:00 UTC (getDay() === 1)
const MONDAY_BEFORE_TIME = new Date("2026-04-06T00:00:00Z");
// Monday 2026-04-06 01:00:00 UTC — after 00:30
const MONDAY_AFTER_TIME = new Date("2026-04-06T01:00:00Z");
// Tuesday 2026-04-07 00:00:00 UTC
const TUESDAY = new Date("2026-04-07T00:00:00Z");
// Next Monday 2026-04-13 00:30:00 UTC
const NEXT_MONDAY = new Date("2026-04-13T00:30:00Z");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("transfer-scheduler", () => {
  describe("getNextRunTime() — daily schedule", () => {
    it("returns today at transfer_time when current time is before transfer_time", () => {
      const deps = makeDeps();
      const scheduler = new TransferScheduler(deps);

      // now = 00:00 UTC, transfer_time = 00:30 → today at 00:30
      const now = new Date("2026-04-06T00:00:00Z");
      const result = scheduler.getNextRunTime("daily", "00:30", now);

      expect(result.getUTCFullYear()).toBe(2026);
      expect(result.getUTCMonth()).toBe(3); // April (0-indexed)
      expect(result.getUTCDate()).toBe(6);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(30);
    });

    it("returns tomorrow at transfer_time when current time is after transfer_time", () => {
      const deps = makeDeps();
      const scheduler = new TransferScheduler(deps);

      // now = 01:00 UTC, transfer_time = 00:30 → tomorrow at 00:30
      const now = new Date("2026-04-06T01:00:00Z");
      const result = scheduler.getNextRunTime("daily", "00:30", now);

      expect(result.getUTCDate()).toBe(7);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(30);
    });

    it("returns today at transfer_time when current time equals transfer_time exactly", () => {
      const deps = makeDeps();
      const scheduler = new TransferScheduler(deps);

      // now = exactly 00:30 UTC — treat as "already passed" → tomorrow
      const now = new Date("2026-04-06T00:30:00Z");
      const result = scheduler.getNextRunTime("daily", "00:30", now);

      expect(result.getUTCDate()).toBe(7);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(30);
    });
  });

  describe("getNextRunTime() — weekly schedule", () => {
    it("returns this Monday at transfer_time when today is Monday before transfer_time", () => {
      const deps = makeDeps();
      const scheduler = new TransferScheduler(deps);

      const result = scheduler.getNextRunTime("weekly", "00:30", MONDAY_BEFORE_TIME);

      // Should be 2026-04-06 (this Monday) at 00:30
      expect(result.getUTCFullYear()).toBe(2026);
      expect(result.getUTCMonth()).toBe(3);
      expect(result.getUTCDate()).toBe(6);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(30);
    });

    it("returns next Monday at transfer_time when today is Monday after transfer_time", () => {
      const deps = makeDeps();
      const scheduler = new TransferScheduler(deps);

      const result = scheduler.getNextRunTime("weekly", "00:30", MONDAY_AFTER_TIME);

      // Should be 2026-04-13 (next Monday) at 00:30
      expect(result.getUTCDate()).toBe(13);
      expect(result.getUTCMonth()).toBe(3);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(30);
    });

    it("returns next Monday at transfer_time when today is Tuesday", () => {
      const deps = makeDeps();
      const scheduler = new TransferScheduler(deps);

      const result = scheduler.getNextRunTime("weekly", "00:30", TUESDAY);

      // Tuesday is 2026-04-07, next Monday is 2026-04-13
      expect(result.getUTCDate()).toBe(13);
      expect(result.getUTCMonth()).toBe(3);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(30);
    });

    it("next Monday time matches NEXT_MONDAY constant", () => {
      const deps = makeDeps();
      const scheduler = new TransferScheduler(deps);

      const result = scheduler.getNextRunTime("weekly", "00:30", TUESDAY);

      expect(result.getTime()).toBe(NEXT_MONDAY.getTime());
    });
  });

  describe("runOnce() — transfer_enabled=false", () => {
    it("does NOT call runTransfer when transfer_enabled is false", async () => {
      const runTransfer = mock(() => Promise.resolve(makeTransferResult()));
      const getConfig = mock((code: string) => {
        if (code === "transfer_enabled") return Promise.resolve("false");
        if (code === "transfer_schedule") return Promise.resolve("daily");
        if (code === "transfer_time_utc") return Promise.resolve("00:30");
        return Promise.resolve(null);
      });
      const deps: TransferSchedulerDeps = { runTransfer, getConfig };
      const scheduler = new TransferScheduler(deps);

      await scheduler.runOnce("binance");

      expect((runTransfer as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    it("schedules next run even when transfer_enabled is false", async () => {
      const getConfig = mock((code: string) => {
        if (code === "transfer_enabled") return Promise.resolve("false");
        if (code === "transfer_schedule") return Promise.resolve("daily");
        if (code === "transfer_time_utc") return Promise.resolve("00:30");
        return Promise.resolve(null);
      });
      const deps: TransferSchedulerDeps = {
        runTransfer: mock(() => Promise.resolve(makeTransferResult())),
        getConfig,
      };
      const scheduler = new TransferScheduler(deps);

      await scheduler.runOnce("binance");

      // Timer should be set (not null) since next run was scheduled
      expect(scheduler["timer"]).not.toBeNull();

      // Cleanup
      scheduler.stop();
    });
  });

  describe("runOnce() — transfer_enabled=true", () => {
    it("calls runTransfer once with the exchange name", async () => {
      const runTransfer = mock(() => Promise.resolve(makeTransferResult()));
      const getConfig = mock((code: string) => {
        if (code === "transfer_enabled") return Promise.resolve("true");
        if (code === "transfer_schedule") return Promise.resolve("daily");
        if (code === "transfer_time_utc") return Promise.resolve("00:30");
        return Promise.resolve(null);
      });
      const deps: TransferSchedulerDeps = { runTransfer, getConfig };
      const scheduler = new TransferScheduler(deps);

      await scheduler.runOnce("binance");

      const calls = (runTransfer as ReturnType<typeof mock>).mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0]?.[0]).toBe("binance");

      // Cleanup
      scheduler.stop();
    });

    it("schedules next run after calling runTransfer", async () => {
      const getConfig = mock((code: string) => {
        if (code === "transfer_enabled") return Promise.resolve("true");
        if (code === "transfer_schedule") return Promise.resolve("daily");
        if (code === "transfer_time_utc") return Promise.resolve("00:30");
        return Promise.resolve(null);
      });
      const deps: TransferSchedulerDeps = {
        runTransfer: mock(() => Promise.resolve(makeTransferResult())),
        getConfig,
      };
      const scheduler = new TransferScheduler(deps);

      await scheduler.runOnce("binance");

      expect(scheduler["timer"]).not.toBeNull();

      // Cleanup
      scheduler.stop();
    });
  });

  describe("start() and stop()", () => {
    it("start() sets a timer", () => {
      const deps = makeDeps();
      const scheduler = new TransferScheduler(deps);

      scheduler.start("binance");

      expect(scheduler["timer"]).not.toBeNull();

      scheduler.stop();
    });

    it("stop() clears the timer (sets timer to null)", () => {
      const deps = makeDeps();
      const scheduler = new TransferScheduler(deps);

      scheduler.start("binance");
      scheduler.stop();

      expect(scheduler["timer"]).toBeNull();
    });

    it("stop() before start() does not throw", () => {
      const deps = makeDeps();
      const scheduler = new TransferScheduler(deps);

      expect(() => scheduler.stop()).not.toThrow();
    });

    it("start() then stop() — runTransfer is NOT called synchronously", () => {
      const runTransfer = mock(() => Promise.resolve(makeTransferResult()));
      const deps = makeDeps({ runTransfer });
      const scheduler = new TransferScheduler(deps);

      scheduler.start("binance");
      scheduler.stop();

      // runTransfer should not have been called synchronously
      expect((runTransfer as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });
  });
});

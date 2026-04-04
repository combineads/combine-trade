import { describe, expect, it } from "bun:test";
import { d, Decimal } from "../../src/core/decimal";
import type { BacktestTrade } from "../../src/backtest/engine";
import {
  calcAdvancedMetrics,
  calcFullMetrics,
} from "../../src/backtest/metrics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrade(
  pnlPct: string,
  result: "WIN" | "LOSS" | "TIME_EXIT",
  holdDurationSec = 3600,
): BacktestTrade {
  const pnlPctDecimal = d(pnlPct);
  const entryPrice = d("40000");
  const pnl =
    result === "WIN"
      ? d("100").times(pnlPctDecimal.abs())
      : d("100").times(pnlPctDecimal.abs()).negated();
  return {
    direction: "LONG",
    entryPrice,
    exitPrice: result === "WIN" ? entryPrice.plus(d("1")) : entryPrice.minus(d("1")),
    size: d("0.1"),
    pnl,
    pnlPct: pnlPctDecimal,
    holdDurationSec,
    result,
    openedAt: new Date("2024-01-01T00:00:00Z"),
    closedAt: new Date("2024-01-01T01:00:00Z"),
  };
}

// ---------------------------------------------------------------------------
// calcAdvancedMetrics — empty input
// ---------------------------------------------------------------------------

describe("calcAdvancedMetrics", () => {
  describe("empty trades array", () => {
    it("returns sharpeRatio = 0", () => {
      const m = calcAdvancedMetrics([]);
      expect(m.sharpeRatio.toNumber()).toBe(0);
    });

    it("returns profitFactor = 0", () => {
      const m = calcAdvancedMetrics([]);
      expect(m.profitFactor.toNumber()).toBe(0);
    });

    it("returns avgHoldDuration = 0", () => {
      const m = calcAdvancedMetrics([]);
      expect(m.avgHoldDuration).toBe(0);
    });

    it("returns maxConsecutiveWins = 0", () => {
      const m = calcAdvancedMetrics([]);
      expect(m.maxConsecutiveWins.toNumber()).toBe(0);
    });

    it("returns maxConsecutiveLosses = 0", () => {
      const m = calcAdvancedMetrics([]);
      expect(m.maxConsecutiveLosses.toNumber()).toBe(0);
    });

    it("returns Decimal instances for Decimal fields", () => {
      const m = calcAdvancedMetrics([]);
      expect(m.sharpeRatio).toBeInstanceOf(Decimal);
      expect(m.profitFactor).toBeInstanceOf(Decimal);
      expect(m.maxConsecutiveWins).toBeInstanceOf(Decimal);
      expect(m.maxConsecutiveLosses).toBeInstanceOf(Decimal);
    });

    it("returns number for avgHoldDuration", () => {
      const m = calcAdvancedMetrics([]);
      expect(typeof m.avgHoldDuration).toBe("number");
    });
  });

  // ── Consistent positive PnL ─────────────────────────────────────────────────

  describe("consistent positive PnL trades", () => {
    // All wins with varying positive pnlPct so std != 0
    const trades = [
      makeTrade("0.02", "WIN"),
      makeTrade("0.03", "WIN"),
      makeTrade("0.025", "WIN"),
      makeTrade("0.04", "WIN"),
      makeTrade("0.01", "WIN"),
    ];

    it("sharpeRatio > 0", () => {
      const m = calcAdvancedMetrics(trades);
      expect(m.sharpeRatio.greaterThan(0)).toBe(true);
    });

    it("profitFactor > 1 (all wins → sentinel d('999999'))", () => {
      const m = calcAdvancedMetrics(trades);
      // All wins means no losses, so profitFactor = sentinel 999999
      expect(m.profitFactor.toNumber()).toBe(999999);
    });
  });

  // ── All LOSS → profitFactor = 0 ─────────────────────────────────────────────

  describe("all LOSS trades", () => {
    const trades = [
      makeTrade("-0.01", "LOSS"),
      makeTrade("-0.02", "LOSS"),
      makeTrade("-0.015", "LOSS"),
    ];

    it("profitFactor = 0 when totalGrossProfit = 0", () => {
      const m = calcAdvancedMetrics(trades);
      expect(m.profitFactor.toNumber()).toBe(0);
    });
  });

  // ── All WIN → profitFactor sentinel ─────────────────────────────────────────

  describe("all WIN trades", () => {
    const trades = [
      makeTrade("0.01", "WIN"),
      makeTrade("0.02", "WIN"),
      makeTrade("0.03", "WIN"),
    ];

    it("profitFactor = d('999999') when totalGrossLoss = 0", () => {
      const m = calcAdvancedMetrics(trades);
      expect(m.profitFactor.equals(d("999999"))).toBe(true);
    });
  });

  // ── Streak scenario: 3 WIN, 2 LOSS, 1 WIN ───────────────────────────────────

  describe("streak: 3 WIN, 2 LOSS, 1 WIN", () => {
    const trades = [
      makeTrade("0.01", "WIN"),
      makeTrade("0.01", "WIN"),
      makeTrade("0.01", "WIN"),
      makeTrade("-0.01", "LOSS"),
      makeTrade("-0.01", "LOSS"),
      makeTrade("0.01", "WIN"),
    ];

    it("maxConsecutiveWins = 3", () => {
      const m = calcAdvancedMetrics(trades);
      expect(m.maxConsecutiveWins.toNumber()).toBe(3);
    });

    it("maxConsecutiveLosses = 2", () => {
      const m = calcAdvancedMetrics(trades);
      expect(m.maxConsecutiveLosses.toNumber()).toBe(2);
    });
  });

  // ── avgHoldDuration ─────────────────────────────────────────────────────────

  describe("avgHoldDuration", () => {
    it("computes average of holdDurationSec across all trades", () => {
      const trades = [
        makeTrade("0.01", "WIN", 1000),
        makeTrade("0.01", "WIN", 3000),
        makeTrade("-0.01", "LOSS", 2000),
      ];
      const m = calcAdvancedMetrics(trades);
      expect(m.avgHoldDuration).toBe(2000);
    });
  });

  // ── Single trade → sharpeRatio = 0 (std=0 branch) ───────────────────────────

  describe("single trade", () => {
    it("sharpeRatio = 0 when only 1 trade", () => {
      const m = calcAdvancedMetrics([makeTrade("0.01", "WIN")]);
      expect(m.sharpeRatio.toNumber()).toBe(0);
    });
  });

  // ── All identical pnlPct → std=0 → sharpeRatio = 0 ──────────────────────────

  describe("identical pnlPct values → std = 0", () => {
    it("sharpeRatio = 0", () => {
      const trades = [
        makeTrade("0.01", "WIN"),
        makeTrade("0.01", "WIN"),
        makeTrade("0.01", "WIN"),
      ];
      const m = calcAdvancedMetrics(trades);
      expect(m.sharpeRatio.toNumber()).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// calcFullMetrics
// ---------------------------------------------------------------------------

describe("calcFullMetrics", () => {
  const trades = [
    makeTrade("0.02", "WIN"),
    makeTrade("-0.01", "LOSS"),
    makeTrade("0.03", "WIN"),
  ];

  it("includes BasicMetrics fields", () => {
    const m = calcFullMetrics(trades);
    expect(m.totalTrades).toBeInstanceOf(Decimal);
    expect(m.wins).toBeInstanceOf(Decimal);
    expect(m.losses).toBeInstanceOf(Decimal);
    expect(m.winRate).toBeInstanceOf(Decimal);
    expect(m.expectancy).toBeInstanceOf(Decimal);
    expect(m.maxDrawdown).toBeInstanceOf(Decimal);
    expect(m.maxDrawdownPct).toBeInstanceOf(Decimal);
  });

  it("includes AdvancedMetrics fields", () => {
    const m = calcFullMetrics(trades);
    expect(m.sharpeRatio).toBeInstanceOf(Decimal);
    expect(m.profitFactor).toBeInstanceOf(Decimal);
    expect(typeof m.avgHoldDuration).toBe("number");
    expect(m.maxConsecutiveWins).toBeInstanceOf(Decimal);
    expect(m.maxConsecutiveLosses).toBeInstanceOf(Decimal);
  });

  it("BasicMetrics values match calcBasicMetrics", () => {
    const m = calcFullMetrics(trades);
    expect(m.totalTrades.toNumber()).toBe(3);
    expect(m.wins.toNumber()).toBe(2);
    expect(m.losses.toNumber()).toBe(1);
  });

  it("returns all zeros for empty trades", () => {
    const m = calcFullMetrics([]);
    expect(m.totalTrades.toNumber()).toBe(0);
    expect(m.sharpeRatio.toNumber()).toBe(0);
    expect(m.profitFactor.toNumber()).toBe(0);
  });
});

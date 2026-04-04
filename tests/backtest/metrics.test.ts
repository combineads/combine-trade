import { describe, expect, it } from "bun:test";
import { d, Decimal } from "../../src/core/decimal";
import type { BacktestTrade } from "../../src/backtest/engine";
import { calcBasicMetrics } from "../../src/backtest/metrics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrade(pnl: string, result: "WIN" | "LOSS" | "TIME_EXIT"): BacktestTrade {
  const pnlDecimal = d(pnl);
  const entryPrice = d("40000");
  const exitPrice =
    result === "WIN"
      ? entryPrice.plus(pnlDecimal)
      : entryPrice.minus(pnlDecimal.abs());
  return {
    direction: "LONG",
    entryPrice,
    exitPrice,
    size: d("0.1"),
    pnl: pnlDecimal,
    pnlPct: d("0.01"),
    holdDurationSec: 3600,
    result,
    openedAt: new Date("2024-01-01T00:00:00Z"),
    closedAt: new Date("2024-01-01T01:00:00Z"),
  };
}

// ---------------------------------------------------------------------------
// calcBasicMetrics
// ---------------------------------------------------------------------------

describe("calcBasicMetrics", () => {
  // ── Empty input ────────────────────────────────────────────────────────────

  describe("empty trades array", () => {
    it("returns all zeros for empty trades", () => {
      const metrics = calcBasicMetrics([]);

      expect(metrics.totalTrades.toNumber()).toBe(0);
      expect(metrics.wins.toNumber()).toBe(0);
      expect(metrics.losses.toNumber()).toBe(0);
      expect(metrics.winRate.toNumber()).toBe(0);
      expect(metrics.expectancy.toNumber()).toBe(0);
      expect(metrics.maxDrawdown.toNumber()).toBe(0);
      expect(metrics.maxDrawdownPct.toNumber()).toBe(0);
    });

    it("returns Decimal instances for all fields", () => {
      const metrics = calcBasicMetrics([]);

      expect(metrics.totalTrades).toBeInstanceOf(Decimal);
      expect(metrics.wins).toBeInstanceOf(Decimal);
      expect(metrics.losses).toBeInstanceOf(Decimal);
      expect(metrics.winRate).toBeInstanceOf(Decimal);
      expect(metrics.expectancy).toBeInstanceOf(Decimal);
      expect(metrics.maxDrawdown).toBeInstanceOf(Decimal);
      expect(metrics.maxDrawdownPct).toBeInstanceOf(Decimal);
    });
  });

  // ── Basic counts ───────────────────────────────────────────────────────────

  describe("10 trades — 7 WIN, 3 LOSS", () => {
    const trades = [
      ...Array.from({ length: 7 }, () => makeTrade("100", "WIN")),
      ...Array.from({ length: 3 }, () => makeTrade("-50", "LOSS")),
    ];

    it("totalTrades = 10", () => {
      const metrics = calcBasicMetrics(trades);
      expect(metrics.totalTrades.toNumber()).toBe(10);
    });

    it("wins = 7", () => {
      const metrics = calcBasicMetrics(trades);
      expect(metrics.wins.toNumber()).toBe(7);
    });

    it("losses = 3", () => {
      const metrics = calcBasicMetrics(trades);
      expect(metrics.losses.toNumber()).toBe(3);
    });

    it("winRate = 0.7", () => {
      const metrics = calcBasicMetrics(trades);
      expect(metrics.winRate.toNumber()).toBeCloseTo(0.7, 10);
    });

    it("winRate is between 0 and 1", () => {
      const metrics = calcBasicMetrics(trades);
      expect(metrics.winRate.greaterThanOrEqualTo(0)).toBe(true);
      expect(metrics.winRate.lessThanOrEqualTo(1)).toBe(true);
    });
  });

  // ── All WIN ────────────────────────────────────────────────────────────────

  describe("all WIN trades", () => {
    const trades = Array.from({ length: 5 }, () => makeTrade("100", "WIN"));

    it("winRate = 1.0", () => {
      const metrics = calcBasicMetrics(trades);
      expect(metrics.winRate.toNumber()).toBe(1);
    });

    it("losses = 0", () => {
      const metrics = calcBasicMetrics(trades);
      expect(metrics.losses.toNumber()).toBe(0);
    });

    it("expectancy > 0", () => {
      const metrics = calcBasicMetrics(trades);
      expect(metrics.expectancy.greaterThan(0)).toBe(true);
    });
  });

  // ── All LOSS ───────────────────────────────────────────────────────────────

  describe("all LOSS trades", () => {
    const trades = Array.from({ length: 5 }, () => makeTrade("-80", "LOSS"));

    it("winRate = 0.0", () => {
      const metrics = calcBasicMetrics(trades);
      expect(metrics.winRate.toNumber()).toBe(0);
    });

    it("wins = 0", () => {
      const metrics = calcBasicMetrics(trades);
      expect(metrics.wins.toNumber()).toBe(0);
    });

    it("expectancy < 0", () => {
      const metrics = calcBasicMetrics(trades);
      expect(metrics.expectancy.lessThan(0)).toBe(true);
    });
  });

  // ── Expectancy formula ─────────────────────────────────────────────────────

  describe("expectancy calculation", () => {
    it("expectancy = avgWin * winRate - avgLoss * lossRate", () => {
      // 2 WIN @ +100, 1 LOSS @ -60
      // avgWin = 100, winRate = 2/3
      // avgLoss = 60, lossRate = 1/3
      // expectancy = 100 * (2/3) - 60 * (1/3) = 66.666... - 20 = 46.666...
      const trades = [
        makeTrade("100", "WIN"),
        makeTrade("100", "WIN"),
        makeTrade("-60", "LOSS"),
      ];
      const metrics = calcBasicMetrics(trades);
      const expected = 100 * (2 / 3) - 60 * (1 / 3);
      expect(metrics.expectancy.toNumber()).toBeCloseTo(expected, 8);
    });
  });

  // ── MDD: equity curve scenario ─────────────────────────────────────────────

  describe("maxDrawdown from equity curve", () => {
    it("equity curve [100, 110, 90, 120, 80] → maxDrawdown = -40, maxDrawdownPct ≈ -33.33%", () => {
      // PnL deltas that produce equity [0, 100, 110, 90, 120, 80]:
      //   trade1: +100, trade2: +10, trade3: -20, trade4: +30, trade5: -40
      // Running peak goes: 0→100→110→110→120→120
      // Drawdown at each step: 0, 0, -20, 0, -40
      // maxDrawdown = -40 (from 120 down to 80)
      // maxDrawdownPct = -40/120 ≈ -0.3333...
      const trades = [
        makeTrade("100", "WIN"),
        makeTrade("10", "WIN"),
        makeTrade("-20", "LOSS"),
        makeTrade("30", "WIN"),
        makeTrade("-40", "LOSS"),
      ];
      const metrics = calcBasicMetrics(trades);
      expect(metrics.maxDrawdown.toNumber()).toBeCloseTo(-40, 8);
      expect(metrics.maxDrawdownPct.toNumber()).toBeCloseTo(-40 / 120, 8);
    });

    it("monotonically increasing equity → maxDrawdown = 0", () => {
      const trades = [
        makeTrade("50", "WIN"),
        makeTrade("60", "WIN"),
        makeTrade("70", "WIN"),
        makeTrade("80", "WIN"),
      ];
      const metrics = calcBasicMetrics(trades);
      expect(metrics.maxDrawdown.toNumber()).toBe(0);
      expect(metrics.maxDrawdownPct.toNumber()).toBe(0);
    });
  });

  // ── MDD sign convention ────────────────────────────────────────────────────

  describe("maxDrawdown sign", () => {
    it("maxDrawdown is <= 0 for any loss scenario", () => {
      const trades = [
        makeTrade("200", "WIN"),
        makeTrade("-150", "LOSS"),
      ];
      const metrics = calcBasicMetrics(trades);
      expect(metrics.maxDrawdown.lessThanOrEqualTo(0)).toBe(true);
    });

    it("maxDrawdown = 0 for all wins", () => {
      const trades = Array.from({ length: 3 }, () => makeTrade("50", "WIN"));
      const metrics = calcBasicMetrics(trades);
      expect(metrics.maxDrawdown.toNumber()).toBe(0);
    });
  });
});

/**
 * T-13-014 Backtest Accuracy Validation
 *
 * Integration tests that verify backtest metrics calculations match
 * hand-computed results to 6 decimal places.
 */

import { describe, expect, it } from "bun:test";
import { d } from "../../src/core/decimal";
import type { BacktestTrade } from "../../src/backtest/engine";
import { calcBasicMetrics, calcFullMetrics } from "../../src/backtest/metrics";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Creates a BacktestTrade with explicit entry/exit prices and derived PnL.
 *
 * For LONG: pnl = (exitPrice - entryPrice) * size
 * For SHORT: pnl = (entryPrice - exitPrice) * size
 */
function makeTrade(opts: {
  direction: "LONG" | "SHORT";
  entryPrice: string;
  exitPrice: string;
  size: string;
  result: "WIN" | "LOSS" | "TIME_EXIT";
  openedAt?: Date;
  closedAt?: Date;
  holdDurationSec?: number;
}): BacktestTrade {
  const entry = d(opts.entryPrice);
  const exit = d(opts.exitPrice);
  const size = d(opts.size);

  const pnl =
    opts.direction === "LONG"
      ? exit.minus(entry).times(size)
      : entry.minus(exit).times(size);

  const pnlPct =
    opts.direction === "LONG"
      ? exit.minus(entry).dividedBy(entry)
      : entry.minus(exit).dividedBy(entry);

  const openedAt = opts.openedAt ?? new Date("2024-01-01T00:00:00Z");
  const closedAt = opts.closedAt ?? new Date("2024-01-01T01:00:00Z");
  const holdDurationSec =
    opts.holdDurationSec ?? Math.floor((closedAt.getTime() - openedAt.getTime()) / 1000);

  return {
    direction: opts.direction,
    entryPrice: entry,
    exitPrice: exit,
    size,
    pnl,
    pnlPct,
    holdDurationSec,
    result: opts.result,
    openedAt,
    closedAt,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Simple LONG WIN
// ---------------------------------------------------------------------------
// Entry=100, Exit=108, Size=1, Direction=LONG
// PnL       = (108 - 100) * 1 = 8
// PnlPct    = (108 - 100) / 100 = 0.08
// Result    = WIN
// ---------------------------------------------------------------------------

describe("accuracy — scenario 1: simple LONG WIN", () => {
  const trade = makeTrade({
    direction: "LONG",
    entryPrice: "100",
    exitPrice: "108",
    size: "1",
    result: "WIN",
  });

  it("pnl equals hand-computed 8.000000", () => {
    expect(trade.pnl.toFixed(6)).toBe("8.000000");
  });

  it("pnlPct equals hand-computed 0.080000", () => {
    expect(trade.pnlPct.toFixed(6)).toBe("0.080000");
  });

  it("result is WIN", () => {
    expect(trade.result).toBe("WIN");
  });

  it("calcBasicMetrics: totalTrades=1, wins=1, winRate=1", () => {
    const m = calcBasicMetrics([trade]);
    expect(m.totalTrades.toFixed(6)).toBe("1.000000");
    expect(m.wins.toFixed(6)).toBe("1.000000");
    expect(m.losses.toFixed(6)).toBe("0.000000");
    expect(m.winRate.toFixed(6)).toBe("1.000000");
  });

  it("calcBasicMetrics: expectancy = avgWin * winRate = 8 * 1 = 8.000000", () => {
    const m = calcBasicMetrics([trade]);
    // expectancy = avgWin(8) * winRate(1) - avgLoss(0) * lossRate(0) = 8
    expect(m.expectancy.toFixed(6)).toBe("8.000000");
  });

  it("calcBasicMetrics: maxDrawdown = 0 (no loss)", () => {
    const m = calcBasicMetrics([trade]);
    expect(m.maxDrawdown.toFixed(6)).toBe("0.000000");
    expect(m.maxDrawdownPct.toFixed(6)).toBe("0.000000");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Mixed LONG + SHORT (1 WIN + 1 LOSS)
// ---------------------------------------------------------------------------
// Trade1 LONG: entry=100, exit=105, size=1
//   PnL    = (105 - 100) * 1 = 5        → WIN
//   PnlPct = (105 - 100) / 100 = 0.05
//
// Trade2 SHORT: entry=200, exit=204, size=0.5
//   PnL    = (200 - 204) * 0.5 = -2     → LOSS
//   PnlPct = (200 - 204) / 200 = -0.02
//
// WinRate    = 1/2 = 0.5
// LossRate   = 1/2 = 0.5
// avgWin     = 5
// avgLoss    = 2
// Expectancy = 5 * 0.5 - 2 * 0.5 = 2.5 - 1.0 = 1.5
//
// Equity curve: 5, then 5 + (-2) = 3
// Peak: 5, 5
// Drawdown: 0, -2
// MDD = -2, MDD peak = 5, MDD% = -2/5 = -0.4
// ---------------------------------------------------------------------------

describe("accuracy — scenario 2: mixed LONG+SHORT (1 WIN + 1 LOSS)", () => {
  const trade1 = makeTrade({
    direction: "LONG",
    entryPrice: "100",
    exitPrice: "105",
    size: "1",
    result: "WIN",
  });

  const trade2 = makeTrade({
    direction: "SHORT",
    entryPrice: "200",
    exitPrice: "204",
    size: "0.5",
    result: "LOSS",
  });

  it("trade1 pnl = 5.000000", () => {
    expect(trade1.pnl.toFixed(6)).toBe("5.000000");
  });

  it("trade1 pnlPct = 0.050000", () => {
    expect(trade1.pnlPct.toFixed(6)).toBe("0.050000");
  });

  it("trade2 pnl = -2.000000 (SHORT entry=200 exit=204 size=0.5)", () => {
    expect(trade2.pnl.toFixed(6)).toBe("-2.000000");
  });

  it("trade2 pnlPct = -0.020000", () => {
    expect(trade2.pnlPct.toFixed(6)).toBe("-0.020000");
  });

  describe("calcBasicMetrics", () => {
    const m = calcBasicMetrics([trade1, trade2]);

    it("totalTrades = 2", () => {
      expect(m.totalTrades.toFixed(6)).toBe("2.000000");
    });

    it("wins = 1", () => {
      expect(m.wins.toFixed(6)).toBe("1.000000");
    });

    it("losses = 1", () => {
      expect(m.losses.toFixed(6)).toBe("1.000000");
    });

    it("winRate = 0.500000", () => {
      expect(m.winRate.toFixed(6)).toBe("0.500000");
    });

    it("expectancy = avgWin(5)*winRate(0.5) - avgLoss(2)*lossRate(0.5) = 1.500000", () => {
      // 5 * 0.5 - 2 * 0.5 = 2.5 - 1.0 = 1.5
      expect(m.expectancy.toFixed(6)).toBe("1.500000");
    });

    it("maxDrawdown = -2.000000 (peak=5, trough=3)", () => {
      // equity: 5 → 3; peak stayed at 5; drawdown = 3 - 5 = -2
      expect(m.maxDrawdown.toFixed(6)).toBe("-2.000000");
    });

    it("maxDrawdownPct = -0.400000 (= -2/5)", () => {
      expect(m.maxDrawdownPct.toFixed(6)).toBe("-0.400000");
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: SL Hit (LOSS)
// ---------------------------------------------------------------------------
// Entry=100, SL=97, Exit=97, Size=2, Direction=LONG
// PnL    = (97 - 100) * 2 = -6
// PnlPct = (97 - 100) / 100 = -0.03
// Result = LOSS
// ---------------------------------------------------------------------------

describe("accuracy — scenario 3: SL hit LOSS", () => {
  const trade = makeTrade({
    direction: "LONG",
    entryPrice: "100",
    exitPrice: "97",
    size: "2",
    result: "LOSS",
  });

  it("pnl = -6.000000", () => {
    expect(trade.pnl.toFixed(6)).toBe("-6.000000");
  });

  it("pnlPct = -0.030000 (-3%)", () => {
    expect(trade.pnlPct.toFixed(6)).toBe("-0.030000");
  });

  it("result is LOSS", () => {
    expect(trade.result).toBe("LOSS");
  });

  it("calcBasicMetrics: winRate = 0.000000", () => {
    const m = calcBasicMetrics([trade]);
    expect(m.winRate.toFixed(6)).toBe("0.000000");
  });

  it("calcBasicMetrics: expectancy = -(avgLoss * lossRate) = -(6 * 1) = -6.000000", () => {
    const m = calcBasicMetrics([trade]);
    // all losses: expectancy = -avgLoss * lossRate = -6 * 1 = -6
    expect(m.expectancy.toFixed(6)).toBe("-6.000000");
  });

  it("calcBasicMetrics: maxDrawdown = -6.000000", () => {
    // equity: -6; peak starts at 0, never exceeds 0; drawdown = -6 - 0 = -6
    const m = calcBasicMetrics([trade]);
    expect(m.maxDrawdown.toFixed(6)).toBe("-6.000000");
  });

  it("calcBasicMetrics: maxDrawdownPct = 0.000000 (peak was 0, no % denominator)", () => {
    // maxDrawdownPeak = 0, so maxDrawdownPct = 0 by convention
    const m = calcBasicMetrics([trade]);
    expect(m.maxDrawdownPct.toFixed(6)).toBe("0.000000");
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: MDD Verification with known equity curve
// ---------------------------------------------------------------------------
// PnL deltas: +10, -20, +30, -50
// Equity curve:
//   after trade1: 10
//   after trade2: 10 + (-20) = -10
//   after trade3: -10 + 30 = 20
//   after trade4: 20 + (-50) = -30
//
// Peak tracking (running max):
//   after trade1: peak = 10
//   after trade2: peak = 10 (10 > -10)
//   after trade3: peak = 20 (20 > 10)
//   after trade4: peak = 20 (20 > -30)
//
// Drawdown at each step (equity - peak):
//   after trade1: 10 - 10 = 0
//   after trade2: -10 - 10 = -20
//   after trade3: 20 - 20 = 0
//   after trade4: -30 - 20 = -50
//
// MDD = -50 (worst drawdown, occurs after trade4)
// MDD peak at that point = 20
// MDD% = -50 / 20 = -2.5
// ---------------------------------------------------------------------------

describe("accuracy — scenario 4: MDD verification", () => {
  // We construct each trade from known PnL values.
  // entryPrice=100, exitPrice derived from desired PnL with size=1.
  function makePnlTrade(pnl: string, result: "WIN" | "LOSS"): BacktestTrade {
    const entryPrice = d("100");
    const pnlDecimal = d(pnl);
    // For LONG: exitPrice = entryPrice + pnl/size (size=1)
    const exitPrice = entryPrice.plus(pnlDecimal);
    const size = d("1");
    const pnlPct = pnlDecimal.dividedBy(entryPrice);
    return {
      direction: "LONG",
      entryPrice,
      exitPrice,
      size,
      pnl: pnlDecimal,
      pnlPct,
      holdDurationSec: 3600,
      result,
      openedAt: new Date("2024-01-01T00:00:00Z"),
      closedAt: new Date("2024-01-01T01:00:00Z"),
    };
  }

  const trades = [
    makePnlTrade("10", "WIN"),   // equity → 10
    makePnlTrade("-20", "LOSS"), // equity → -10
    makePnlTrade("30", "WIN"),   // equity → 20
    makePnlTrade("-50", "LOSS"), // equity → -30
  ];

  it("has 4 trades", () => {
    expect(trades.length).toBe(4);
  });

  describe("calcBasicMetrics", () => {
    const m = calcBasicMetrics(trades);

    it("maxDrawdown = -50.000000", () => {
      expect(m.maxDrawdown.toFixed(6)).toBe("-50.000000");
    });

    it("maxDrawdownPct = -2.500000 (= -50 / 20)", () => {
      // peak at MDD point was 20
      expect(m.maxDrawdownPct.toFixed(6)).toBe("-2.500000");
    });

    it("wins = 2", () => {
      expect(m.wins.toFixed(6)).toBe("2.000000");
    });

    it("losses = 2", () => {
      expect(m.losses.toFixed(6)).toBe("2.000000");
    });

    it("winRate = 0.500000", () => {
      expect(m.winRate.toFixed(6)).toBe("0.500000");
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Slippage impact
// ---------------------------------------------------------------------------
// Base trade (no slippage):
//   LONG entry=100, exit=105, size=1
//   PnL_no_slip = (105 - 100) * 1 = 5
//
// With slippage of 0.1% (0.001) on both entry and exit:
//   For LONG: entry increases (worse fill), exit decreases (worse fill)
//   entryWithSlip = 100 * (1 + 0.001) = 100.1
//   exitWithSlip  = 105 * (1 - 0.001) = 104.895
//   PnL_slip = (104.895 - 100.1) * 1 = 4.795
//
// Slippage cost = PnL_no_slip - PnL_slip = 5 - 4.795 = 0.205
// ---------------------------------------------------------------------------

describe("accuracy — scenario 5: slippage impact", () => {
  const tradeNoSlip = makeTrade({
    direction: "LONG",
    entryPrice: "100",
    exitPrice: "105",
    size: "1",
    result: "WIN",
  });

  // entryWithSlip = 100 * (1 + 0.001) = 100.1
  // exitWithSlip  = 105 * (1 - 0.001) = 104.895
  const tradeWithSlip = makeTrade({
    direction: "LONG",
    entryPrice: "100.1",
    exitPrice: "104.895",
    size: "1",
    result: "WIN",
  });

  it("baseline trade pnl = 5.000000", () => {
    expect(tradeNoSlip.pnl.toFixed(6)).toBe("5.000000");
  });

  it("slipped trade pnl = 4.795000", () => {
    // (104.895 - 100.1) * 1 = 4.795
    expect(tradeWithSlip.pnl.toFixed(6)).toBe("4.795000");
  });

  it("slippage cost = 0.205000 (pnl difference)", () => {
    // 5 - 4.795 = 0.205
    const slippageCost = tradeNoSlip.pnl.minus(tradeWithSlip.pnl);
    expect(slippageCost.toFixed(6)).toBe("0.205000");
  });

  it("slippage cost matches hand-computed: entry_slip + exit_slip", () => {
    // entry slippage cost = 100 * 0.001 = 0.1
    // exit slippage cost  = 105 * 0.001 = 0.105
    // total expected slippage = 0.1 + 0.105 = 0.205
    const expectedSlippageCost = d("0.1").plus(d("0.105"));
    const actualSlippageCost = tradeNoSlip.pnl.minus(tradeWithSlip.pnl);
    expect(actualSlippageCost.toFixed(6)).toBe(expectedSlippageCost.toFixed(6));
  });

  describe("metrics comparison: no-slippage vs slippage", () => {
    it("no-slippage expectancy > slippage expectancy", () => {
      const mNoSlip = calcBasicMetrics([tradeNoSlip]);
      const mWithSlip = calcBasicMetrics([tradeWithSlip]);
      expect(mNoSlip.expectancy.greaterThan(mWithSlip.expectancy)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: calcFullMetrics — combining basic + advanced metrics
// ---------------------------------------------------------------------------
// 3 trades: WIN(+10), WIN(+20), LOSS(-5)
// winRate = 2/3
// avgWin = 15, avgLoss = 5
// expectancy = 15*(2/3) - 5*(1/3) = 10 - 1.666... = 8.333...
// profitFactor = totalGrossProfit / totalGrossLoss = 30 / 5 = 6
// maxConsecutiveWins = 2, maxConsecutiveLosses = 1
// ---------------------------------------------------------------------------

describe("accuracy — scenario 6: calcFullMetrics combined metrics", () => {
  function makePnlTradeFixed(pnl: string, result: "WIN" | "LOSS", pnlPct: string): BacktestTrade {
    const entryPrice = d("100");
    const pnlDecimal = d(pnl);
    const exitPrice = entryPrice.plus(pnlDecimal);
    return {
      direction: "LONG",
      entryPrice,
      exitPrice,
      size: d("1"),
      pnl: pnlDecimal,
      pnlPct: d(pnlPct),
      holdDurationSec: 3600,
      result,
      openedAt: new Date("2024-01-01T00:00:00Z"),
      closedAt: new Date("2024-01-01T01:00:00Z"),
    };
  }

  const trades = [
    makePnlTradeFixed("10", "WIN", "0.10"),
    makePnlTradeFixed("20", "WIN", "0.20"),
    makePnlTradeFixed("-5", "LOSS", "-0.05"),
  ];

  const m = calcFullMetrics(trades);

  it("totalTrades = 3", () => {
    expect(m.totalTrades.toFixed(6)).toBe("3.000000");
  });

  it("wins = 2, losses = 1", () => {
    expect(m.wins.toFixed(6)).toBe("2.000000");
    expect(m.losses.toFixed(6)).toBe("1.000000");
  });

  it("winRate = 2/3 ≈ 0.666667", () => {
    // 2/3 = 0.666666...7
    const expected = d("2").dividedBy(d("3"));
    expect(m.winRate.toFixed(6)).toBe(expected.toFixed(6));
  });

  it("expectancy = avgWin(15) * winRate(2/3) - avgLoss(5) * lossRate(1/3) = 8.333...", () => {
    // avgWin = (10+20)/2 = 15
    // expectancy = 15*(2/3) - 5*(1/3) = 10 - 1.666... = 8.333...
    const expected = d("15").times(d("2").dividedBy(d("3"))).minus(d("5").times(d("1").dividedBy(d("3"))));
    expect(m.expectancy.toFixed(6)).toBe(expected.toFixed(6));
  });

  it("profitFactor = totalGrossProfit(30) / totalGrossLoss(5) = 6.000000", () => {
    expect(m.profitFactor.toFixed(6)).toBe("6.000000");
  });

  it("maxConsecutiveWins = 2", () => {
    expect(m.maxConsecutiveWins.toFixed(6)).toBe("2.000000");
  });

  it("maxConsecutiveLosses = 1", () => {
    expect(m.maxConsecutiveLosses.toFixed(6)).toBe("1.000000");
  });

  it("avgHoldDuration = 3600 seconds", () => {
    expect(m.avgHoldDuration).toBe(3600);
  });
});

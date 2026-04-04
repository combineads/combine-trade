import { Decimal } from "@/core/decimal";
import { d } from "@/core/decimal";
import type { BacktestTrade } from "@/backtest/engine";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type BasicMetrics = {
  /** Total number of trades evaluated */
  totalTrades: Decimal;
  /** Number of winning trades (result === "WIN") */
  wins: Decimal;
  /** Number of losing trades (result === "LOSS" or "TIME_EXIT") */
  losses: Decimal;
  /** wins / totalTrades — range [0, 1] */
  winRate: Decimal;
  /**
   * avgWin × winRate − avgLoss × lossRate
   * Positive value indicates a profitable edge.
   */
  expectancy: Decimal;
  /**
   * Maximum peak-to-trough drawdown of the equity curve.
   * Value is zero or negative: 0 means no drawdown occurred.
   */
  maxDrawdown: Decimal;
  /**
   * maxDrawdown / peakEquity at the point of maximum drawdown.
   * Zero or negative; expressed as a ratio (e.g., −0.333 = −33.3%).
   */
  maxDrawdownPct: Decimal;
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Calculates basic performance metrics from a list of backtest trades.
 *
 * Returns all-zero metrics when the trades array is empty.
 * All returned values are Decimal instances.
 */
export function calcBasicMetrics(trades: BacktestTrade[]): BasicMetrics {
  const ZERO = d("0");

  if (trades.length === 0) {
    return {
      totalTrades: ZERO,
      wins: ZERO,
      losses: ZERO,
      winRate: ZERO,
      expectancy: ZERO,
      maxDrawdown: ZERO,
      maxDrawdownPct: ZERO,
    };
  }

  const totalTrades = d(String(trades.length));

  // ── Win / loss counts and PnL sums ─────────────────────────────────────────

  let winCount = ZERO;
  let lossCount = ZERO;
  let winPnlSum = ZERO;
  let lossPnlAbsSum = ZERO;

  for (const trade of trades) {
    if (trade.result === "WIN") {
      winCount = winCount.plus(d("1"));
      winPnlSum = winPnlSum.plus(trade.pnl);
    } else {
      // LOSS and TIME_EXIT both count as losses
      lossCount = lossCount.plus(d("1"));
      lossPnlAbsSum = lossPnlAbsSum.plus(trade.pnl.abs());
    }
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  const winRate = winCount.dividedBy(totalTrades);
  const lossRate = lossCount.dividedBy(totalTrades);

  // ── Expectancy ─────────────────────────────────────────────────────────────

  let expectancy: Decimal;

  if (winCount.isZero() && lossCount.isZero()) {
    expectancy = ZERO;
  } else if (winCount.isZero()) {
    // All losses: avgLoss * lossRate, expectancy is negative
    const avgLoss = lossPnlAbsSum.dividedBy(lossCount);
    expectancy = avgLoss.times(lossRate).negated();
  } else if (lossCount.isZero()) {
    // All wins: avgWin * winRate, expectancy is positive
    const avgWin = winPnlSum.dividedBy(winCount);
    expectancy = avgWin.times(winRate);
  } else {
    const avgWin = winPnlSum.dividedBy(winCount);
    const avgLoss = lossPnlAbsSum.dividedBy(lossCount);
    expectancy = avgWin.times(winRate).minus(avgLoss.times(lossRate));
  }

  // ── Maximum Drawdown (equity curve) ────────────────────────────────────────
  // Build cumulative PnL equity curve starting from 0, then track running peak
  // and worst drawdown.

  let equity = ZERO;
  let peak = ZERO;
  let maxDrawdown = ZERO;
  let maxDrawdownPeak = ZERO;

  for (const trade of trades) {
    equity = equity.plus(trade.pnl);

    if (equity.greaterThan(peak)) {
      peak = equity;
    }

    const drawdown = equity.minus(peak); // zero or negative
    if (drawdown.lessThan(maxDrawdown)) {
      maxDrawdown = drawdown;
      maxDrawdownPeak = peak;
    }
  }

  // maxDrawdownPct: drawdown relative to peak at that point
  let maxDrawdownPct: Decimal;
  if (maxDrawdownPeak.isZero()) {
    maxDrawdownPct = ZERO;
  } else {
    maxDrawdownPct = maxDrawdown.dividedBy(maxDrawdownPeak);
  }

  return {
    totalTrades,
    wins: winCount,
    losses: lossCount,
    winRate,
    expectancy,
    maxDrawdown,
    maxDrawdownPct,
  };
}

// ---------------------------------------------------------------------------
// AdvancedMetrics types
// ---------------------------------------------------------------------------

export type AdvancedMetrics = {
  /**
   * Annualized Sharpe Ratio = mean(pnlPct) / std(pnlPct) × sqrt(252).
   * Returns 0 when fewer than 2 trades or std = 0.
   */
  sharpeRatio: Decimal;
  /**
   * totalGrossProfit / |totalGrossLoss|.
   * Returns d("999999") when totalGrossLoss = 0 (all wins).
   * Returns 0 when totalGrossProfit = 0 (all losses).
   */
  profitFactor: Decimal;
  /**
   * Average holdDurationSec across all trades, in seconds.
   * Plain number (not Decimal) — duration is not a monetary value.
   */
  avgHoldDuration: number;
  /** Longest consecutive WIN streak. */
  maxConsecutiveWins: Decimal;
  /** Longest consecutive LOSS / TIME_EXIT streak. */
  maxConsecutiveLosses: Decimal;
};

/** All basic + advanced metrics combined. */
export type FullMetrics = BasicMetrics & AdvancedMetrics;

// ---------------------------------------------------------------------------
// calcAdvancedMetrics
// ---------------------------------------------------------------------------

/**
 * Calculates advanced performance metrics from a list of backtest trades.
 *
 * Returns all-zero metrics when the trades array is empty.
 */
export function calcAdvancedMetrics(trades: BacktestTrade[]): AdvancedMetrics {
  const ZERO = d("0");
  const SENTINEL = d("999999");

  if (trades.length === 0) {
    return {
      sharpeRatio: ZERO,
      profitFactor: ZERO,
      avgHoldDuration: 0,
      maxConsecutiveWins: ZERO,
      maxConsecutiveLosses: ZERO,
    };
  }

  // ── Sharpe Ratio ───────────────────────────────────────────────────────────
  // Use per-trade pnlPct as the return series.
  // sharpe = mean(returns) / std(returns) × sqrt(252)
  // Returns 0 when n < 2 or std = 0.

  let sharpeRatio: Decimal;

  if (trades.length < 2) {
    sharpeRatio = ZERO;
  } else {
    const n = d(String(trades.length));
    // mean
    let sum = ZERO;
    for (const trade of trades) {
      sum = sum.plus(trade.pnlPct);
    }
    const mean = sum.dividedBy(n);

    // population std (dividing by n, not n-1, is acceptable for this use)
    let varianceSum = ZERO;
    for (const trade of trades) {
      const diff = trade.pnlPct.minus(mean);
      varianceSum = varianceSum.plus(diff.times(diff));
    }
    const variance = varianceSum.dividedBy(n);
    const std = variance.sqrt();

    if (std.isZero()) {
      sharpeRatio = ZERO;
    } else {
      const sqrt252 = d(String(Math.sqrt(252)));
      sharpeRatio = mean.dividedBy(std).times(sqrt252);
    }
  }

  // ── Profit Factor ──────────────────────────────────────────────────────────

  let totalGrossProfit = ZERO;
  let totalGrossLoss = ZERO;

  for (const trade of trades) {
    if (trade.result === "WIN") {
      totalGrossProfit = totalGrossProfit.plus(trade.pnl);
    } else {
      totalGrossLoss = totalGrossLoss.plus(trade.pnl.abs());
    }
  }

  let profitFactor: Decimal;

  if (totalGrossProfit.isZero()) {
    profitFactor = ZERO;
  } else if (totalGrossLoss.isZero()) {
    profitFactor = SENTINEL;
  } else {
    profitFactor = totalGrossProfit.dividedBy(totalGrossLoss);
  }

  // ── avgHoldDuration ────────────────────────────────────────────────────────

  let totalDuration = 0;
  for (const trade of trades) {
    totalDuration += trade.holdDurationSec;
  }
  const avgHoldDuration = totalDuration / trades.length;

  // ── Consecutive win / loss streaks ─────────────────────────────────────────

  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;

  for (const trade of trades) {
    if (trade.result === "WIN") {
      currentWins += 1;
      currentLosses = 0;
      if (currentWins > maxConsecutiveWins) {
        maxConsecutiveWins = currentWins;
      }
    } else {
      currentLosses += 1;
      currentWins = 0;
      if (currentLosses > maxConsecutiveLosses) {
        maxConsecutiveLosses = currentLosses;
      }
    }
  }

  return {
    sharpeRatio,
    profitFactor,
    avgHoldDuration,
    maxConsecutiveWins: d(String(maxConsecutiveWins)),
    maxConsecutiveLosses: d(String(maxConsecutiveLosses)),
  };
}

// ---------------------------------------------------------------------------
// calcFullMetrics
// ---------------------------------------------------------------------------

/**
 * Calculates both BasicMetrics and AdvancedMetrics in a single pass.
 */
export function calcFullMetrics(trades: BacktestTrade[]): FullMetrics {
  return {
    ...calcBasicMetrics(trades),
    ...calcAdvancedMetrics(trades),
  };
}

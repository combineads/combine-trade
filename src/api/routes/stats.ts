/**
 * Stats route — GET /stats, GET /stats/trades
 *
 * Returns performance statistics for CLOSED tickets.
 * Query params:
 *   ?period=today|7d|30d|all  (default: all)
 *
 * Layer: L8 (api) — route handler only, no DB access.
 */

import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Stats result from the DI query function. All numerics as strings. */
export type StatsResult = {
  total_pnl: string;
  total_trades: number;
  win_count: number;
  loss_count: number;
  win_rate: string | null;
  avg_risk_reward: string;
  mdd: string;
  /** 수수료 차감 후 기대값 (per-trade basis, pnl_pct 단위) */
  expectancy: string;
  /** 최대 연속 손실 횟수 */
  max_consecutive_losses: number;
};

/** Dependency injection interface for the stats route. */
export type StatsDeps = {
  getStats(period: "today" | "7d" | "30d" | "all"): Promise<StatsResult>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PERIODS = new Set(["today", "7d", "30d", "all"]);

// ---------------------------------------------------------------------------
// Pure calculation functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * 승률 계산.
 * @param winCount - 이긴 거래 수
 * @param totalTrades - 전체 거래 수
 * @returns 백분율 (0~100)
 */
export function calcWinRate(winCount: number, totalTrades: number): number {
  if (totalTrades === 0) return 0;
  return (winCount / totalTrades) * 100;
}

/**
 * 최대 연속 손실 횟수 계산.
 * TIME_EXIT은 LOSS로 취급한다.
 * @param results - 결과 배열 (가장 오래된 것부터 최근 순)
 * @returns 최대 연속 손실 횟수
 */
export function calcMaxConsecutiveLosses(results: Array<"WIN" | "LOSS" | "TIME_EXIT">): number {
  let maxStreak = 0;
  let currentStreak = 0;
  for (const result of results) {
    if (result === "LOSS" || result === "TIME_EXIT") {
      currentStreak += 1;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
    } else {
      currentStreak = 0;
    }
  }
  return maxStreak;
}

/**
 * 수수료 차감 후 기대값 계산.
 * expectancy = avg(pnl_pct) - commissionPct
 * @param pnlPcts - 각 거래의 pnl_pct 값 배열 (소수 형태, 예: 0.01 = 1%)
 * @param commissionPct - 왕복 수수료율 (예: 0.0008 = 0.08%)
 * @returns 기대값 (소수 형태)
 */
export function calcExpectancy(pnlPcts: number[], commissionPct: number): number {
  if (pnlPcts.length === 0) return 0;
  const sum = pnlPcts.reduce((acc, v) => acc + v, 0);
  const avgPnlPct = sum / pnlPcts.length;
  return avgPnlPct - commissionPct;
}

/**
 * 최대 낙폭(MDD) 계산 — 퍼센트 기준.
 * 초기 자본 기준이 없으므로 equity curve에서 고점 대비 낙폭을 계산한다.
 * equity curve는 누적 pnl이며 시작점은 0이다.
 * @param pnls - 각 거래의 절대 pnl 값 배열 (USDT 단위)
 * @returns MDD 퍼센트 (음수 또는 0), 예: -15.23
 */
export function calcMdd(pnls: number[]): number {
  if (pnls.length === 0) return 0;

  let peak = 0;
  let equity = 0;
  let mdd = 0;

  for (const pnl of pnls) {
    equity += pnl;
    if (equity > peak) {
      peak = equity;
    }
    if (peak > 0) {
      const drawdown = ((equity - peak) / peak) * 100;
      if (drawdown < mdd) {
        mdd = drawdown;
      }
    } else if (equity < 0) {
      // 고점이 0 이하인 경우 절대 손실로 표현
      if (equity < mdd) {
        mdd = equity;
      }
    }
  }

  return mdd;
}

/**
 * 평균 손익비 계산.
 * avg_profit_loss_ratio = avg(winning pnl) / |avg(losing pnl)|
 * @param winPnls - 이긴 거래의 pnl 값 배열
 * @param lossPnls - 진 거래의 pnl 값 배열
 * @returns 손익비 (양수 또는 0)
 */
export function calcAvgRiskReward(winPnls: number[], lossPnls: number[]): number {
  if (winPnls.length === 0 || lossPnls.length === 0) return 0;
  const avgWin = winPnls.reduce((a, b) => a + b, 0) / winPnls.length;
  const avgLoss = Math.abs(lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length);
  if (avgLoss === 0) return 0;
  return avgWin / avgLoss;
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates the stats sub-router.
 *
 * GET /stats          — aggregate performance statistics for CLOSED tickets.
 * GET /stats/trades   — trade history page performance stats (7-card UI).
 */
export function createStatsRoutes(deps: StatsDeps): Hono {
  const router = new Hono();

  router.get("/stats", async (c) => {
    // ---- Parse & validate query params ----
    const periodParam = c.req.query("period") ?? "all";
    if (!VALID_PERIODS.has(periodParam)) {
      return c.json({ error: "Invalid period" }, 400);
    }
    const period = periodParam as "today" | "7d" | "30d" | "all";

    // ---- Query via DI ----
    const stats = await deps.getStats(period);

    return c.json(stats);
  });

  /**
   * GET /stats/trades
   * 거래 내역 페이지용 7개 성과 카드 데이터를 반환한다.
   * 내부적으로 getStats를 재사용하며, UI에 맞는 camelCase 필드명으로 변환한다.
   */
  router.get("/stats/trades", async (c) => {
    // ---- Parse & validate query params ----
    const periodParam = c.req.query("period") ?? "all";
    if (!VALID_PERIODS.has(periodParam)) {
      return c.json({ error: "Invalid period" }, 400);
    }
    const period = periodParam as "today" | "7d" | "30d" | "all";

    // ---- Query via DI ----
    const stats = await deps.getStats(period);

    // ---- Map to UI-friendly camelCase shape ----
    return c.json({
      totalPnl: stats.total_pnl,
      totalTrades: stats.total_trades,
      winRate: stats.win_rate !== null ? Number(stats.win_rate) : 0,
      avgRiskReward: stats.avg_risk_reward,
      maxDrawdown: stats.mdd,
      expectancy: stats.expectancy,
      maxConsecutiveLosses: stats.max_consecutive_losses,
    });
  });

  return router;
}

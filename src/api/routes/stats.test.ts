/**
 * Stats route — unit tests
 *
 * T-15-014: expectancy, max_consecutive_losses 필드 추가 검증
 *
 * 테스트 시나리오:
 *  - GET /stats → response includes expectancy field (number)
 *  - GET /stats → response includes max_consecutive_losses field (number)
 *  - Stats calculation with 10 wins, 5 losses → correct winrate (66.7%)
 *  - Stats calculation with alternating W/L/L/L/W → max_consecutive_losses = 3
 *  - Stats calculation with commission_pct deducted from expectancy
 *  - Stats with no trades → all fields zero or null
 */

import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { StatsDeps, StatsResult } from "./stats";
import {
  calcAvgRiskReward,
  calcExpectancy,
  calcMaxConsecutiveLosses,
  calcMdd,
  calcWinRate,
  createStatsRoutes,
} from "./stats";

// ---------------------------------------------------------------------------
// 헬퍼 — 테스트용 앱 생성
// ---------------------------------------------------------------------------

function makeApp(result: StatsResult): Hono {
  const deps: StatsDeps = {
    getStats: async (_period) => result,
  };
  const app = new Hono();
  app.route("/", createStatsRoutes(deps));
  return app;
}

// ---------------------------------------------------------------------------
// GET /stats — 응답 필드 검증
// ---------------------------------------------------------------------------

describe("GET /stats — 기본 필드 응답", () => {
  it("expectancy 필드를 포함해야 한다", async () => {
    const app = makeApp({
      total_pnl: "100",
      total_trades: 10,
      win_count: 7,
      loss_count: 3,
      win_rate: "70.0",
      avg_risk_reward: "1.5",
      mdd: "-5.0",
      expectancy: "0.0082",
      max_consecutive_losses: 2,
    });

    const req = new Request("http://localhost/stats");
    const res = await app.fetch(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty("expectancy");
    expect(typeof body.expectancy).toBe("string");
  });

  it("max_consecutive_losses 필드를 포함해야 한다", async () => {
    const app = makeApp({
      total_pnl: "100",
      total_trades: 10,
      win_count: 7,
      loss_count: 3,
      win_rate: "70.0",
      avg_risk_reward: "1.5",
      mdd: "-5.0",
      expectancy: "0.0082",
      max_consecutive_losses: 2,
    });

    const req = new Request("http://localhost/stats");
    const res = await app.fetch(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty("max_consecutive_losses");
    expect(typeof body.max_consecutive_losses).toBe("number");
  });

  it("잘못된 period 파라미터 → 400", async () => {
    const app = makeApp({
      total_pnl: "0",
      total_trades: 0,
      win_count: 0,
      loss_count: 0,
      win_rate: null,
      avg_risk_reward: "0",
      mdd: "0",
      expectancy: "0",
      max_consecutive_losses: 0,
    });

    const req = new Request("http://localhost/stats?period=invalid");
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// calcWinRate — 순수 함수 테스트
// ---------------------------------------------------------------------------

describe("calcWinRate", () => {
  it("10 wins, 5 losses → 66.67%", () => {
    const rate = calcWinRate(10, 15);
    expect(rate.toFixed(2)).toBe("66.67");
  });

  it("0 trades → 0", () => {
    expect(calcWinRate(0, 0)).toBe(0);
  });

  it("전패(0 wins) → 0%", () => {
    expect(calcWinRate(0, 5)).toBe(0);
  });

  it("전승(all wins) → 100%", () => {
    expect(calcWinRate(10, 10)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// calcMaxConsecutiveLosses — 순수 함수 테스트
// ---------------------------------------------------------------------------

describe("calcMaxConsecutiveLosses", () => {
  it("W/L/L/L/W → 최대 연속 손실 3", () => {
    const results: Array<"WIN" | "LOSS" | "TIME_EXIT"> = ["WIN", "LOSS", "LOSS", "LOSS", "WIN"];
    expect(calcMaxConsecutiveLosses(results)).toBe(3);
  });

  it("전승 → 0", () => {
    const results: Array<"WIN" | "LOSS" | "TIME_EXIT"> = ["WIN", "WIN", "WIN"];
    expect(calcMaxConsecutiveLosses(results)).toBe(0);
  });

  it("전패 → 거래 수와 동일", () => {
    const results: Array<"WIN" | "LOSS" | "TIME_EXIT"> = ["LOSS", "LOSS", "LOSS"];
    expect(calcMaxConsecutiveLosses(results)).toBe(3);
  });

  it("빈 배열 → 0", () => {
    expect(calcMaxConsecutiveLosses([])).toBe(0);
  });

  it("TIME_EXIT은 LOSS로 계산", () => {
    const results: Array<"WIN" | "LOSS" | "TIME_EXIT"> = ["LOSS", "TIME_EXIT", "LOSS", "WIN"];
    expect(calcMaxConsecutiveLosses(results)).toBe(3);
  });

  it("L/W/L/L/W/L/L/L/L → 최대 4", () => {
    const results: Array<"WIN" | "LOSS" | "TIME_EXIT"> = [
      "LOSS",
      "WIN",
      "LOSS",
      "LOSS",
      "WIN",
      "LOSS",
      "LOSS",
      "LOSS",
      "LOSS",
    ];
    expect(calcMaxConsecutiveLosses(results)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// calcExpectancy — 순수 함수 테스트
// ---------------------------------------------------------------------------

describe("calcExpectancy — 수수료 차감 후 기대값", () => {
  it("commission_pct를 차감해야 한다", () => {
    // avgPnl = 100 USDT 기준, commissionPct = 0.0008
    // expectancy = avg(pnl_pct) - commissionPct
    // pnl_pct 목록: [0.01, 0.02, -0.005] → avg = 0.00833...
    // expectancy = 0.00833... - 0.0008 = 0.00753...
    const pnlPcts = [0.01, 0.02, -0.005];
    const result = calcExpectancy(pnlPcts, 0.0008);
    const expected = (0.01 + 0.02 - 0.005) / 3 - 0.0008;
    expect(Math.abs(result - expected)).toBeLessThan(1e-10);
  });

  it("빈 배열 → 0", () => {
    expect(calcExpectancy([], 0.0008)).toBe(0);
  });

  it("전패 시 expectancy는 음수", () => {
    const pnlPcts = [-0.01, -0.02, -0.015];
    const result = calcExpectancy(pnlPcts, 0.0008);
    expect(result).toBeLessThan(0);
  });

  it("commissionPct=0 시 평균 pnl_pct와 동일", () => {
    const pnlPcts = [0.01, 0.02];
    const result = calcExpectancy(pnlPcts, 0);
    expect(result).toBeCloseTo(0.015, 10);
  });
});

// ---------------------------------------------------------------------------
// calcMdd — 순수 함수 테스트
// ---------------------------------------------------------------------------

describe("calcMdd — 최대 낙폭", () => {
  it("지속적인 상승 시 MDD=0", () => {
    const pnls = [10, 20, 30, 40];
    expect(calcMdd(pnls)).toBe(0);
  });

  it("고점 이후 하락 → MDD 계산", () => {
    // equity: 0, 10, 20, 10, 0 → 고점 20에서 0까지 = -100%
    const pnls = [10, 10, -10, -10];
    const mdd = calcMdd(pnls);
    expect(mdd).toBeLessThan(0);
  });

  it("빈 배열 → 0", () => {
    expect(calcMdd([])).toBe(0);
  });

  it("단일 손실 → 올바른 MDD", () => {
    // equity: 0, -5 → MDD = -5/기준 (기준이 0이면 퍼센트 계산 불가능하므로 절대값)
    const pnls = [-5];
    const mdd = calcMdd(pnls);
    expect(mdd).toBeLessThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// calcAvgRiskReward — 순수 함수 테스트
// ---------------------------------------------------------------------------

describe("calcAvgRiskReward", () => {
  it("wins=[], losses=[] → 0", () => {
    expect(calcAvgRiskReward([], [])).toBe(0);
  });

  it("이기면 10, 지면 -5 → 손익비 2.0", () => {
    const result = calcAvgRiskReward([10, 10], [-5, -5]);
    expect(result).toBeCloseTo(2.0, 5);
  });

  it("손실 없을 때 → 0 (손익비 계산 불가)", () => {
    const result = calcAvgRiskReward([10, 20], []);
    expect(result).toBe(0);
  });
});

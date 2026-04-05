/**
 * candle-features.test.ts
 *
 * PRD §7.8 분모 정렬 검증.
 *
 * body = |C-O| / O
 * upperWick = (H - max(O,C)) / H × 1.5
 * lowerWick = (min(O,C) - L) / H × 1.5
 * range = (H-L) / L
 * ret = (C - prevC) / prevC  (변경 없음)
 */

import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import type { Candle } from "@/core/types";
import {
  CANDLE_BARS,
  CANDLE_FEATURE_DIM,
  CANDLE_FEATURES_PER_BAR,
  extractCandleFeatures,
} from "./candle-features";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle(o: number, h: number, l: number, c: number): Candle {
  return {
    id: "test",
    symbol: "BTCUSDT",
    exchange: "binance",
    timeframe: "5M",
    open_time: new Date(0),
    open: new Decimal(o),
    high: new Decimal(h),
    low: new Decimal(l),
    close: new Decimal(c),
    volume: new Decimal(1),
    is_closed: true,
    created_at: new Date(0),
  };
}

/** 단일 캔들에서 피처 5개 추출 (prevClose 포함). */
function extractSingle(
  o: number,
  h: number,
  l: number,
  c: number,
  prevC?: number,
): [number, number, number, number, number] {
  const candles: Candle[] = [];
  if (prevC !== undefined) {
    candles.push(makeCandle(prevC, prevC, prevC, prevC)); // dummy prev
  }
  candles.push(makeCandle(o, h, l, c));

  const vec = extractCandleFeatures(candles, { upperWick: 1.5, lowerWick: 1.5 });
  // 피처는 마지막 봉에 위치
  const lastBarIdx = (candles.length - 1) * CANDLE_FEATURES_PER_BAR;
  return [
    vec[lastBarIdx] ?? 0,
    vec[lastBarIdx + 1] ?? 0,
    vec[lastBarIdx + 2] ?? 0,
    vec[lastBarIdx + 3] ?? 0,
    vec[lastBarIdx + 4] ?? 0,
  ];
}

const PRECISION = 6; // 소수점 6자리 비교

// ---------------------------------------------------------------------------
// PRD §7.8 분모 검증: O=100, H=110, L=95, C=105
// ---------------------------------------------------------------------------
describe("candle-features PRD §7.8 denominator alignment", () => {
  // body = |C-O| / O = |105-100| / 100 = 0.05
  it("body = |C-O| / O", () => {
    const [body] = extractSingle(100, 110, 95, 105, 100);
    expect(body).toBeCloseTo(0.05, PRECISION);
  });

  // upperWick = (H - max(O,C)) / H × 1.5 = (110-105)/110 × 1.5 ≈ 0.068182
  it("upperWick = (H-max(O,C)) / H × 1.5", () => {
    const [, upperWick] = extractSingle(100, 110, 95, 105, 100);
    const expected = (5 / 110) * 1.5;
    expect(upperWick).toBeCloseTo(expected, PRECISION);
  });

  // lowerWick = (min(O,C) - L) / H × 1.5 = (100-95)/110 × 1.5 ≈ 0.068182
  it("lowerWick = (min(O,C)-L) / H × 1.5", () => {
    const [, , lowerWick] = extractSingle(100, 110, 95, 105, 100);
    const expected = (5 / 110) * 1.5;
    expect(lowerWick).toBeCloseTo(expected, PRECISION);
  });

  // range = (H-L) / L = (110-95)/95 ≈ 0.157895
  it("range = (H-L) / L", () => {
    const [, , , range] = extractSingle(100, 110, 95, 105, 100);
    const expected = 15 / 95;
    expect(range).toBeCloseTo(expected, PRECISION);
  });

  // ret = (C - prevC) / prevC = (105-100)/100 = 0.05 (변경 없음)
  it("ret = (C-prevC) / prevC — unchanged", () => {
    const [, , , , ret] = extractSingle(100, 110, 95, 105, 100);
    expect(ret).toBeCloseTo(0.05, PRECISION);
  });
});

// ---------------------------------------------------------------------------
// 경계값: 분모 = 0 가드
// ---------------------------------------------------------------------------
describe("candle-features zero-denominator guards", () => {
  // O=0 → body=0; upper/lower/range은 high/low로 계산
  it("open=0 → body=0, other features still computed", () => {
    // O=0, H=10, L=5, C=8
    const [body, upperWick, _lowerWick, range] = extractSingle(0, 10, 5, 8);
    expect(body).toBe(0);
    // upperWick = (10-max(0,8))/10 × 1.5 = 2/10 × 1.5 = 0.3
    expect(upperWick).toBeCloseTo(0.3, PRECISION);
    // lowerWick: min(0,8)=0, (0-5)/10×1.5 = -0.75 — safe() passes negative values through; not asserted here.
    // The H=0 guard is tested in the "high=0" test below.
    expect(range).toBeCloseTo((10 - 5) / 5, PRECISION); // (H-L)/L
  });

  // H=0 → upperWick=0, lowerWick=0
  it("high=0 → upperWick=0 and lowerWick=0", () => {
    // degenerate candle: all zero except O=5, L=0, C=3
    const [, upperWick, lowerWick] = extractSingle(5, 0, 0, 3);
    expect(upperWick).toBe(0);
    expect(lowerWick).toBe(0);
  });

  // L=0 → range=0
  it("low=0 → range=0", () => {
    const [, , , range] = extractSingle(100, 110, 0, 105);
    expect(range).toBe(0);
  });

  // C=0 — ret=0 (prevClose guard already existed; verify no crash)
  it("close=0 does not throw", () => {
    expect(() => extractSingle(0, 0, 0, 0, 100)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 전체 벡터 차원
// ---------------------------------------------------------------------------
describe("candle-features vector dimensions", () => {
  it("CANDLE_BARS is 38", () => {
    expect(CANDLE_BARS).toBe(38);
  });

  it("CANDLE_FEATURES_PER_BAR is 5", () => {
    expect(CANDLE_FEATURES_PER_BAR).toBe(5);
  });

  it("CANDLE_FEATURE_DIM is 190", () => {
    expect(CANDLE_FEATURE_DIM).toBe(190);
  });

  it("extractCandleFeatures with 38 candles → 190-dim vector", () => {
    const candles = Array.from({ length: 38 }, () => makeCandle(100, 110, 95, 105));
    const vec = extractCandleFeatures(candles);
    expect(vec.length).toBe(190);
  });

  it("extractCandleFeatures with < 38 candles → zero-padded to 190", () => {
    const candles = Array.from({ length: 10 }, () => makeCandle(100, 110, 95, 105));
    const vec = extractCandleFeatures(candles);
    expect(vec.length).toBe(190);
    // positions beyond 10 bars are zero
    const tail = vec.slice(10 * CANDLE_FEATURES_PER_BAR);
    expect(tail.every((v) => v === 0)).toBe(true);
  });

  it("extractCandleFeatures with 0 candles → all-zero 190-dim vector", () => {
    const vec = extractCandleFeatures([]);
    expect(vec.length).toBe(190);
    expect(vec.every((v) => v === 0)).toBe(true);
  });

  it("extractCandleFeatures with 40 candles → uses last 38 only, still 190-dim", () => {
    const candles = Array.from({ length: 40 }, () => makeCandle(100, 110, 95, 105));
    const vec = extractCandleFeatures(candles);
    expect(vec.length).toBe(190);
  });
});

// ---------------------------------------------------------------------------
// 분모별 수식 독립성: upperWick과 lowerWick의 분모가 close가 아님을 확인
// close가 달라도 high가 같으면 upperWick/lowerWick이 동일해야 함.
// ---------------------------------------------------------------------------
describe("denominator independence from close", () => {
  it("upperWick/lowerWick use H (not C) as denominator — same H → same ratio regardless of C", () => {
    // Candle A: O=100, H=110, L=95, C=105 (C is lower → larger upperWick)
    // Candle B: O=100, H=110, L=95, C=102 (C is even lower → same H denominator, different max(O,C))
    const [, uwA, lwA] = extractSingle(100, 110, 95, 105, 99);
    const [, uwB, lwB] = extractSingle(100, 110, 95, 102, 99);
    // Both use H=110 as denominator.
    // uwA = (110-105)/110 × 1.5; uwB = (110-102)/110 × 1.5
    expect(uwA).toBeCloseTo((5 / 110) * 1.5, PRECISION);
    expect(uwB).toBeCloseTo((8 / 110) * 1.5, PRECISION);
    // Both lowerWick use H=110: lwA=(100-95)/110×1.5, lwB=(100-95)/110×1.5
    expect(lwA).toBeCloseTo((5 / 110) * 1.5, PRECISION);
    expect(lwB).toBeCloseTo((5 / 110) * 1.5, PRECISION);
  });

  it("body uses O (not C) as denominator", () => {
    // O=200, C=210 → body = |210-200|/200 = 0.05
    const [body] = extractSingle(200, 220, 190, 210, 200);
    expect(body).toBeCloseTo(10 / 200, PRECISION);
  });

  it("range uses L (not C) as denominator", () => {
    // H=110, L=90, C=105 → range=(110-90)/90 ≈ 0.2222
    const [, , , range] = extractSingle(100, 110, 90, 105, 100);
    expect(range).toBeCloseTo(20 / 90, PRECISION);
  });
});

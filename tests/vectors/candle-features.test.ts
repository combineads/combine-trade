import { describe, expect, it } from "bun:test";
import { d } from "../../src/core/decimal";
import type { Candle } from "../../src/core/types";
import { extractCandleFeatures } from "../../src/vectors/candle-features";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCandle(
  open: number,
  high: number,
  low: number,
  close: number,
  index: number,
): Candle {
  return {
    id: crypto.randomUUID(),
    symbol: "BTCUSDT",
    exchange: "binance" as const,
    timeframe: "5M" as const,
    open_time: new Date(Date.now() - index * 300_000),
    open: d(open.toString()),
    high: d(high.toString()),
    low: d(low.toString()),
    close: d(close.toString()),
    volume: d("1000"),
    is_closed: true,
    created_at: new Date(),
  };
}

/**
 * 38개 캔들을 생성 (newest-last).
 * index 0 = 가장 오래된 캔들, index 37 = 가장 최근 캔들.
 */
function make38Candles(): Candle[] {
  return Array.from({ length: 38 }, (_, i) => {
    const close = 100 + i; // 100, 101, ..., 137
    const open = close - 1; // 항상 양봉
    const high = close + 2;
    const low = open - 1;
    return makeCandle(open, high, low, close, 37 - i);
  });
}

// ---------------------------------------------------------------------------
// Test Scenarios
// ---------------------------------------------------------------------------

describe("candle-features", () => {
  describe("output dimension", () => {
    it("extractCandleFeatures() with 38 candles → returns 190-element array", () => {
      const candles = make38Candles();
      const result = extractCandleFeatures(candles);
      expect(result).toHaveLength(190);
    });

    it("extractCandleFeatures() with empty array → returns 190 zeros", () => {
      const result = extractCandleFeatures([]);
      expect(result).toHaveLength(190);
      expect(result.every((v) => v === 0)).toBe(true);
    });

    it("extractCandleFeatures() with 20 candles → last 18 bars padded with 0.0 (90 zeros)", () => {
      // 20개 캔들 → bar[0..19] 유효, bar[20..37] = 0 패딩
      // 패딩 영역: 18봉 × 5피처 = 90
      const candles = Array.from({ length: 20 }, (_, i) => {
        const close = 100 + i;
        const open = close - 1;
        const high = close + 2;
        const low = open - 1;
        return makeCandle(open, high, low, close, 19 - i);
      });
      const result = extractCandleFeatures(candles);
      expect(result).toHaveLength(190);
      // 마지막 90개 (bar[20..37]) = 0
      const padded = result.slice(100); // index 100 = bar[20] 시작
      expect(padded.every((v) => v === 0)).toBe(true);
    });
  });

  describe("feature order and index layout", () => {
    it("extractCandleFeatures() with 38 candles → index 0-4 are bar[0] features in order (body, upperWick, lowerWick, range, ret)", () => {
      const candles = make38Candles();
      const result = extractCandleFeatures(candles);

      // bar[0] = candles[0] (가장 오래된 캔들)
      // open=99, high=101, low=98, close=100
      const c = candles[0]!;
      const open = c.open.toNumber();
      const high = c.high.toNumber();
      const low = c.low.toNumber();
      const close = c.close.toNumber();

      // NEW PRD §7.8 L275 denominators:
      // body = |close - open| / open   [분모: O]
      const expectedBody = Math.abs(close - open) / open;
      // upperWick = (high - max(open, close)) / high × 1.5 (weight applied)  [분모: H]
      const expectedUpperWick = ((high - Math.max(open, close)) / high) * 1.5;
      // lowerWick = (min(open, close) - low) / high × 1.5 (weight applied)  [분모: H]
      const expectedLowerWick = ((Math.min(open, close) - low) / high) * 1.5;
      // range = (high - low) / low   [분모: L]
      const expectedRange = (high - low) / low;
      // ret for bar[0] = 0 (이전 캔들 없음)
      const expectedRet = 0;

      expect(result[0]).toBeCloseTo(expectedBody, 8);
      expect(result[1]).toBeCloseTo(expectedUpperWick, 8);
      expect(result[2]).toBeCloseTo(expectedLowerWick, 8);
      expect(result[3]).toBeCloseTo(expectedRange, 8);
      expect(result[4]).toBe(expectedRet);
    });

    it("extractCandleFeatures() → bar[1] features at indices 5-9", () => {
      const candles = make38Candles();
      const result = extractCandleFeatures(candles);

      // bar[1] = candles[1], open=100, high=102, low=99, close=101
      const c1 = candles[1]!;
      const c0 = candles[0]!;
      const open = c1.open.toNumber();
      const high = c1.high.toNumber();
      const low = c1.low.toNumber();
      const close = c1.close.toNumber();
      const prevClose = c0.close.toNumber();

      // NEW PRD §7.8 L275 denominators:
      // body = |close - open| / open   [분모: O]
      const expectedBody = Math.abs(close - open) / open;
      // range = (high - low) / low   [분모: L]
      const expectedRange = (high - low) / low;
      const expectedRet = (close - prevClose) / prevClose;

      expect(result[5]).toBeCloseTo(expectedBody, 8);
      expect(result[8]).toBeCloseTo(expectedRange, 8);
      expect(result[9]).toBeCloseTo(expectedRet, 8);
    });
  });

  describe("special candle shapes", () => {
    it("doji candle (open === close) → body=0, wicks calculated correctly", () => {
      const dojiClose = 100;
      const dojiOpen = 100; // open === close
      const dojiHigh = 105;
      const dojiLow = 95;

      // doji를 bar[1]에 배치 (bar[0]은 이전 캔들)
      const prevCandle = makeCandle(98, 102, 97, 99, 1);
      const dojiCandle = makeCandle(dojiOpen, dojiHigh, dojiLow, dojiClose, 0);
      const candles = [prevCandle, dojiCandle];

      const result = extractCandleFeatures(candles);

      // bar[0] = prevCandle (index 0), bar[1] = dojiCandle (index 1)
      // doji는 bar[1] → indices 5-9
      const body = result[5]!;
      const upperWick = result[6]!; // 가중치 적용 전 값
      const lowerWick = result[7]!;

      // body = |100 - 100| / open(100) = 0
      expect(body).toBe(0);

      // NEW PRD §7.8 L275 denominators:
      // upperWick raw = (105 - max(100,100)) / high(105) = 5/105
      // 가중치 1.5 적용 → 5/105 * 1.5
      const expectedUpperWick = (5 / dojiHigh) * 1.5;
      expect(upperWick).toBeCloseTo(expectedUpperWick, 8);

      // lowerWick raw = (min(100,100) - 95) / high(105) = 5/105
      // 가중치 1.5 적용 → 5/105 * 1.5
      const expectedLowerWick = (5 / dojiHigh) * 1.5;
      expect(lowerWick).toBeCloseTo(expectedLowerWick, 8);
    });

    it("marubozu bullish (high===close, low===open) → upperWick=0, lowerWick=0", () => {
      const close = 105;
      const open = 100;
      const high = close; // high === close → upperWick = 0
      const low = open; // low === open → lowerWick = 0

      const marubozuCandle = makeCandle(open, high, low, close, 0);
      const result = extractCandleFeatures([marubozuCandle]);

      // bar[0] → indices 0-4
      // upperWick raw = (high - max(open,close)) / close = (105 - 105) / 105 = 0, * 1.5 = 0
      expect(result[1]).toBe(0);
      // lowerWick raw = (min(open,close) - low) / close = (100 - 100) / 105 = 0, * 1.5 = 0
      expect(result[2]).toBe(0);
    });
  });

  describe("weight application", () => {
    it("extractCandleFeatures() → upperWick values multiplied by 1.5 weight", () => {
      // 상단 wick이 있는 캔들: open=100, high=110, low=98, close=105
      const c = makeCandle(100, 110, 98, 105, 0);
      const result = extractCandleFeatures([c]);

      // NEW PRD §7.8 L275: upperWick 분모 = H
      // upperWick raw = (110 - max(100,105)) / high(110) = (110 - 105) / 110 = 5/110
      const rawUpperWick = 5 / 110;
      const expectedWithWeight = rawUpperWick * 1.5;

      // bar[0] → index 1 = upperWick
      expect(result[1]).toBeCloseTo(expectedWithWeight, 8);
    });

    it("extractCandleFeatures() → lowerWick values multiplied by 1.5 weight", () => {
      // 하단 wick이 있는 캔들: open=100, high=108, low=90, close=105
      const c = makeCandle(100, 108, 90, 105, 0);
      const result = extractCandleFeatures([c]);

      // NEW PRD §7.8 L275: lowerWick 분모 = H
      // lowerWick raw = (min(100,105) - 90) / high(108) = (100 - 90) / 108 = 10/108
      const rawLowerWick = 10 / 108;
      const expectedWithWeight = rawLowerWick * 1.5;

      // bar[0] → index 2 = lowerWick
      expect(result[2]).toBeCloseTo(expectedWithWeight, 8);
    });

    it("extractCandleFeatures() with custom weights → upperWick uses provided weight", () => {
      const c = makeCandle(100, 110, 98, 105, 0);
      const customWeights = { upperWick: 2.0, lowerWick: 1.0 };
      const result = extractCandleFeatures([c], customWeights);

      // NEW PRD §7.8 L275: upperWick 분모 = H
      // upperWick raw = (110 - max(100,105)) / high(110) = 5/110
      const rawUpperWick = 5 / 110;
      const expectedWithWeight = rawUpperWick * 2.0;

      expect(result[1]).toBeCloseTo(expectedWithWeight, 8);
    });
  });

  describe("ret (return) calculation", () => {
    it("bar[0] ret = 0 (no previous candle)", () => {
      const candles = make38Candles();
      const result = extractCandleFeatures(candles);
      // bar[0] → index 4 = ret
      expect(result[4]).toBe(0);
    });

    it("bar[1] ret = (close[1] - close[0]) / close[0]", () => {
      const candles = make38Candles();
      const result = extractCandleFeatures(candles);

      const close0 = candles[0]!.close.toNumber(); // 100
      const close1 = candles[1]!.close.toNumber(); // 101
      const expectedRet = (close1 - close0) / close0;

      // bar[1] → index 9 = ret
      expect(result[9]).toBeCloseTo(expectedRet, 8);
    });
  });

  describe("all values are finite numbers", () => {
    it("returns only finite numbers for valid candles", () => {
      const candles = make38Candles();
      const result = extractCandleFeatures(candles);
      expect(result.every((v) => Number.isFinite(v))).toBe(true);
    });
  });
});

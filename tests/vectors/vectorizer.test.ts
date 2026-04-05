/**
 * vectorizer.ts 통합 테스트
 *
 * 새 레이아웃:
 *   인덱스 0-189:  캔들 피처 (38봉 × 5)
 *   인덱스 190-201: 전략 피처 (12개)
 *
 * T-15-006 태스크 기준 테스트 시나리오:
 *   1. vectorize() with 38 candles + valid indicators → Float32Array of length 202
 *   2. vectorize() → all values are finite (no NaN/Infinity)
 *   3. vectorize() → indices 0-189 are candle features, 190-201 are strategy features
 *   4. vectorize() with minimal candles (< 38) → still returns 202-dim vector (padded)
 *   5. vectorize() with null indicators → strategy features are 0.0, candle features normal
 *   6. vectorize() signature matches (Candle[], AllIndicators, VectorTimeframe) => Float32Array
 */

import { describe, expect, it } from "bun:test";
import { d } from "../../src/core/decimal";
import type { Candle } from "../../src/core/types";
import { calcAllIndicators } from "../../src/indicators/index";
import type { AllIndicators } from "../../src/indicators/types";
import { VECTOR_DIM } from "../../src/vectors/feature-spec";
import { vectorize } from "../../src/vectors/vectorizer";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCandle(close: number, index: number, openTime?: Date): Candle {
  const high = close * 1.005;
  const low = close * 0.995;
  const open = close * 0.999;
  return {
    id: crypto.randomUUID(),
    symbol: "BTCUSDT",
    exchange: "binance" as const,
    timeframe: "5M" as const,
    open_time: openTime ?? new Date(Date.now() - index * 300_000),
    open: d(open.toFixed(4)),
    high: d(high.toFixed(4)),
    low: d(low.toFixed(4)),
    close: d(close.toString()),
    volume: d("1000"),
    is_closed: true,
    created_at: new Date(),
  };
}

/** Create N candles with a slight uptrend, newest last. */
function makeCandles(count: number, baseClose = 85000): Candle[] {
  return Array.from({ length: count }, (_, i) => makeCandle(baseClose + i * 10, count - 1 - i));
}

/** Build a complete AllIndicators with all-null state. */
function nullIndicators(): AllIndicators {
  return {
    bb20: null,
    bb4: null,
    bb4_1h: null,
    sma20: null,
    prevSma20: null,
    sma20_5m: null,
    sma60: null,
    sma120: null,
    ema20: null,
    ema60: null,
    ema120: null,
    rsi14: null,
    atr14: null,
    squeeze: "normal",
  };
}

// ---------------------------------------------------------------------------
// 시나리오 1: 기본 차원 및 타입
// ---------------------------------------------------------------------------

describe("vectorizer", () => {
  it("T-15-006-S1: 38개 이상 캔들 + 유효 지표 → Float32Array(202)", () => {
    const candles = makeCandles(38);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(202);
    expect(vec.length).toBe(VECTOR_DIM);
  });

  it("T-15-006-S1b: 120개 캔들 → Float32Array(202)", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(VECTOR_DIM);
  });

  it("T-15-006-S1c: 1M 타임프레임 → Float32Array(202)", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "1M");

    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(VECTOR_DIM);
  });

  // ---------------------------------------------------------------------------
  // 시나리오 4: 캔들 < 38 → 패딩
  // ---------------------------------------------------------------------------

  it("T-15-006-S4: 5개 캔들(< 38) → Float32Array(202) (패딩)", () => {
    const candles = makeCandles(5);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(VECTOR_DIM);
  });

  it("T-15-006-S4b: 빈 캔들 → Float32Array(202) (전체 0 패딩)", () => {
    const indicators = nullIndicators();
    const vec = vectorize([], indicators, "5M");

    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(VECTOR_DIM);
  });

  // ---------------------------------------------------------------------------
  // 시나리오 2: 모든 값이 유한함
  // ---------------------------------------------------------------------------

  it("T-15-006-S2: 충분한 캔들 + 유효 지표 → 모든 값 유한", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    for (let i = 0; i < vec.length; i++) {
      const v = vec[i] ?? 0;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("T-15-006-S2b: null 지표 + 캔들 → 모든 값 유한", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    for (let i = 0; i < vec.length; i++) {
      const v = vec[i] ?? 0;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("T-15-006-S2c: 빈 캔들 + null 지표 → 모든 값 유한", () => {
    const indicators = nullIndicators();
    const vec = vectorize([], indicators, "5M");

    for (let i = 0; i < vec.length; i++) {
      const v = vec[i] ?? 0;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // 시나리오 3: 인덱스 레이아웃 검증
  // ---------------------------------------------------------------------------

  it("T-15-006-S3: 인덱스 0-189 = 캔들 피처 (비-NaN), 190-201 = 전략 피처", () => {
    const candles = makeCandles(38);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    // 0-189: candle features — 모두 유한
    for (let i = 0; i < 190; i++) {
      expect(Number.isFinite(vec[i] ?? NaN)).toBe(true);
    }
    // 190-201: strategy features — 모두 유한
    for (let i = 190; i <= 201; i++) {
      expect(Number.isFinite(vec[i] ?? NaN)).toBe(true);
    }
  });

  it("T-15-006-S3b: 캔들 피처 레이아웃 — bar[37](마지막 봉) body > 0 with non-flat candles", () => {
    // bar[37] = 가장 최근 봉 (38번째), indices 37*5=185 to 189
    // close ≠ open → body > 0 (makeCandle: open = close*0.999)
    const candles = makeCandles(38, 85000);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    // bar[37].body = index 185
    const body = vec[185] ?? 0;
    expect(body).toBeGreaterThan(0); // open ≠ close → body > 0
  });

  it("T-15-006-S3c: 캔들 피처 레이아웃 — bar[37] range = (high-low)/close > 0", () => {
    // range = index 185+3 = 188
    const candles = makeCandles(38, 85000);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    const range = vec[188] ?? 0;
    expect(range).toBeGreaterThan(0); // high > low → range > 0
  });

  it("T-15-006-S3d: 38개 미만 캔들 → 뒷부분 bar indices = 0 (패딩)", () => {
    // candle-features.ts 패딩 규칙: candles[0]→bar[0], ..., candles[k]→bar[k]
    // 5개 캔들 → bar[0..4]에 데이터, bar[5..37]은 0 패딩 (뒤쪽 패딩)
    const candles = makeCandles(5, 85000);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    // bar[0] body (index 0) > 0 (데이터 있음 — 첫 번째 캔들, open≠close)
    const bar0Body = vec[0] ?? 0;
    expect(bar0Body).toBeGreaterThan(0);

    // bar[5] body (index 25) = 0 (패딩 영역)
    expect(vec[25]).toBe(0);
    // bar[37] body (index 185) = 0 (패딩 영역)
    expect(vec[185]).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 시나리오 5: null 지표 → 전략 피처 = 0
  // ---------------------------------------------------------------------------

  it("T-15-006-S5: null 지표 → 전략 피처(190-201) 모두 0", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    // null bb20, bb4, sma, atr, rsi → strategy features = 0
    // [190] bb20_pos: bb20=null → 0 (default)
    // [191] bb4_pos: bb4=null → 0 (default)
    // [192] ma_ordering: sma null → 0 (default)
    // [193] ma20_slope: prevSma20 null → 0 (default)
    // [194] atr_separation: atr null → 0 (default)
    // [195] pivot_distance: atr null → 0 (default)
    // [196] rsi_normalized: rsi null → 0 (default)
    // [197] rsi_extreme_count: rsi null → 0 (default, isExtreme=0 → 0/14=0)
    // [198] breakout_intensity: bb20=null → 0 (default)
    // [199] disparity_divergence: bb20=null → 0 (default)
    // [200] daily_open_distance: atr null → 0 (default, no symbolState)
    // [201] session_box_position: no symbolState → 0 (default)
    for (let i = 190; i <= 201; i++) {
      expect(vec[i]).toBe(0);
    }
  });

  it("T-15-006-S5b: null 지표 + 5개 캔들 → candle 피처(0-4 번 bar) 정상 계산", () => {
    // candle-features.ts 패딩 규칙: 5개 캔들 → bar[0..4]에 데이터
    const candles = makeCandles(5, 85000);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    // bar[4](마지막 데이터 봉).range = index 4*5+3 = 23
    const rangeOfBar4 = vec[23] ?? 0;
    expect(rangeOfBar4).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 전략 피처 세부 검증 (인덱스 190-201)
  // ---------------------------------------------------------------------------

  it("strategy features 190-201 모두 유한 with sufficient candles", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    for (let i = 190; i <= 201; i++) {
      expect(Number.isFinite(vec[i] ?? NaN)).toBe(true);
    }
  });

  it("bb20_pos (index 190): bb20=null → 0", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[190]).toBe(0);
  });

  it("bb20_pos (index 190): close at band middle → near 0 (mapped to [-1,1])", () => {
    const lower = 84000;
    const upper = 86000;
    const width = upper - lower;
    const middle = lower + width / 2; // 85000

    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d(upper.toString()),
        middle: d(middle.toString()),
        lower: d(lower.toString()),
        bandwidth: d("0"),
        percentB: d("0.5"), // %B = 0.5 → mapped = (0.5 * 2) - 1 = 0
      },
    };
    const candles = makeCandles(5, middle);
    const vec = vectorize(candles, indicators, "5M");

    const bb20Pos = vec[190] ?? -999;
    // (0.5 * 2) - 1 = 0.0
    expect(bb20Pos).toBeCloseTo(0.0, 5);
  });

  it("bb4_pos (index 191): bb4=null → 0", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[191]).toBe(0);
  });

  it("bb4_pos (index 191): full bb4 width (percentB=1.0) → (1.0*2)-1=1.0 × weight_bb4(2.0) = 2.0", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb4: {
        upper: d("86000"),
        middle: d("85000"),
        lower: d("84000"),
        bandwidth: d("0"),
        percentB: d("1.0"), // %B = 1.0 → mapped = (1.0*2)-1 = 1.0, then ×2.0 = 2.0
      },
    };
    const candles = makeCandles(5, 86000);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[191]).toBeCloseTo(2.0, 5);
  });

  it("ma_ordering (index 192): sma20>sma60>sma120 → 1", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      sma20: d("86000"),
      sma60: d("85000"),
      sma120: d("84000"),
    };
    const candles = makeCandles(5);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[192]).toBe(1);
  });

  it("ma_ordering (index 192): sma20<sma60<sma120 → -1", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      sma20: d("84000"),
      sma60: d("85000"),
      sma120: d("86000"),
    };
    const candles = makeCandles(5);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[192]).toBe(-1);
  });

  it("ma_ordering (index 192): null MA → 0", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[192]).toBe(0);
  });

  it("ma20_slope (index 193): uptrend sma20 → positive", () => {
    const candles = makeCandles(120, 85000);
    const indicators = calcAllIndicators(candles);
    if (indicators.sma20 === null || indicators.prevSma20 === null) return;

    const vec = vectorize(candles, indicators, "5M");
    const slope = vec[193] ?? -999;
    expect(Number.isFinite(slope)).toBe(true);
    expect(slope).toBeGreaterThan(0);
  });

  it("rsi_normalized (index 196): rsi14=50 → 0.0", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      rsi14: d("50"),
    };
    const candles = makeCandles(5);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[196]).toBeCloseTo(0.0, 10);
  });

  it("rsi_normalized (index 196): rsi14=100 → 1.0", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      rsi14: d("100"),
    };
    const candles = makeCandles(5);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[196]).toBeCloseTo(1.0, 10);
  });

  it("rsi_normalized (index 196): rsi14=0 → -1.0", () => {
    const indicators: AllIndicators = {
      ...nullIndicators(),
      rsi14: d("0"),
    };
    const candles = makeCandles(5);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[196]).toBeCloseTo(-1.0, 10);
  });

  it("breakout_intensity (index 198): close above BB20 upper → positive", () => {
    const lower = 84000;
    const upper = 86000;
    const middle = 85000;
    const closeAbove = 87000;

    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d(upper.toString()),
        middle: d(middle.toString()),
        lower: d(lower.toString()),
        bandwidth: d("2000"),
        percentB: d("1.5"),
      },
    };
    const candle = makeCandle(closeAbove, 0);
    const vec = vectorize([candle], indicators, "5M");

    const bi = vec[198] ?? -999;
    expect(Number.isFinite(bi)).toBe(true);
    // |87000 - 86000| / (86000 - 84000) = 1000/2000 = 0.5
    expect(bi).toBeGreaterThan(0);
    expect(bi).toBeCloseTo(0.5, 4);
  });

  it("breakout_intensity (index 198): close inside BB20 → 0", () => {
    const lower = 84000;
    const upper = 86000;
    const middle = 85000;
    const closeInside = 85000;

    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d(upper.toString()),
        middle: d(middle.toString()),
        lower: d(lower.toString()),
        bandwidth: d("2000"),
        percentB: d("0.5"),
      },
    };
    const candle = makeCandle(closeInside, 0);
    const vec = vectorize([candle], indicators, "5M");

    expect(vec[198]).toBeCloseTo(0, 10);
  });

  it("breakout_intensity (index 198): close below BB20 lower → positive (magnitude only)", () => {
    const lower = 84000;
    const upper = 86000;
    const middle = 85000;
    const closeBelow = 83000;

    const indicators: AllIndicators = {
      ...nullIndicators(),
      bb20: {
        upper: d(upper.toString()),
        middle: d(middle.toString()),
        lower: d(lower.toString()),
        bandwidth: d("2000"),
        percentB: d("-0.5"),
      },
    };
    const candle = makeCandle(closeBelow, 0);
    const vec = vectorize([candle], indicators, "5M");

    const bi = vec[198] ?? -999;
    expect(Number.isFinite(bi)).toBe(true);
    // |83000 - 84000| / (86000 - 84000) = 1000/2000 = 0.5
    expect(bi).toBeGreaterThan(0);
    expect(bi).toBeCloseTo(0.5, 4);
  });

  it("breakout_intensity (index 198): bb20=null → 0", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[198]).toBe(0);
  });

  it("disparity_divergence (index 199): bb4/bb20 모두 null → 0", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[199]).toBe(0);
  });

  it("daily_open_distance (index 200): atr14=null → 0 (no symbolState)", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[200]).toBe(0);
  });

  it("session_box_position (index 201): no symbolState → 0", () => {
    const candles = makeCandles(5);
    const indicators = nullIndicators();
    const vec = vectorize(candles, indicators, "5M");

    expect(vec[201]).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 극단값 & 결정론성
  // ---------------------------------------------------------------------------

  it("극소 가격 → NaN/Infinity 없음", () => {
    const candles = makeCandles(120, 0.000001);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    for (let i = 0; i < vec.length; i++) {
      expect(Number.isFinite(vec[i] ?? NaN)).toBe(true);
    }
  });

  it("극대 가격 → NaN/Infinity 없음", () => {
    const candles = makeCandles(120, 999_999_999);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    for (let i = 0; i < vec.length; i++) {
      expect(Number.isFinite(vec[i] ?? NaN)).toBe(true);
    }
  });

  it("결정론성: 동일 입력 → 동일 출력", () => {
    const candles = makeCandles(120);
    const indicators = calcAllIndicators(candles);

    const vec1 = vectorize(candles, indicators, "5M");
    const vec2 = vectorize(candles, indicators, "5M");

    for (let i = 0; i < vec1.length; i++) {
      expect(vec1[i]).toBe(vec2[i]);
    }
  });

  it("25개 캔들 (20-37 범위) → 202차원, 모든 값 유한", () => {
    const candles = makeCandles(25);
    const indicators = calcAllIndicators(candles);
    const vec = vectorize(candles, indicators, "5M");

    expect(vec.length).toBe(VECTOR_DIM);
    for (let i = 0; i < vec.length; i++) {
      expect(Number.isFinite(vec[i] ?? NaN)).toBe(true);
    }
  });
});

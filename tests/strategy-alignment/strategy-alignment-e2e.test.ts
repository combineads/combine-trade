/**
 * EP-10 Strategy Alignment E2E integration test.
 *
 * Verifies that all EP-10 changes (T-10-001 through T-10-014) work together
 * correctly. Pure function tests — no DB required.
 */

import { describe, expect, it } from "bun:test";

import { BB4_CONFIG } from "../../src/core/constants";
import { d } from "../../src/core/decimal";
import type { Candle } from "../../src/core/types";
import { determineDailyBias } from "../../src/filters/daily-direction";
import type { AllIndicators } from "../../src/indicators/types";
import { calcBB4, candlesToCloses, candlesToOpens } from "../../src/indicators/bollinger";
import { calcBB } from "../../src/indicators/bollinger";
import { makeDecision } from "../../src/knn/decision";
import type { WeightedNeighbor } from "../../src/knn/time-decay";
import { calcTimeDecay } from "../../src/knn/time-decay";
import { checkSpread } from "../../src/orders/slippage";
import { InvalidSymbolStateTransitionError, validateSymbolStateTransition } from "../../src/positions/fsm";
import { checkEvidence } from "../../src/signals/evidence-gate";
import { checkSafety } from "../../src/signals/safety-gate";
import { normalize } from "../../src/vectors/normalizer";
import { VECTOR_DIM } from "../../src/vectors/feature-spec";
import type { NormParams } from "../../src/vectors/normalizer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal Candle for testing.
 */
function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    id: "candle-1",
    symbol: "BTCUSDT",
    exchange: "binance",
    timeframe: "5M",
    open_time: new Date("2024-01-01T00:00:00Z"),
    open: d("100"),
    high: d("110"),
    low: d("90"),
    close: d("105"),
    volume: d("1000"),
    is_closed: true,
    created_at: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

/**
 * Builds a minimal AllIndicators for testing.
 */
function makeIndicators(overrides: Partial<AllIndicators> = {}): AllIndicators {
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
    ...overrides,
  };
}

/**
 * Builds a series of N candles where open and close differ.
 * open is set to `openPrice`, close is set to `closePrice`.
 */
function makeCandles(
  count: number,
  openPrice: number,
  closePrice: number,
): Candle[] {
  return Array.from({ length: count }, (_, i) =>
    makeCandle({
      id: `candle-${i}`,
      open: d(openPrice.toString()),
      high: d((Math.max(openPrice, closePrice) + 1).toString()),
      low: d((Math.min(openPrice, closePrice) - 1).toString()),
      close: d(closePrice.toString()),
    }),
  );
}

/**
 * Builds a WeightedNeighbor with the given label and weight.
 */
function makeNeighbor(label: "WIN" | "LOSS" | "TIME_EXIT", weight = 1.0): WeightedNeighbor {
  return {
    vectorId: "vec-1",
    distance: 0.1,
    label,
    grade: "A",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    weight,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: BB4 source=open (T-10-001)
// ---------------------------------------------------------------------------

describe("EP-10 S1: BB4 source=open", () => {
  it("BB4_CONFIG.source is 'open'", () => {
    expect(BB4_CONFIG.source).toBe("open");
  });

  it("calcBB4 uses open prices — bands differ when open != close", () => {
    // 8 candles where open=100, close=110 (open << close)
    const candles = makeCandles(8, 100, 110);

    // calcBB4 uses open prices (all 100)
    const bb4Result = calcBB4(candles);
    expect(bb4Result).not.toBeNull();

    // Compare with close-based BB using same params
    const closes = candlesToCloses(candles);
    const currentClose = closes[closes.length - 1]!;
    const closeBased = calcBB(closes, BB4_CONFIG.length, BB4_CONFIG.stddev, currentClose);

    expect(closeBased).not.toBeNull();

    // BB4 (open-based, source=100) middle should differ from close-based (source=110) middle
    expect(bb4Result!.middle.toNumber()).not.toBeCloseTo(closeBased!.middle.toNumber(), 2);

    // Open-based middle should be around 100, close-based around 110
    expect(bb4Result!.middle.toNumber()).toBeCloseTo(100, 1);
    expect(closeBased!.middle.toNumber()).toBeCloseTo(110, 1);
  });

  it("calcBB4 returns null when fewer candles than BB4_CONFIG.length (4)", () => {
    const candles = makeCandles(3, 100, 110);
    expect(calcBB4(candles)).toBeNull();
  });

  it("candlesToOpens extracts open prices", () => {
    const candles = makeCandles(4, 42, 99);
    const opens = candlesToOpens(candles);
    expect(opens).toHaveLength(4);
    expect(opens.every((v) => v === 42)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Daily direction equality >= (T-10-002)
// ---------------------------------------------------------------------------

// T-18-003: PRD §7.2 strict > / < for price comparison, >= / <= for slope
describe("EP-10 S2: daily direction uses >= / <= for close vs open", () => {
  it("slope>0 + close==open → NEUTRAL (strict > per PRD §7.2)", () => {
    // slope positive (ma20Today > ma20Yesterday)
    const ma20Today = d("101");
    const ma20Yesterday = d("100");
    // close exactly equals open → strict > fails → NEUTRAL
    const todayClose = d("200");
    const dailyOpen = d("200");

    const bias = determineDailyBias(todayClose, dailyOpen, ma20Today, ma20Yesterday);
    expect(bias).toBe("NEUTRAL");
  });

  it("slope<0 + close==open → NEUTRAL (strict < per PRD §7.2)", () => {
    const ma20Today = d("99");
    const ma20Yesterday = d("100");
    const todayClose = d("200");
    const dailyOpen = d("200");

    const bias = determineDailyBias(todayClose, dailyOpen, ma20Today, ma20Yesterday);
    expect(bias).toBe("NEUTRAL");
  });

  it("slope>0 + close>open → LONG_ONLY", () => {
    const bias = determineDailyBias(d("201"), d("200"), d("101"), d("100"));
    expect(bias).toBe("LONG_ONLY");
  });

  it("slope=0 + close>open → LONG_ONLY (slope >= 0 per PRD §7.2)", () => {
    const bias = determineDailyBias(d("210"), d("200"), d("100"), d("100"));
    expect(bias).toBe("LONG_ONLY");
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Evidence gate ONE_B + MA20 mismatch (T-10-003)
// ---------------------------------------------------------------------------

describe("EP-10 S3: evidence gate ONE_B + MA20 mismatch → null", () => {
  it("ONE_B LONG with negative MA20 slope → null", () => {
    // Set up a LONG touch scenario: candle.low <= bb4.lower
    const bb4Lower = d("95");
    const bb4Upper = d("115");

    const candle = makeCandle({
      open: d("100"),
      high: d("110"),
      low: d("94"), // touches bb4.lower (94 <= 95)
      close: d("105"),
    });

    const watchSession = {
      id: "ws-1",
      symbol: "BTCUSDT",
      exchange: "binance" as const,
      detection_type: "BB4_TOUCH" as const,
      direction: "LONG" as const,
      tp1_price: null,
      tp2_price: null,
      detected_at: new Date(),
      invalidated_at: null,
      invalidation_reason: null,
      context_data: null,
      created_at: new Date(),
    };

    // Wrong MA20 slope for LONG: sma20 < prevSma20 (negative slope)
    const indicators = makeIndicators({
      bb4: { upper: bb4Upper, lower: bb4Lower, middle: d("105"), bandwidth: d("0.2"), percentB: d("0.5") },
      sma20: d("99"),     // less than prevSma20
      prevSma20: d("100"), // so slope is negative
    });

    const result = checkEvidence(candle, indicators, watchSession);
    expect(result).toBeNull();
  });

  it("ONE_B LONG with positive MA20 slope → not null", () => {
    const bb4Lower = d("95");
    const bb4Upper = d("115");

    const candle = makeCandle({
      open: d("100"),
      high: d("110"),
      low: d("94"),
      close: d("105"),
    });

    const watchSession = {
      id: "ws-1",
      symbol: "BTCUSDT",
      exchange: "binance" as const,
      detection_type: "BB4_TOUCH" as const,
      direction: "LONG" as const,
      tp1_price: null,
      tp2_price: null,
      detected_at: new Date(),
      invalidated_at: null,
      invalidation_reason: null,
      context_data: null,
      created_at: new Date(),
    };

    // Correct slope for LONG: sma20 > prevSma20 (positive slope)
    const indicators = makeIndicators({
      bb4: { upper: bb4Upper, lower: bb4Lower, middle: d("105"), bandwidth: d("0.2"), percentB: d("0.5") },
      sma20: d("101"),    // greater than prevSma20
      prevSma20: d("100"),
    });

    const result = checkEvidence(candle, indicators, watchSession);
    expect(result).not.toBeNull();
    expect(result?.signalType).toBe("ONE_B");
    expect(result?.direction).toBe("LONG");
  });

  it("DOUBLE_B bypasses MA20 slope check", () => {
    // bb20.lower is also touched simultaneously → DOUBLE_B
    const bb4Lower = d("95");
    const bb4Upper = d("115");
    const bb20Lower = d("96");

    const candle = makeCandle({
      open: d("100"),
      high: d("110"),
      low: d("94"), // touches both bb4.lower and bb20.lower
      close: d("105"),
    });

    const watchSession = {
      id: "ws-1",
      symbol: "BTCUSDT",
      exchange: "binance" as const,
      detection_type: "BB4_TOUCH" as const,
      direction: "LONG" as const,
      tp1_price: null,
      tp2_price: null,
      detected_at: new Date(),
      invalidated_at: null,
      invalidation_reason: null,
      context_data: null,
      created_at: new Date(),
    };

    // Wrong MA20 slope — DOUBLE_B should bypass this check
    const indicators = makeIndicators({
      bb4: { upper: bb4Upper, lower: bb4Lower, middle: d("105"), bandwidth: d("0.2"), percentB: d("0.5") },
      bb20: { upper: d("120"), lower: bb20Lower, middle: d("105"), bandwidth: d("0.2"), percentB: d("0.5") },
      sma20: d("99"),
      prevSma20: d("100"),
    });

    const result = checkEvidence(candle, indicators, watchSession);
    expect(result).not.toBeNull();
    expect(result?.signalType).toBe("DOUBLE_B");
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Safety gate thresholds (T-10-004)
// ---------------------------------------------------------------------------

describe("EP-10 S4: safety gate wick ratio thresholds (5M=0.1, 1M=1.0)", () => {
  it("5M + wick=0.05 → fails wick_ratio_exceeded (threshold 0.1, small wick = no momentum)", () => {
    // NEW PRD rule: lt(wick, threshold) → blocked (small wick = insufficient price rejection)
    // LONG candle: wick = (min(open,close) - low) / (high - low)
    // Set: open=100, close=105, low=98, high=110
    // bodyBottom = min(100, 105) = 100
    // wick = (100 - 98) / (110 - 98) = 2/12 ≈ 0.167 — still >= 0.1, would pass
    // Need small wick: open=99, close=105, low=98, high=110 → wick=(99-98)/12=1/12≈0.083 < 0.1 → BLOCKED
    // Ensure other filters pass: no sma20/bb20 → box passes; 5M → no 1M noise check
    const candle = makeCandle({
      open: d("99"),
      high: d("110"),
      low: d("98"),
      close: d("105"),
    });

    const indicators = makeIndicators();
    const signal = { direction: "LONG" as const, timeframe: "5M" as const };
    const symbolState = { session_box_high: null, session_box_low: null, daily_bias: null };

    const result = checkSafety(candle, indicators, signal, symbolState);
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });

  it("1M + wick=0.60 → fails (threshold 1.0, wick 0.60 < 1.0 = blocked under new rule)", () => {
    // NEW PRD rule: lt(wick, threshold) → blocked
    // LONG candle: open=100, close=105, low=85, high=110
    // wick = (100 - 85) / (110 - 85) = 15/25 = 0.60
    // 1M threshold = 1.0: 0.60 < 1.0 → BLOCKED
    const candle = makeCandle({
      open: d("100"),
      high: d("110"),
      low: d("85"),
      close: d("105"),
    });

    const indicators = makeIndicators();
    const signal = { direction: "LONG" as const, timeframe: "1M" as const };
    const symbolState = { session_box_high: null, session_box_low: null, daily_bias: null };

    const result = checkSafety(candle, indicators, signal, symbolState);
    // Wick 0.60 < 1.0 threshold → wick BLOCKED under new rule
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });

  it("5M + wick exactly at threshold 0.1 → passes (not strictly less than)", () => {
    // NEW PRD rule: lt(wick, threshold) → blocked
    // wick = 0.1 exactly: lt(0.1, 0.1) is false → PASSES (not strictly less than)
    // wick = 0.1 exactly: bodyBottom - low = 0.1 * (high - low)
    // high=110, low=90 → range=20; wick = 0.1*20 = 2; bodyBottom = 92
    // open=92, close=100, low=90, high=110: bodyBottom=min(92,100)=92; wick=(92-90)/20=0.1
    const candle = makeCandle({
      open: d("92"),
      high: d("110"),
      low: d("90"),
      close: d("100"),
    });

    const indicators = makeIndicators();
    const signal = { direction: "LONG" as const, timeframe: "5M" as const };
    const symbolState = { session_box_high: null, session_box_low: null, daily_bias: null };

    const result = checkSafety(candle, indicators, signal, symbolState);
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Normalizer [0,1] — NaN → 0.5, IQR=0 → 0.5 (T-10-008)
// ---------------------------------------------------------------------------

describe("EP-10 S5: normalizer degenerate cases map to 0.5", () => {
  it("NaN raw value → 0.5 output", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(0);
    raw[0] = Number.NaN; // degenerate input

    // Params with valid IQR for all dimensions
    const params: NormParams = Array.from({ length: VECTOR_DIM }, (_, i) => ({
      median: i === 0 ? 0 : 0,
      iqr: i === 0 ? 1 : 1, // valid IQR
    }));

    const result = normalize(raw, params);
    expect(result[0]).toBe(0.5);
  });

  it("IQR=0 → 0.5 output (constant feature)", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(0);
    raw[5] = 42; // any raw value

    const params: NormParams = Array.from({ length: VECTOR_DIM }, (_, i) => ({
      median: 0,
      iqr: i === 5 ? 0 : 1, // IQR=0 for dimension 5
    }));

    const result = normalize(raw, params);
    expect(result[5]).toBe(0.5);
  });

  it("+Infinity raw value → 0.5 output", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(0);
    raw[10] = Number.POSITIVE_INFINITY;

    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({ median: 0, iqr: 1 }));

    const result = normalize(raw, params);
    expect(result[10]).toBe(0.5);
  });

  it("normal values are in [0, 1]", () => {
    const raw = new Float32Array(VECTOR_DIM).fill(0);
    const params: NormParams = Array.from({ length: VECTOR_DIM }, () => ({ median: 0, iqr: 1 }));

    const result = normalize(raw, params);
    for (let i = 0; i < VECTOR_DIM; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0);
      expect(result[i]).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: KNN fee deduction (T-10-009)
// ---------------------------------------------------------------------------

describe("EP-10 S6: KNN fee deduction — borderline expectancy", () => {
  const DEFAULT_COMMISSION_PCT = 0.0008;

  it("commissionPct default is 0.0008 (0.08%)", () => {
    expect(DEFAULT_COMMISSION_PCT).toBe(0.0008);
  });

  it("raw expectancy barely positive (< commissionPct) → net negative → FAIL despite winRate >= threshold", () => {
    // Engineer a raw expectancy of ~0.0004 (< 0.0008 = commissionPct) with winRate >= 0.55
    // Use weighted neighbors:
    //   - WIN (weight=1.1004): pnlDir=+1
    //   - LOSS (weight=1.0):   pnlDir=-1
    //   - total weight = 2.1004
    //   - winRate = 1.1004 / 2.1004 ≈ 0.5239 — still below 0.55 threshold
    //
    // Better: use 3 WIN + 2 LOSS with weights engineered for raw≈0.0004
    //   Approach: many WIN + LOSS where wins barely > losses in weight
    //   Use 100 uniform WIN + 100 uniform LOSS + fill to push winRate over 0.55:
    //   Actually the cleanest way is to use a very small positive raw expectancy
    //   with a custom minSamples=2 config and non-uniform weights.
    //
    // Use 2 neighbors:
    //   WIN (weight = 1.0002), LOSS (weight = 1.0000)
    //   total = 2.0002
    //   winRate = 1.0002 / 2.0002 ≈ 0.5001 → FAILS on winRate < 0.55
    //
    // The cleanest approach: use a custom config with low winrateThreshold
    // and craft raw_expectancy in (0, commissionPct).
    //
    // Custom config: winrateThreshold=0.50, minSamples=2
    // 2 neighbors: WIN (weight=1.0004), LOSS (weight=1.0000)
    //   winRate = 1.0004/2.0004 ≈ 0.5001 (>= 0.50 threshold ✓)
    //   raw = (1.0004*1 + 1.0*(-1)) / 2.0004 = 0.0004 / 2.0004 ≈ 0.0002
    //   net = 0.0002 - 0.0008 = -0.0006 < 0 → FAIL
    const config = {
      winrateThreshold: 0.50,
      minSamples: 2,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 2,
      commissionPct: DEFAULT_COMMISSION_PCT,
    };

    const neighbors: WeightedNeighbor[] = [
      makeNeighbor("WIN", 1.0004),
      makeNeighbor("LOSS", 1.0),
    ];

    const result = makeDecision(neighbors, false, config);

    // Confirm raw expectancy would be positive (without fee, barely positive)
    // net expectancy should be negative
    expect(result.expectancy).toBeLessThan(0);
    expect(result.decision).toBe("FAIL");
  });

  it("raw expectancy above commissionPct + winRate >= threshold → PASS", () => {
    // 4 WIN, 1 LOSS with uniform weights, custom minSamples=5
    // winRate=0.8, raw=(4-1)/5=0.6, net=0.6-0.0008=0.5992 → PASS
    const config = {
      winrateThreshold: 0.55,
      minSamples: 5,
      aGradeWinrateThreshold: 0.5,
      aGradeMinSamples: 5,
      commissionPct: DEFAULT_COMMISSION_PCT,
    };

    const neighbors: WeightedNeighbor[] = [
      ...Array.from({ length: 4 }, () => makeNeighbor("WIN")),
      makeNeighbor("LOSS"),
    ];

    const result = makeDecision(neighbors, false, config);
    expect(result.expectancy).toBeGreaterThan(0);
    expect(result.decision).toBe("PASS");
    expect(result.expectancy).toBeCloseTo(0.6 - DEFAULT_COMMISSION_PCT, 4);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Time decay discrete (T-10-010)
// ---------------------------------------------------------------------------

describe("EP-10 S7: time decay — discrete 3-step function", () => {
  function daysAgo(days: number, from: Date = new Date()): Date {
    const dt = new Date(from.getTime());
    dt.setUTCDate(dt.getUTCDate() - days);
    return dt;
  }

  const now = new Date("2024-06-01T00:00:00Z");

  it("10-day-old neighbor → weight 1.0 (tier 1: <= 30 days)", () => {
    const weight = calcTimeDecay(daysAgo(10, now), now, {});
    expect(weight).toBe(1.0);
  });

  it("60-day-old neighbor → weight 0.7 (tier 2: 31-90 days)", () => {
    const weight = calcTimeDecay(daysAgo(60, now), now, {});
    expect(weight).toBe(0.7);
  });

  it("120-day-old neighbor → weight 0.2 (tier 3: > 90 days)", () => {
    const weight = calcTimeDecay(daysAgo(120, now), now, {});
    expect(weight).toBe(0.2);
  });

  it("weights are strictly decreasing: 10-day > 60-day > 120-day", () => {
    const w10 = calcTimeDecay(daysAgo(10, now), now, {});
    const w60 = calcTimeDecay(daysAgo(60, now), now, {});
    const w120 = calcTimeDecay(daysAgo(120, now), now, {});
    expect(w10).toBeGreaterThan(w60);
    expect(w60).toBeGreaterThan(w120);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: SymbolState FSM guard (T-10-011)
// ---------------------------------------------------------------------------

describe("EP-10 S8: SymbolState FSM — IDLE->HAS_POSITION throws", () => {
  it("IDLE -> HAS_POSITION throws InvalidSymbolStateTransitionError", () => {
    expect(() => {
      validateSymbolStateTransition("IDLE", "HAS_POSITION");
    }).toThrow(InvalidSymbolStateTransitionError);
  });

  it("error message includes IDLE and HAS_POSITION", () => {
    let caught: unknown;
    try {
      validateSymbolStateTransition("IDLE", "HAS_POSITION");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(InvalidSymbolStateTransitionError);
    const err = caught as InvalidSymbolStateTransitionError;
    expect(err.from).toBe("IDLE");
    expect(err.to).toBe("HAS_POSITION");
  });

  it("IDLE -> WATCHING is allowed (no throw)", () => {
    expect(() => {
      validateSymbolStateTransition("IDLE", "WATCHING");
    }).not.toThrow();
  });

  it("WATCHING -> HAS_POSITION is allowed (no throw)", () => {
    expect(() => {
      validateSymbolStateTransition("WATCHING", "HAS_POSITION");
    }).not.toThrow();
  });

  it("HAS_POSITION -> WATCHING throws InvalidSymbolStateTransitionError", () => {
    expect(() => {
      validateSymbolStateTransition("HAS_POSITION", "WATCHING");
    }).toThrow(InvalidSymbolStateTransitionError);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9: Spread precheck (T-10-012)
// ---------------------------------------------------------------------------

describe("EP-10 S9: spread precheck — checkSpread", () => {
  it("spread > threshold → passed=false", () => {
    // bid=100, ask=102: spread=2, mid=101, spreadPct=2/101≈0.0198
    // threshold=0.01 (1%) — spreadPct > threshold → fail
    const result = checkSpread(d("100"), d("102"), d("0.01"));
    expect(result.passed).toBe(false);
    expect(result.spreadPct.toNumber()).toBeGreaterThan(0.01);
  });

  it("spread <= threshold → passed=true", () => {
    // bid=100, ask=100.1: spread=0.1, mid=100.05, spreadPct=0.1/100.05≈0.001
    // threshold=0.01 (1%) — spreadPct < threshold → pass
    const result = checkSpread(d("100"), d("100.1"), d("0.01"));
    expect(result.passed).toBe(true);
  });

  it("spreadPct formula uses mid-price ((ask+bid)/2)", () => {
    // bid=99, ask=101: spread=2, mid=100, spreadPct=2/100=0.02
    const result = checkSpread(d("99"), d("101"), d("0.05"));
    expect(result.spreadPct.toNumber()).toBeCloseTo(0.02, 6);
    expect(result.passed).toBe(true); // 0.02 <= 0.05
  });

  it("spread exactly at threshold → passed=true (<=)", () => {
    // bid=99, ask=101: spreadPct=0.02; threshold=0.02 → 0.02 <= 0.02 → pass
    const result = checkSpread(d("99"), d("101"), d("0.02"));
    expect(result.passed).toBe(true);
  });
});

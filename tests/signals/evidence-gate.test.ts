import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { calcSlPrice, checkEvidence, createSignal } from "@/signals/evidence-gate";
import { getDb, getPool } from "@/db/pool";
import type { AllIndicators } from "@/indicators/types";
import type { Candle, WatchSession } from "@/core/types";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    symbol: "BTC/USDT",
    exchange: "binance",
    timeframe: "5M",
    open_time: new Date("2024-01-01T00:00:00Z"),
    open: new Decimal("50000"),
    high: new Decimal("51000"),
    low: new Decimal("49000"),
    close: new Decimal("50200"),
    volume: new Decimal("100"),
    is_closed: true,
    created_at: new Date("2024-01-01T00:05:00Z"),
    ...overrides,
  };
}

function makeIndicators(overrides: Partial<AllIndicators> = {}): AllIndicators {
  return {
    bb20: {
      upper: new Decimal("52000"),
      middle: new Decimal("50000"),
      lower: new Decimal("48000"),
      bandwidth: new Decimal("0.08"),
      percentB: new Decimal("0.5"),
    },
    bb4: {
      upper: new Decimal("51000"),
      middle: new Decimal("50000"),
      lower: new Decimal("49500"),
      bandwidth: new Decimal("0.03"),
      percentB: new Decimal("0.5"),
    },
    bb4_1h: null,
    // Default: sma20 > prevSma20 → positive slope (LONG friendly)
    sma20: new Decimal("50100"),
    prevSma20: new Decimal("50000"),
    sma20_5m: null,
    sma20History: [],
    sma60: new Decimal("49500"),
    sma120: new Decimal("49000"),
    ema20: new Decimal("50100"),
    ema60: new Decimal("49600"),
    ema120: new Decimal("49100"),
    rsi14: new Decimal("50"),
    rsiHistory: [],
    atr14: new Decimal("400"),
    squeeze: "normal",
    bandwidthHistory: [],
    ...overrides,
  };
}

function makeWatchSession(overrides: Partial<WatchSession> = {}): WatchSession {
  return {
    id: "00000000-0000-0000-0000-000000000002",
    symbol: "BTC/USDT",
    exchange: "binance",
    detection_type: "BB4_TOUCH",
    direction: "LONG",
    tp1_price: new Decimal("50000"),
    tp2_price: new Decimal("52000"),
    detected_at: new Date("2024-01-01T00:00:00Z"),
    invalidated_at: null,
    invalidation_reason: null,
    context_data: null,
    created_at: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calcSlPrice — unit tests (T-12-003: tail-length formula)
// ---------------------------------------------------------------------------

describe("calcSlPrice — LONG normal candle", () => {
  it("SL = low - (min(open,close) - low) × 0.15", () => {
    // Task scenario: open=100, close=105, low=98, high=106
    // bodyBottom = min(100, 105) = 100
    // tailLength = 100 - 98 = 2
    // buffer = 2 × 0.15 = 0.3
    // sl = 98 - 0.3 = 97.7
    const candle = makeCandle({
      open: new Decimal("100"),
      close: new Decimal("105"),
      low: new Decimal("98"),
      high: new Decimal("106"),
    });

    const sl = calcSlPrice(candle, "LONG");

    expect(sl.toString()).toBe("97.7");
  });
});

describe("calcSlPrice — SHORT normal candle", () => {
  it("SL = high + (high - max(open,close)) × 0.15", () => {
    // Task scenario: open=105, close=100, high=106, low=98
    // bodyTop = max(105, 100) = 105
    // tailLength = 106 - 105 = 1
    // buffer = 1 × 0.15 = 0.15
    // sl = 106 + 0.15 = 106.15
    const candle = makeCandle({
      open: new Decimal("105"),
      close: new Decimal("100"),
      high: new Decimal("106"),
      low: new Decimal("98"),
    });

    const sl = calcSlPrice(candle, "SHORT");

    expect(sl.toString()).toBe("106.15");
  });
});

describe("calcSlPrice — doji (open === close)", () => {
  it("LONG doji with lower tail: tailLength > 0, uses tail formula", () => {
    // open=close=100, low=99, high=101
    // bodyBottom = min(100, 100) = 100
    // tailLength = 100 - 99 = 1
    // buffer = 1 × 0.15 = 0.15
    // sl = 99 - 0.15 = 98.85
    const candle = makeCandle({
      open: new Decimal("100"),
      close: new Decimal("100"),
      low: new Decimal("99"),
      high: new Decimal("101"),
    });

    const sl = calcSlPrice(candle, "LONG");

    expect(sl.toString()).toBe("98.85");
  });

  it("LONG doji with body at low: tailLength=0 → fallback to range × 0.15", () => {
    // open=close=low=99, high=101 → tailLength = 99 - 99 = 0
    // fallback: range = 101 - 99 = 2, buffer = 2 × 0.15 = 0.3
    // sl = 99 - 0.3 = 98.7
    const candle = makeCandle({
      open: new Decimal("99"),
      close: new Decimal("99"),
      low: new Decimal("99"),
      high: new Decimal("101"),
    });

    const sl = calcSlPrice(candle, "LONG");

    expect(sl.toString()).toBe("98.7");
  });
});

describe("calcSlPrice — fully flat candle (range=0)", () => {
  it("LONG fully flat: all OHLC equal → SL = close (defensive)", () => {
    // open=close=high=low=100 → range=0, tailLength=0 → buffer=0 → SL=close
    const candle = makeCandle({
      open: new Decimal("100"),
      close: new Decimal("100"),
      low: new Decimal("100"),
      high: new Decimal("100"),
    });

    const sl = calcSlPrice(candle, "LONG");

    expect(sl.toString()).toBe("100");
  });

  it("SHORT fully flat: all OHLC equal → SL = close (defensive)", () => {
    const candle = makeCandle({
      open: new Decimal("100"),
      close: new Decimal("100"),
      low: new Decimal("100"),
      high: new Decimal("100"),
    });

    const sl = calcSlPrice(candle, "SHORT");

    expect(sl.toString()).toBe("100");
  });
});

// ---------------------------------------------------------------------------
// evidence-gate — checkEvidence — pure function tests
// ---------------------------------------------------------------------------

describe("evidence-gate — checkEvidence — LONG ONE_B", () => {
  it("returns ONE_B LONG when candle.low <= BB4 lower (no BB20 touch)", () => {
    // BB4 lower = 49500, BB20 lower = 48000
    // candle.low = 49400 — touches BB4 but not BB20
    const candle = makeCandle({ low: new Decimal("49400"), high: new Decimal("50800") });
    const indicators = makeIndicators();
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe("ONE_B");
    expect(result!.direction).toBe("LONG");
    expect(result!.entryPrice.toString()).toBe("50200"); // candle.close
  });

  it("entry_price equals candle.close for LONG ONE_B", () => {
    const candle = makeCandle({
      low: new Decimal("49400"),
      close: new Decimal("49700"),
    });
    const indicators = makeIndicators();
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result!.entryPrice.toString()).toBe("49700");
  });

  it("sl_price for LONG = low - tailLength×0.15 (tail-length formula)", () => {
    // open=50000, close=50200, low=49400
    // tailLength = min(50000, 50200) - 49400 = 50000 - 49400 = 600
    // sl = 49400 - 600*0.15 = 49400 - 90 = 49310
    const candle = makeCandle({ low: new Decimal("49400") });
    const indicators = makeIndicators();
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result!.slPrice.toString()).toBe("49310");
  });

  it("details include bb4_touch_price and bb4_lower for LONG", () => {
    const candle = makeCandle({ low: new Decimal("49400") });
    const indicators = makeIndicators();
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result!.details.bb4_touch_price).toBeDefined();
    expect((result!.details.bb4_touch_price as Decimal).toString()).toBe("49400");
    expect(result!.details.bb4_lower).toBeDefined();
  });
});

describe("evidence-gate — checkEvidence — LONG DOUBLE_B", () => {
  it("returns DOUBLE_B LONG when candle.low <= BB4 lower AND <= BB20 lower", () => {
    // BB4 lower = 49500, BB20 lower = 48000 → low=47500 touches both
    const candle = makeCandle({ low: new Decimal("47500"), high: new Decimal("50500") });
    const indicators = makeIndicators();
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe("DOUBLE_B");
    expect(result!.direction).toBe("LONG");
  });

  it("details include bb20_lower and bb20_upper for DOUBLE_B LONG", () => {
    const candle = makeCandle({ low: new Decimal("47500") });
    const indicators = makeIndicators();
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result!.details.bb20_lower).toBeDefined();
    expect(result!.details.bb20_upper).toBeDefined();
  });
});

describe("evidence-gate — checkEvidence — SHORT ONE_B", () => {
  it("returns ONE_B SHORT when candle.high >= BB4 upper (no BB20 touch)", () => {
    // BB4 upper = 51000, BB20 upper = 52000
    // candle.high = 51200 — touches BB4 but not BB20
    // Use negative MA20 slope (required for SHORT ONE_B)
    const candle = makeCandle({ high: new Decimal("51200"), low: new Decimal("49600") });
    const indicators = makeIndicators({
      sma20: new Decimal("49900"),
      prevSma20: new Decimal("50000"),
    });
    const session = makeWatchSession({ direction: "SHORT" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe("ONE_B");
    expect(result!.direction).toBe("SHORT");
  });

  it("sl_price for SHORT = high + tailLength×0.15 (tail-length formula)", () => {
    // open=50000, close=50200, high=51200
    // bodyTop = max(50000, 50200) = 50200
    // tailLength = 51200 - 50200 = 1000
    // sl = 51200 + 1000*0.15 = 51200 + 150 = 51350
    const candle = makeCandle({ high: new Decimal("51200"), low: new Decimal("49600") });
    const indicators = makeIndicators({
      sma20: new Decimal("49900"),
      prevSma20: new Decimal("50000"),
    });
    const session = makeWatchSession({ direction: "SHORT" });

    const result = checkEvidence(candle, indicators, session);

    expect(result!.slPrice.toString()).toBe("51350");
  });

  it("details include bb4_touch_price and bb4_upper for SHORT", () => {
    const candle = makeCandle({ high: new Decimal("51200"), low: new Decimal("49600") });
    const indicators = makeIndicators({
      sma20: new Decimal("49900"),
      prevSma20: new Decimal("50000"),
    });
    const session = makeWatchSession({ direction: "SHORT" });

    const result = checkEvidence(candle, indicators, session);

    expect(result!.details.bb4_touch_price).toBeDefined();
    expect((result!.details.bb4_touch_price as Decimal).toString()).toBe("51200");
    expect(result!.details.bb4_upper).toBeDefined();
  });
});

describe("evidence-gate — checkEvidence — SHORT DOUBLE_B", () => {
  it("returns DOUBLE_B SHORT when candle.high >= BB4 upper AND >= BB20 upper", () => {
    // BB4 upper = 51000, BB20 upper = 52000 → high=52500 touches both
    const candle = makeCandle({ high: new Decimal("52500"), low: new Decimal("50200") });
    const indicators = makeIndicators();
    const session = makeWatchSession({ direction: "SHORT" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe("DOUBLE_B");
    expect(result!.direction).toBe("SHORT");
  });
});

describe("evidence-gate — checkEvidence — no touch / mismatches", () => {
  it("returns null when candle does not touch BB4 (inside bands)", () => {
    // BB4 lower=49500, BB4 upper=51000
    // candle.low=49600, candle.high=50800 — inside BB4
    const candle = makeCandle({ low: new Decimal("49600"), high: new Decimal("50800") });
    const indicators = makeIndicators();
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).toBeNull();
  });

  it("returns null when BB4 indicators are null", () => {
    const candle = makeCandle({ low: new Decimal("47000") });
    const indicators = makeIndicators({ bb4: null });
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).toBeNull();
  });

  it("returns null when BB4 LONG touch but watchSession.direction is SHORT (direction mismatch)", () => {
    // candle.low <= BB4 lower → would be LONG signal but session is SHORT
    const candle = makeCandle({ low: new Decimal("49400"), high: new Decimal("50800") });
    const indicators = makeIndicators();
    const session = makeWatchSession({ direction: "SHORT" });

    const result = checkEvidence(candle, indicators, session);

    // HIGH=50800 < BB4 upper=51000 → no SHORT BB4 touch either → null
    expect(result).toBeNull();
  });

  it("returns null when BB4 SHORT touch but watchSession.direction is LONG (direction mismatch)", () => {
    // candle.high >= BB4 upper → would be SHORT signal but session is LONG
    const candle = makeCandle({ high: new Decimal("51200"), low: new Decimal("49600") });
    const indicators = makeIndicators();
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    // LOW=49600 > BB4 lower=49500 → no LONG BB4 touch → null
    expect(result).toBeNull();
  });

  it("returns ONE_B (not DOUBLE_B) when BB4 touch but BB20 is null", () => {
    const candle = makeCandle({ low: new Decimal("49400") });
    const indicators = makeIndicators({ bb20: null });
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe("ONE_B");
  });

  it("includes detection_type in details", () => {
    const candle = makeCandle({ low: new Decimal("49400") });
    const indicators = makeIndicators();
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result!.details.detection_type).toBe("ONE_B");
  });

  it("includes atr14 in details when ATR is available", () => {
    const candle = makeCandle({ low: new Decimal("49400") });
    const indicators = makeIndicators({ atr14: new Decimal("400") });
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result!.details.atr14).toBeDefined();
    expect((result!.details.atr14 as Decimal).toString()).toBe("400");
  });

  it("includes daily_bias in details when context_data has daily_bias", () => {
    const candle = makeCandle({ low: new Decimal("49400") });
    const indicators = makeIndicators();
    const session = makeWatchSession({
      direction: "LONG",
      context_data: { daily_bias: "LONG_ONLY" },
    });

    const result = checkEvidence(candle, indicators, session);

    expect(result!.details.daily_bias).toBe("LONG_ONLY");
  });
});

// ---------------------------------------------------------------------------
// evidence-gate — checkEvidence — ONE_B MA20 slope validation (T-10-003)
// ---------------------------------------------------------------------------

describe("evidence-gate — checkEvidence — ONE_B MA20 slope LONG", () => {
  it("passes ONE_B LONG when MA20 slope > 0 (sma20 > prevSma20)", () => {
    // BB4 lower=49500, candle.low=49400 → BB4 touch LONG
    // sma20=50100 > prevSma20=50000 → positive slope → passes
    const candle = makeCandle({ low: new Decimal("49400"), high: new Decimal("50800") });
    const indicators = makeIndicators({
      sma20: new Decimal("50100"),
      prevSma20: new Decimal("50000"),
    });
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe("ONE_B");
    expect(result!.direction).toBe("LONG");
  });

  it("returns null for ONE_B LONG when MA20 slope < 0 (sma20 < prevSma20)", () => {
    // sma20=49900 < prevSma20=50000 → negative slope → reject LONG
    const candle = makeCandle({ low: new Decimal("49400"), high: new Decimal("50800") });
    const indicators = makeIndicators({
      sma20: new Decimal("49900"),
      prevSma20: new Decimal("50000"),
    });
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).toBeNull();
  });

  it("returns null for ONE_B LONG when MA20 slope = 0 (flat slope fails LONG)", () => {
    // Flat: sma20 === prevSma20 — slope not > 0 → reject
    const candle = makeCandle({ low: new Decimal("49400"), high: new Decimal("50800") });
    const indicators = makeIndicators({
      sma20: new Decimal("50000"),
      prevSma20: new Decimal("50000"),
    });
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).toBeNull();
  });

  it("passes ONE_B LONG when prevSma20 is null (slope filter skipped)", () => {
    // No previous data → slope filter is skipped → ONE_B passes
    const candle = makeCandle({ low: new Decimal("49400"), high: new Decimal("50800") });
    const indicators = makeIndicators({
      sma20: new Decimal("50000"),
      prevSma20: null,
    });
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe("ONE_B");
  });

  it("passes ONE_B LONG when sma20 is null (slope filter skipped)", () => {
    // No SMA20 data at all → slope filter skipped
    const candle = makeCandle({ low: new Decimal("49400"), high: new Decimal("50800") });
    const indicators = makeIndicators({
      sma20: null,
      prevSma20: new Decimal("50000"),
    });
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe("ONE_B");
  });
});

describe("evidence-gate — checkEvidence — ONE_B MA20 slope SHORT", () => {
  it("passes ONE_B SHORT when MA20 slope < 0 (sma20 < prevSma20)", () => {
    // BB4 upper=51000, candle.high=51200 → BB4 touch SHORT
    // sma20=49900 < prevSma20=50000 → negative slope → passes
    const candle = makeCandle({ high: new Decimal("51200"), low: new Decimal("49600") });
    const indicators = makeIndicators({
      sma20: new Decimal("49900"),
      prevSma20: new Decimal("50000"),
    });
    const session = makeWatchSession({ direction: "SHORT" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe("ONE_B");
    expect(result!.direction).toBe("SHORT");
  });

  it("returns null for ONE_B SHORT when MA20 slope > 0 (sma20 > prevSma20)", () => {
    // sma20=50100 > prevSma20=50000 → positive slope → reject SHORT
    const candle = makeCandle({ high: new Decimal("51200"), low: new Decimal("49600") });
    const indicators = makeIndicators({
      sma20: new Decimal("50100"),
      prevSma20: new Decimal("50000"),
    });
    const session = makeWatchSession({ direction: "SHORT" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).toBeNull();
  });

  it("returns null for ONE_B SHORT when MA20 slope = 0 (flat slope fails SHORT)", () => {
    // Flat: sma20 === prevSma20 — slope not < 0 → reject
    const candle = makeCandle({ high: new Decimal("51200"), low: new Decimal("49600") });
    const indicators = makeIndicators({
      sma20: new Decimal("50000"),
      prevSma20: new Decimal("50000"),
    });
    const session = makeWatchSession({ direction: "SHORT" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).toBeNull();
  });

  it("passes ONE_B SHORT when prevSma20 is null (slope filter skipped)", () => {
    const candle = makeCandle({ high: new Decimal("51200"), low: new Decimal("49600") });
    const indicators = makeIndicators({
      sma20: new Decimal("50000"),
      prevSma20: null,
    });
    const session = makeWatchSession({ direction: "SHORT" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe("ONE_B");
  });
});

describe("evidence-gate — checkEvidence — DOUBLE_B bypasses MA20 slope", () => {
  it("DOUBLE_B LONG passes regardless of MA20 slope direction (negative slope)", () => {
    // low=47500 → touches BB4 (49500) AND BB20 (48000) → DOUBLE_B
    // MA20 slope is negative but DOUBLE_B should bypass this filter
    const candle = makeCandle({ low: new Decimal("47500"), high: new Decimal("50500") });
    const indicators = makeIndicators({
      sma20: new Decimal("49900"),  // < prevSma20 → negative slope
      prevSma20: new Decimal("50000"),
    });
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe("DOUBLE_B");
    expect(result!.direction).toBe("LONG");
  });

  it("DOUBLE_B SHORT passes regardless of MA20 slope direction (positive slope)", () => {
    // high=52500 → touches BB4 (51000) AND BB20 (52000) → DOUBLE_B
    // MA20 slope is positive but DOUBLE_B should bypass this filter
    const candle = makeCandle({ high: new Decimal("52500"), low: new Decimal("50200") });
    const indicators = makeIndicators({
      sma20: new Decimal("50100"),  // > prevSma20 → positive slope
      prevSma20: new Decimal("50000"),
    });
    const session = makeWatchSession({ direction: "SHORT" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe("DOUBLE_B");
    expect(result!.direction).toBe("SHORT");
  });
});

// ---------------------------------------------------------------------------
// evidence-gate — checkEvidence — a_grade 1H BB4 touch (T-10-003)
// ---------------------------------------------------------------------------

describe("evidence-gate — checkEvidence — a_grade 1H BB4 touch", () => {
  it("aGrade=false when bb4_1h is null (no 1H data)", () => {
    const candle = makeCandle({ low: new Decimal("49400"), high: new Decimal("50800") });
    const indicators = makeIndicators({ bb4_1h: null });
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.aGrade).toBe(false);
  });

  it("aGrade=true for LONG when candle.low <= bb4_1h.lower", () => {
    // candle.low=49400, bb4_1h.lower=49500 → 49400 <= 49500 → 1H BB4 LONG touch
    const candle = makeCandle({ low: new Decimal("49400"), high: new Decimal("50800") });
    const indicators = makeIndicators({
      bb4_1h: {
        upper: new Decimal("51000"),
        middle: new Decimal("50000"),
        lower: new Decimal("49500"),  // candle.low=49400 <= 49500 → touch
        bandwidth: new Decimal("0.03"),
        percentB: new Decimal("0.2"),
      },
    });
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.aGrade).toBe(true);
  });

  it("aGrade=false for LONG when candle.low > bb4_1h.lower (no 1H touch)", () => {
    // candle.low=49600, bb4_1h.lower=49500 → 49600 > 49500 → no 1H touch
    const candle = makeCandle({ low: new Decimal("49600"), high: new Decimal("50800") });
    // Set bb4 lower to 49700 to ensure 5M touch (49600 <= 49700)
    const indicators = makeIndicators({
      bb4: {
        upper: new Decimal("51000"),
        middle: new Decimal("50000"),
        lower: new Decimal("49700"),
        bandwidth: new Decimal("0.026"),
        percentB: new Decimal("0.5"),
      },
      bb4_1h: {
        upper: new Decimal("51000"),
        middle: new Decimal("50000"),
        lower: new Decimal("49500"),  // candle.low=49600 > 49500 → no 1H touch
        bandwidth: new Decimal("0.03"),
        percentB: new Decimal("0.5"),
      },
    });
    const session = makeWatchSession({ direction: "LONG" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.aGrade).toBe(false);
  });

  it("aGrade=true for SHORT when candle.high >= bb4_1h.upper", () => {
    // candle.high=51200, bb4_1h.upper=51000 → 51200 >= 51000 → 1H BB4 SHORT touch
    // Use negative MA20 slope (required for SHORT ONE_B to pass)
    const candle = makeCandle({ high: new Decimal("51200"), low: new Decimal("49600") });
    const indicators = makeIndicators({
      sma20: new Decimal("49900"),   // negative slope for SHORT
      prevSma20: new Decimal("50000"),
      bb4_1h: {
        upper: new Decimal("51000"),  // candle.high=51200 >= 51000 → touch
        middle: new Decimal("50000"),
        lower: new Decimal("49000"),
        bandwidth: new Decimal("0.04"),
        percentB: new Decimal("0.8"),
      },
    });
    const session = makeWatchSession({ direction: "SHORT" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.aGrade).toBe(true);
  });

  it("aGrade=false for SHORT when candle.high < bb4_1h.upper (no 1H touch)", () => {
    // candle.high=51200 touches 5M BB4 upper (51000) → SHORT ONE_B
    // bb4_1h.upper=51500 → 51200 < 51500 → no 1H touch → aGrade=false
    // Use negative MA20 slope (required for SHORT ONE_B to pass)
    const candle = makeCandle({ high: new Decimal("51200"), low: new Decimal("49600") });
    const indicators = makeIndicators({
      sma20: new Decimal("49900"),   // negative slope for SHORT
      prevSma20: new Decimal("50000"),
      bb4_1h: {
        upper: new Decimal("51500"),  // candle.high=51200 < 51500 → no 1H touch
        middle: new Decimal("50500"),
        lower: new Decimal("49500"),
        bandwidth: new Decimal("0.039"),
        percentB: new Decimal("0.7"),
      },
    });
    const session = makeWatchSession({ direction: "SHORT" });

    const result = checkEvidence(candle, indicators, session);

    expect(result).not.toBeNull();
    expect(result!.aGrade).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DB integration tests
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("evidence-gate — DB integration", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  async function insertParentSymbol(symbol = "BTC/USDT", exchange = "binance"): Promise<void> {
    const pool = getPool();
    await pool`
      INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
      VALUES (${symbol}, ${exchange}, ${"Bitcoin"}, ${"BTC"}, ${"USDT"})
      ON CONFLICT DO NOTHING
    `;
  }

  async function insertWatchSession(
    symbol = "BTC/USDT",
    exchange = "binance",
    direction: "LONG" | "SHORT" = "LONG",
  ): Promise<string> {
    const pool = getPool();
    const rows = await pool`
      INSERT INTO watch_session (symbol, exchange, detection_type, direction, detected_at)
      VALUES (${symbol}, ${exchange}, ${"BB4_TOUCH"}, ${direction}, NOW())
      RETURNING id
    `;
    return rows[0]!.id as string;
  }

  it("createSignal inserts a Signal row with knn_decision=null and a_grade=false", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const db = getDb();

    const session = makeWatchSession({ id: sessionId });
    const candle = makeCandle({ low: new Decimal("49400") });
    const indicators = makeIndicators();

    const evidence = checkEvidence(candle, indicators, session);
    expect(evidence).not.toBeNull();

    const signal = await createSignal(db, evidence!, session, "5M");

    expect(signal.id).toBeDefined();
    expect(signal.knn_decision).toBeNull();
    expect(signal.a_grade).toBe(false);
    expect(signal.safety_passed).toBe(false);
    expect(signal.vector_id).toBeNull();
  });

  it("createSignal sets watch_session_id correctly", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const db = getDb();

    const session = makeWatchSession({ id: sessionId });
    const candle = makeCandle({ low: new Decimal("49400") });
    const indicators = makeIndicators();

    const evidence = checkEvidence(candle, indicators, session);
    const signal = await createSignal(db, evidence!, session, "5M");

    expect(signal.watch_session_id).toBe(sessionId);
  });

  it("createSignal sets signal_type and direction correctly", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession("BTC/USDT", "binance", "LONG");
    const db = getDb();

    const session = makeWatchSession({ id: sessionId, direction: "LONG" });
    // DOUBLE_B: low <= BB4 lower AND BB20 lower
    const candle = makeCandle({ low: new Decimal("47500") });
    const indicators = makeIndicators();

    const evidence = checkEvidence(candle, indicators, session);
    expect(evidence!.signalType).toBe("DOUBLE_B");

    const signal = await createSignal(db, evidence!, session, "5M");

    expect(signal.signal_type).toBe("DOUBLE_B");
    expect(signal.direction).toBe("LONG");
  });

  it("createSignal stores entry_price and sl_price with precision", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const db = getDb();

    const session = makeWatchSession({ id: sessionId });
    const candle = makeCandle({
      low: new Decimal("49400.123456789"),
      close: new Decimal("49750.987654321"),
    });
    const indicators = makeIndicators();

    const evidence = checkEvidence(candle, indicators, session);
    const signal = await createSignal(db, evidence!, session, "5M");

    // entry_price = candle.close
    expect(signal.entry_price.toString()).toBe("49750.987654321");
    // sl_price: LONG tail-length formula
    // bodyBottom = min(open=50000, close=49750.987654321) = 49750.987654321
    // tailLength = 49750.987654321 - 49400.123456789 = 350.864197532
    // buffer = 350.864197532 × 0.15 = 52.6296296298
    // sl = 49400.123456789 - 52.6296296298 = 49347.4938271592
    expect(signal.sl_price.toString()).toBe("49347.4938271592");
  });

  it("createSignal inserts SignalDetail rows including bb4_touch_price", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const db = getDb();
    const pool = getPool();

    const session = makeWatchSession({ id: sessionId });
    const candle = makeCandle({ low: new Decimal("49400") });
    const indicators = makeIndicators();

    const evidence = checkEvidence(candle, indicators, session);
    const signal = await createSignal(db, evidence!, session, "5M");

    const details = await pool`
      SELECT key, value, text_value
      FROM signal_details
      WHERE signal_id = ${signal.id}
    `;

    const detailMap = Object.fromEntries(
      details.map((r) => [r.key, { value: r.value, text_value: r.text_value }]),
    );

    expect(detailMap.bb4_touch_price).toBeDefined();
    expect(detailMap.bb4_lower).toBeDefined();
    expect(detailMap.detection_type).toBeDefined();
    expect(detailMap.detection_type.text_value).toBe("ONE_B");
  });

  it("createSignal inserts SignalDetail rows for DOUBLE_B including bb20 bands", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const db = getDb();
    const pool = getPool();

    const session = makeWatchSession({ id: sessionId });
    // DOUBLE_B: low <= BB4 lower (49500) AND BB20 lower (48000)
    const candle = makeCandle({ low: new Decimal("47500") });
    const indicators = makeIndicators();

    const evidence = checkEvidence(candle, indicators, session);
    expect(evidence!.signalType).toBe("DOUBLE_B");

    const signal = await createSignal(db, evidence!, session, "5M");

    const details = await pool`
      SELECT key, value, text_value
      FROM signal_details
      WHERE signal_id = ${signal.id}
    `;

    const detailMap = Object.fromEntries(
      details.map((r) => [r.key, { value: r.value, text_value: r.text_value }]),
    );

    expect(detailMap.bb20_lower).toBeDefined();
    expect(detailMap.bb20_upper).toBeDefined();
    expect(detailMap.detection_type.text_value).toBe("DOUBLE_B");
  });

  it("createSignal works for SHORT direction", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession("BTC/USDT", "binance", "SHORT");
    const db = getDb();
    const pool = getPool();

    const session = makeWatchSession({ id: sessionId, direction: "SHORT" });
    // SHORT ONE_B: high >= BB4 upper (51000), high < BB20 upper (52000)
    // Negative MA20 slope required for SHORT ONE_B to pass the slope filter
    const candle = makeCandle({ high: new Decimal("51200"), low: new Decimal("49600") });
    const indicators = makeIndicators({
      sma20: new Decimal("49900"),
      prevSma20: new Decimal("50000"),
    });

    const evidence = checkEvidence(candle, indicators, session);
    expect(evidence!.signalType).toBe("ONE_B");
    expect(evidence!.direction).toBe("SHORT");

    const signal = await createSignal(db, evidence!, session, "1M");

    expect(signal.timeframe).toBe("1M");
    expect(signal.direction).toBe("SHORT");

    const details = await pool`
      SELECT key, text_value FROM signal_details WHERE signal_id = ${signal.id}
    `;
    const detailMap = Object.fromEntries(details.map((r) => [r.key, r.text_value]));
    expect(detailMap.detection_type).toBe("ONE_B");
  });
});

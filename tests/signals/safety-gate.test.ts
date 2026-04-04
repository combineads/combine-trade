import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { checkSafety, updateSignalSafety } from "@/signals/safety-gate";
import { getDb, getPool } from "@/db/pool";
import type { AllIndicators } from "@/indicators/types";
import type { Candle, DailyBias, VectorTimeframe } from "@/core/types";
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
    sma20: new Decimal("50000"),
    prevSma20: new Decimal("49900"),
    sma60: new Decimal("49500"),
    sma120: new Decimal("49000"),
    ema20: new Decimal("50100"),
    ema60: new Decimal("49600"),
    ema120: new Decimal("49100"),
    rsi14: new Decimal("50"),
    atr14: new Decimal("400"),
    squeeze: "normal",
    ...overrides,
  };
}

function makeSignal(
  overrides: { direction?: "LONG" | "SHORT"; timeframe?: VectorTimeframe } = {},
) {
  return {
    direction: "LONG" as const,
    timeframe: "5M" as VectorTimeframe,
    ...overrides,
  };
}

function makeSymbolState(
  overrides: {
    session_box_high?: Decimal | null;
    session_box_low?: Decimal | null;
    daily_bias?: DailyBias | null;
  } = {},
) {
  return {
    session_box_high: null,
    session_box_low: null,
    daily_bias: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — wick ratio filter (5M threshold = 0.1)
// ---------------------------------------------------------------------------

describe("safety-gate — wick ratio filter — 5M — LONG", () => {
  it("passes when lower wick ratio is 0.05 (below threshold 0.1)", () => {
    // range = 1000 (49000 to 50000)
    // lower wick = 0.05 → body bottom = 49000 + 0.05*1000 = 49050
    // open=49050, close=49200, low=49000, high=50000
    const candle = makeCandle({
      open: new Decimal("49050"),
      close: new Decimal("49200"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal({ timeframe: "5M" }), makeSymbolState());
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });

  it("fails when lower wick ratio is 0.15 (above threshold 0.1)", () => {
    // range = 1000, lower wick = 0.15 → body bottom = 49000 + 150 = 49150
    // open=49150, close=49300, low=49000, high=50000
    const candle = makeCandle({
      open: new Decimal("49150"),
      close: new Decimal("49300"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal({ timeframe: "5M" }), makeSymbolState());
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });

  it("passes when lower wick ratio equals threshold exactly (0.1)", () => {
    // range = 1000, body bottom = 49000 + 100 = 49100
    // lower wick = 100/1000 = 0.1 → exactly at threshold → should pass (≤ 0.1)
    const candle = makeCandle({
      open: new Decimal("49100"),
      close: new Decimal("49200"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal({ timeframe: "5M" }), makeSymbolState());
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });
});

describe("safety-gate — wick ratio filter — 5M — SHORT", () => {
  it("fails when upper wick ratio is 0.15 (above threshold 0.1)", () => {
    // range = 1000 (49000 to 50000)
    // upper wick = 0.15 → body top = 50000 - 150 = 49850
    // open=49700, close=49850, low=49000, high=50000
    const candle = makeCandle({
      open: new Decimal("49700"),
      close: new Decimal("49850"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "SHORT", timeframe: "5M" }),
      makeSymbolState(),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });

  it("passes when upper wick ratio is 0.05 (below threshold 0.1)", () => {
    // upper wick = 0.05 → body top = 50000 - 50 = 49950
    // open=49800, close=49950, low=49000, high=50000
    const candle = makeCandle({
      open: new Decimal("49800"),
      close: new Decimal("49950"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "SHORT", timeframe: "5M" }),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — wick ratio filter (1M threshold = 1.0)
// ---------------------------------------------------------------------------

describe("safety-gate — wick ratio filter — 1M — always passes", () => {
  it("passes when lower wick ratio is 0.7 on 1M (threshold is 1.0)", () => {
    // range = 1000, lower wick = 0.7 → body bottom = 49000 + 700 = 49700
    // old 5M threshold of 0.6 would fail this — but 1M threshold is 1.0, so passes
    const candle = makeCandle({
      open: new Decimal("49700"),
      close: new Decimal("49800"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal({ timeframe: "1M" }), makeSymbolState());
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });

  it("passes when upper wick ratio is 0.9 on 1M SHORT (threshold is 1.0)", () => {
    // range = 1000, upper wick = 0.9 → body top = 50000 - 900 = 49100
    // open=49000, close=49100, low=49000, high=50000
    const candle = makeCandle({
      open: new Decimal("49000"),
      close: new Decimal("49100"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "SHORT", timeframe: "1M" }),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — wick ratio filter — doji
// ---------------------------------------------------------------------------

describe("safety-gate — wick ratio filter — doji", () => {
  it("passes when candle range is zero (doji)", () => {
    const candle = makeCandle({
      open: new Decimal("50000"),
      close: new Decimal("50000"),
      low: new Decimal("50000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — box range filter (MA20-based)
//
// Default makeIndicators():
//   sma20 = 50000, bb20.upper = 52000, bb20.lower = 48000
//   range_20 = 4000, margin = 4000 * 0.15 = 600
//   lowerBound = 50000 - 600 = 49400
//   upperBound = 50000 + 600 = 50600
// ---------------------------------------------------------------------------

describe("safety-gate — box range filter", () => {
  it("passes when sma20 is null (no indicator data)", () => {
    const candle = makeCandle({ close: new Decimal("60000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20: null }),
      makeSignal(),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("outside_box_range");
  });

  it("passes when bb20 is null (no indicator data)", () => {
    const candle = makeCandle({ close: new Decimal("60000") });
    const result = checkSafety(
      candle,
      makeIndicators({ bb20: null }),
      makeSignal(),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("outside_box_range");
  });

  it("passes when entry price is at MA20 midpoint (center of range)", () => {
    // close = sma20 = 50000 → inside [49400, 50600]
    const candle = makeCandle({ close: new Decimal("50000") });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.reasons).not.toContain("outside_box_range");
  });

  it("passes when entry price is at the exact lower boundary", () => {
    // lowerBound = 50000 - 600 = 49400 → exactly on boundary → should pass
    const candle = makeCandle({ close: new Decimal("49400") });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.reasons).not.toContain("outside_box_range");
  });

  it("passes when entry price is at the exact upper boundary", () => {
    // upperBound = 50000 + 600 = 50600 → exactly on boundary → should pass
    const candle = makeCandle({ close: new Decimal("50600") });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.reasons).not.toContain("outside_box_range");
  });

  it("fails when entry price is below lower boundary", () => {
    // lowerBound = 49400, close = 49399 → outside
    const candle = makeCandle({ close: new Decimal("49399") });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("outside_box_range");
  });

  it("fails when entry price is above upper boundary", () => {
    // upperBound = 50600, close = 50601 → outside
    const candle = makeCandle({ close: new Decimal("50601") });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("outside_box_range");
  });

  it("uses MA20 midpoint, not session_box — session_box fields are irrelevant", () => {
    // close=49399 is outside MA20 boundary [49400, 50600]
    // session_box_high/low set to values that would extend far — should still fail
    const candle = makeCandle({ close: new Decimal("49399") });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal(),
      makeSymbolState({
        session_box_high: new Decimal("55000"),
        session_box_low: new Decimal("45000"),
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("outside_box_range");
  });

  it("uses different sma20 and bb20 values correctly", () => {
    // sma20=51000, bb20.upper=53000, bb20.lower=49000 → range_20=4000, margin=600
    // bounds: [50400, 51600]
    // close=50400 → exactly on lower boundary → pass
    const candle = makeCandle({ close: new Decimal("50400") });
    const result = checkSafety(
      candle,
      makeIndicators({
        sma20: new Decimal("51000"),
        bb20: {
          upper: new Decimal("53000"),
          middle: new Decimal("51000"),
          lower: new Decimal("49000"),
          bandwidth: new Decimal("0.078"),
          percentB: new Decimal("0.35"),
        },
      }),
      makeSignal(),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("outside_box_range");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — abnormal candle filter (threshold = 2x ATR)
// ---------------------------------------------------------------------------

describe("safety-gate — abnormal candle filter", () => {
  it("passes when ATR is null", () => {
    const candle = makeCandle({
      high: new Decimal("60000"),
      low: new Decimal("40000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators({ atr14: null }),
      makeSignal(),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("abnormal_candle");
  });

  it("passes when candle range is 1.5x ATR (below threshold 2x)", () => {
    // atr=400, range=600 (1.5x), threshold=800 → passes
    const candle = makeCandle({
      high: new Decimal("50600"),
      low: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators({ atr14: new Decimal("400") }),
      makeSignal(),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("abnormal_candle");
  });

  it("fails when candle range is 3x ATR (above threshold 2x)", () => {
    // atr=400, range=1200 (3x), threshold=800 → fails
    const candle = makeCandle({
      high: new Decimal("51200"),
      low: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators({ atr14: new Decimal("400") }),
      makeSignal(),
      makeSymbolState(),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("abnormal_candle");
  });

  it("passes when candle range equals exactly 2x ATR (at threshold)", () => {
    // atr=400, range=800 (2x), threshold=800 → passes (must be GREATER than threshold)
    const candle = makeCandle({
      high: new Decimal("50800"),
      low: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators({ atr14: new Decimal("400") }),
      makeSignal(),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("abnormal_candle");
  });

  it("fails when candle range is just above 2x ATR", () => {
    // atr=400, range=801 (just over 2x threshold of 800) → fails
    const candle = makeCandle({
      high: new Decimal("50801"),
      low: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators({ atr14: new Decimal("400") }),
      makeSignal(),
      makeSymbolState(),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("abnormal_candle");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — 1M noise filter
// ---------------------------------------------------------------------------

describe("safety-gate — 1M noise filter", () => {
  it("skips 1M filter when timeframe is 5M", () => {
    // sma20=50000, close=49000 (bearish), daily_bias=LONG_ONLY → but 5M → skip
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20: new Decimal("50000") }),
      makeSignal({ timeframe: "5M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });

  it("passes when timeframe is 1M but sma20 is null", () => {
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20: null }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });

  it("passes when timeframe is 1M but daily_bias is NEUTRAL", () => {
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20: new Decimal("50000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "NEUTRAL" }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });

  it("passes when timeframe is 1M but daily_bias is null", () => {
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20: new Decimal("50000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: null }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });

  it("fails when 1M + sma20 bearish + daily_bias LONG_ONLY", () => {
    // close=49000 < sma20=50000 → bearish; but bias=LONG_ONLY expects bullish → noise
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20: new Decimal("50000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("noise_1m");
  });

  it("fails when 1M + sma20 bullish + daily_bias SHORT_ONLY", () => {
    // close=51000 > sma20=50000 → bullish; but bias=SHORT_ONLY expects bearish → noise
    const candle = makeCandle({ close: new Decimal("51000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20: new Decimal("50000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("noise_1m");
  });

  it("passes when 1M + sma20 bullish + daily_bias LONG_ONLY", () => {
    // close=51000 > sma20=50000 → bullish; bias=LONG_ONLY → aligned → pass
    const candle = makeCandle({ close: new Decimal("51000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20: new Decimal("50000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "LONG_ONLY" }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });

  it("passes when 1M + sma20 bearish + daily_bias SHORT_ONLY", () => {
    // close=49000 < sma20=50000 → bearish; bias=SHORT_ONLY → aligned → pass
    const candle = makeCandle({ close: new Decimal("49000") });
    const result = checkSafety(
      candle,
      makeIndicators({ sma20: new Decimal("50000") }),
      makeSignal({ timeframe: "1M" }),
      makeSymbolState({ daily_bias: "SHORT_ONLY" }),
    );
    expect(result.reasons).not.toContain("noise_1m");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — combined scenarios
// ---------------------------------------------------------------------------

describe("safety-gate — combined scenarios", () => {
  it("returns passed=true and empty reasons when all conditions pass (5M)", () => {
    // Candle setup for 5M with tight wick threshold (0.1):
    //   range = 200 (49900 to 50100)
    //   lower wick: body bottom = min(open=49990, close=50000) = 49990
    //   wick = (49990 - 49900) / 200 = 90/200 = 0.45 → FAILS 0.1 threshold
    //   Use zero wick: open=close=high=50000, low=50000 (doji) → passes wick
    //   Actually use: open=50050, close=50080, low=50040, high=50100
    //   lower wick = (50050 - 50040) / 60 = 10/60 ≈ 0.167 → still > 0.1
    //
    // Simplest: use close exactly at sma20 center, with no lower wick.
    //   open=50000, close=50050, low=50000, high=50100 (range=100)
    //   lower wick = (50000 - 50000)/100 = 0 → passes
    //   Box (MA20-based): sma20=50000, range_20=4000, margin=600
    //     bounds=[49400, 50600] → close=50050 → inside → passes
    //   Abnormal: range=100, atr=400, threshold=800 → 100 < 800 → passes
    //   Timeframe = 5M → skip noise filter
    const candle = makeCandle({
      open: new Decimal("50000"),
      close: new Decimal("50050"),
      low: new Decimal("50000"),
      high: new Decimal("50100"),
    });
    const result = checkSafety(
      candle,
      makeIndicators({ atr14: new Decimal("400") }),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState(),
    );
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("accumulates multiple failure reasons when multiple conditions fail", () => {
    // Candle: large range → abnormal candle
    //   range = 2000 (48000 to 50000), atr=400, threshold = 2*400=800 → 2000 > 800 → abnormal
    // Wick (5M LONG): lower wick = (body_bottom - 48000) / 2000
    //   open=49800, close=49900 → body_bottom=49800
    //   wick = (49800-48000)/2000 = 1800/2000 = 0.9 → > 0.1 → fail
    // Box (MA20): sma20=50000, range_20=4000, margin=600, bounds=[49400, 50600]
    //   close=49900 → inside → passes
    // Set close outside box: close=49000 < 49400 → fails
    const candle = makeCandle({
      open: new Decimal("49800"),
      close: new Decimal("49000"),
      low: new Decimal("48000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators({ atr14: new Decimal("400") }),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState(),
    );
    expect(result.passed).toBe(false);
    // wick_ratio: wick = (49800-48000)/2000 = 0.9 > 0.1 → fail
    expect(result.reasons).toContain("wick_ratio_exceeded");
    // outside_box: close=49000 < 49400 → fail
    expect(result.reasons).toContain("outside_box_range");
    // abnormal: range=2000, atr=400, threshold=800 → 2000>800 → fail
    expect(result.reasons).toContain("abnormal_candle");
  });
});

// ---------------------------------------------------------------------------
// DB integration tests
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("safety-gate — DB integration", () => {
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

  async function insertSignal(
    sessionId: string,
    symbol = "BTC/USDT",
    exchange = "binance",
  ): Promise<string> {
    const pool = getPool();
    const rows = await pool`
      INSERT INTO signals (
        symbol, exchange, watch_session_id, timeframe,
        signal_type, direction, entry_price, sl_price,
        safety_passed, a_grade
      )
      VALUES (
        ${symbol}, ${exchange}, ${sessionId}, ${"5M"},
        ${"ONE_B"}, ${"LONG"}, ${"50000"}, ${"49000"},
        ${false}, ${false}
      )
      RETURNING id
    `;
    return rows[0]!.id as string;
  }

  it("updateSignalSafety sets safety_passed=true when result.passed is true", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const signalId = await insertSignal(sessionId);
    const db = getDb();

    await updateSignalSafety(db, signalId, { passed: true, reasons: [] });

    const pool = getPool();
    const rows = await pool`SELECT safety_passed FROM signals WHERE id = ${signalId}`;
    expect(rows[0]!.safety_passed).toBe(true);
  });

  it("updateSignalSafety does NOT insert SignalDetail when passed=true", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const signalId = await insertSignal(sessionId);
    const db = getDb();

    await updateSignalSafety(db, signalId, { passed: true, reasons: [] });

    const pool = getPool();
    const rows = await pool`
      SELECT key FROM signal_details WHERE signal_id = ${signalId} AND key = 'safety_reject_reason'
    `;
    expect(rows.length).toBe(0);
  });

  it("updateSignalSafety sets safety_passed=false when result.passed is false", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const signalId = await insertSignal(sessionId);
    const db = getDb();

    await updateSignalSafety(db, signalId, {
      passed: false,
      reasons: ["wick_ratio_exceeded"],
    });

    const pool = getPool();
    const rows = await pool`SELECT safety_passed FROM signals WHERE id = ${signalId}`;
    expect(rows[0]!.safety_passed).toBe(false);
  });

  it("updateSignalSafety inserts SignalDetail with safety_reject_reason when failed", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const signalId = await insertSignal(sessionId);
    const db = getDb();

    await updateSignalSafety(db, signalId, {
      passed: false,
      reasons: ["wick_ratio_exceeded", "abnormal_candle"],
    });

    const pool = getPool();
    const rows = await pool`
      SELECT key, text_value FROM signal_details
      WHERE signal_id = ${signalId} AND key = 'safety_reject_reason'
    `;

    expect(rows.length).toBe(1);
    expect(rows[0]!.text_value).toBe("wick_ratio_exceeded, abnormal_candle");
  });

  it("updateSignalSafety is idempotent — second call updates existing detail row", async () => {
    await insertParentSymbol();
    const sessionId = await insertWatchSession();
    const signalId = await insertSignal(sessionId);
    const db = getDb();

    await updateSignalSafety(db, signalId, {
      passed: false,
      reasons: ["wick_ratio_exceeded"],
    });

    // Call again with different reasons
    await updateSignalSafety(db, signalId, {
      passed: false,
      reasons: ["outside_box_range"],
    });

    const pool = getPool();
    const rows = await pool`
      SELECT key, text_value FROM signal_details
      WHERE signal_id = ${signalId} AND key = 'safety_reject_reason'
    `;

    // Should still be exactly 1 row (upserted)
    expect(rows.length).toBe(1);
    expect(rows[0]!.text_value).toBe("outside_box_range");
  });
});

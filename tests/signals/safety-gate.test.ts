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
    sma20: new Decimal("50000"),
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
// safety-gate — checkSafety — wick ratio filter
// ---------------------------------------------------------------------------

describe("safety-gate — wick ratio filter — LONG", () => {
  it("passes when lower wick ratio is 0.3 (below threshold 0.6)", () => {
    // range = 1000 (49000 to 50000)
    // body bottom = min(open=49700, close=49800) = 49700
    // lower wick = (49700 - 49000) / 1000 = 0.7 … let's make it 0.3
    // lower wick = 0.3 → body bottom = low + 0.3*range = 49000 + 300 = 49300
    // open=49300, close=49500, low=49000, high=50000
    const candle = makeCandle({
      open: new Decimal("49300"),
      close: new Decimal("49500"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });

  it("fails when lower wick ratio is 0.7 (above threshold 0.6)", () => {
    // range = 1000, lower wick = 0.7 → body bottom = 49000 + 700 = 49700
    // open=49700, close=49800, low=49000, high=50000
    const candle = makeCandle({
      open: new Decimal("49700"),
      close: new Decimal("49800"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });

  it("passes when lower wick ratio equals threshold exactly (0.6)", () => {
    // range = 1000, body bottom = 49000 + 600 = 49600
    // lower wick = 600/1000 = 0.6 → exactly at threshold → should pass (≤ 0.6)
    const candle = makeCandle({
      open: new Decimal("49600"),
      close: new Decimal("49700"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(candle, makeIndicators(), makeSignal(), makeSymbolState());
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });
});

describe("safety-gate — wick ratio filter — SHORT", () => {
  it("fails when upper wick ratio is 0.7 (above threshold 0.6)", () => {
    // range = 1000 (49000 to 50000)
    // body top = max(open, close)
    // upper wick = (high - body top) / range = 0.7 → body top = 50000 - 700 = 49300
    // open=49200, close=49300, low=49000, high=50000
    const candle = makeCandle({
      open: new Decimal("49200"),
      close: new Decimal("49300"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "SHORT" }),
      makeSymbolState(),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("wick_ratio_exceeded");
  });

  it("passes when upper wick ratio is 0.3", () => {
    // upper wick = 0.3 → body top = 50000 - 300 = 49700
    // open=49500, close=49700, low=49000, high=50000
    const candle = makeCandle({
      open: new Decimal("49500"),
      close: new Decimal("49700"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal({ direction: "SHORT" }),
      makeSymbolState(),
    );
    expect(result.reasons).not.toContain("wick_ratio_exceeded");
  });
});

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
// safety-gate — checkSafety — box range filter
// ---------------------------------------------------------------------------

describe("safety-gate — box range filter", () => {
  it("passes when session_box_high/low are null (no box data)", () => {
    const candle = makeCandle({ close: new Decimal("60000") });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal(),
      makeSymbolState({ session_box_high: null, session_box_low: null }),
    );
    expect(result.reasons).not.toContain("outside_box_range");
  });

  it("passes when entry price is inside the session box", () => {
    // box: 49000 to 51000, margin = 2000*0.3 = 600
    // extended: [48400, 51600]
    // close = 50200 → inside
    const candle = makeCandle({ close: new Decimal("50200") });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal(),
      makeSymbolState({
        session_box_high: new Decimal("51000"),
        session_box_low: new Decimal("49000"),
      }),
    );
    expect(result.reasons).not.toContain("outside_box_range");
  });

  it("passes when entry price is at the extended lower boundary", () => {
    // box: 49000 to 51000, margin = 600
    // extended lower = 49000 - 600 = 48400
    const candle = makeCandle({ close: new Decimal("48400") });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal(),
      makeSymbolState({
        session_box_high: new Decimal("51000"),
        session_box_low: new Decimal("49000"),
      }),
    );
    expect(result.reasons).not.toContain("outside_box_range");
  });

  it("fails when entry price is below extended lower boundary", () => {
    // extended lower = 48400, close = 48399 → outside
    const candle = makeCandle({ close: new Decimal("48399") });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal(),
      makeSymbolState({
        session_box_high: new Decimal("51000"),
        session_box_low: new Decimal("49000"),
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("outside_box_range");
  });

  it("fails when entry price is above extended upper boundary", () => {
    // extended upper = 51600, close = 51601 → outside
    const candle = makeCandle({ close: new Decimal("51601") });
    const result = checkSafety(
      candle,
      makeIndicators(),
      makeSignal(),
      makeSymbolState({
        session_box_high: new Decimal("51000"),
        session_box_low: new Decimal("49000"),
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("outside_box_range");
  });
});

// ---------------------------------------------------------------------------
// safety-gate — checkSafety — abnormal candle filter
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

  it("passes when candle range is 2x ATR (below threshold 3x)", () => {
    // atr=400, range=800 (2x), threshold=1200 → passes
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

  it("fails when candle range is 4x ATR (above threshold 3x)", () => {
    // atr=400, range=1600 (4x), threshold=1200 → fails
    const candle = makeCandle({
      high: new Decimal("51600"),
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

  it("passes when candle range equals exactly 3x ATR (at threshold)", () => {
    // atr=400, range=1200 (3x), threshold=1200 → passes (must be GREATER than threshold)
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
    expect(result.reasons).not.toContain("abnormal_candle");
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
  it("returns passed=true and empty reasons when all conditions pass", () => {
    // Good candle: moderate wick, inside box, normal size, aligned bias
    // range = 1000 (49000 to 50000)
    // body bottom = 49500 → lower wick = 500/1000 = 0.5 → ok
    // close = 49700 → inside box (49000 to 51000, extended to [48400, 51600])
    // range = 1000, atr = 400 → 1000/400 = 2.5 < 3 → ok
    // timeframe = 5M → skip noise filter
    const candle = makeCandle({
      open: new Decimal("49500"),
      close: new Decimal("49700"),
      low: new Decimal("49000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators({ atr14: new Decimal("400") }),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({
        session_box_high: new Decimal("51000"),
        session_box_low: new Decimal("49000"),
      }),
    );
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("accumulates multiple failure reasons when multiple conditions fail", () => {
    // Bad candle: high wick ratio + outside box + abnormal size
    // range = 10000 (40000 to 50000)
    // lower wick: body bottom = min(40700, 40800) = 40700; wick = (40700-40000)/10000 = 0.07 → ok
    // Let's make it fail wick: lower wick = 0.8 → body bottom = 40000 + 8000 = 48000
    // AND abnormal: range=10000, atr=400 → 10000/400 = 25x → fail
    // AND outside box: close=48500, box=[49000, 51000], extended=[48400, 51600] → 48500 > 48400 ok
    // Actually let's set close to be outside box
    // close = 47000 < extended lower 48400 → outside box
    const candle = makeCandle({
      open: new Decimal("48000"),
      close: new Decimal("47000"),
      low: new Decimal("40000"),
      high: new Decimal("50000"),
    });
    const result = checkSafety(
      candle,
      makeIndicators({ atr14: new Decimal("400") }),
      makeSignal({ direction: "LONG", timeframe: "5M" }),
      makeSymbolState({
        session_box_high: new Decimal("51000"),
        session_box_low: new Decimal("49000"),
      }),
    );
    expect(result.passed).toBe(false);
    // wick_ratio: body bottom = 48000, wick = (48000-40000)/10000 = 0.8 → fail
    expect(result.reasons).toContain("wick_ratio_exceeded");
    // outside_box: close=47000 < 48400 → fail
    expect(result.reasons).toContain("outside_box_range");
    // abnormal: range=10000, atr=400, threshold=1200 → 10000>1200 → fail
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

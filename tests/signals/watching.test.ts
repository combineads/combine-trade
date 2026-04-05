import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import {
  checkInvalidation,
  detectWatching,
  getActiveWatchSession,
  invalidateWatchSession,
  openWatchSession,
} from "@/signals/watching";
import { getDb, getPool } from "@/db/pool";
import type { AllIndicators } from "@/indicators/types";
import type { Candle, DailyBias, WatchSession } from "@/core/types";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCandle(close: string, overrides: Partial<Candle> = {}): Candle {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    symbol: "BTC/USDT",
    exchange: "binance",
    timeframe: "1H",
    open_time: new Date("2024-01-01T00:00:00Z"),
    open: new Decimal("50000"),
    high: new Decimal("51000"),
    low: new Decimal("49000"),
    close: new Decimal(close),
    volume: new Decimal("100"),
    is_closed: true,
    created_at: new Date("2024-01-01T01:00:00Z"),
    ...overrides,
  };
}

/**
 * Build an AllIndicators object with Decimal values for testing.
 * All values are sensible defaults centred around 50000 price.
 */
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
      lower: new Decimal("49000"),
      bandwidth: new Decimal("0.04"),
      percentB: new Decimal("0.5"),
    },
    bb4_1h: null,
    sma20: new Decimal("50000"),
    prevSma20: new Decimal("49900"),
    sma20_5m: null,
    sma60: new Decimal("49500"),
    sma120: new Decimal("49000"),
    ema20: new Decimal("50100"),
    ema60: new Decimal("49600"),
    ema120: new Decimal("49100"),
    rsi14: new Decimal("55"),
    atr14: new Decimal("500"),
    squeeze: "normal",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectWatching — Squeeze Breakout tests
// ---------------------------------------------------------------------------

describe("watching — detectWatching — SQUEEZE_BREAKOUT", () => {
  it("detects SQUEEZE_BREAKOUT LONG when squeeze=expansion and close > BB20 upper with LONG_ONLY bias", () => {
    // high=53000, low=49000, close=52500 → upper wick = (53000-52500)/(53000-49000) = 500/4000 = 0.125 < 0.5 ✓
    const candle = makeCandle("52500", {
      high: new Decimal("53000"),
      low: new Decimal("49000"),
    });
    const indicators = makeIndicators({ squeeze: "expansion" });
    const bias: DailyBias = "LONG_ONLY";

    const result = detectWatching(candle, indicators, bias);

    expect(result).not.toBeNull();
    expect(result!.detectionType).toBe("SQUEEZE_BREAKOUT");
    expect(result!.direction).toBe("LONG");
    expect(result!.tp1Price.toString()).toBe("50000"); // sma20
    expect(result!.tp2Price.toString()).toBe("48000"); // bb20 lower
  });

  it("returns null for SQUEEZE_BREAKOUT LONG when bias is SHORT_ONLY (direction mismatch)", () => {
    // high=53000, low=49000, close=52500 → realistic candle
    const candle = makeCandle("52500", {
      high: new Decimal("53000"),
      low: new Decimal("49000"),
    });
    const indicators = makeIndicators({ squeeze: "expansion" });
    const bias: DailyBias = "SHORT_ONLY";

    const result = detectWatching(candle, indicators, bias);

    // Should not match SQUEEZE_BREAKOUT LONG; may still match BB4 Touch SHORT if close >= bb4Upper
    // close=52500 >= bb4Upper=51000 → BB4_TOUCH SHORT
    expect(result?.detectionType).not.toBe("SQUEEZE_BREAKOUT");
  });

  it("detects SQUEEZE_BREAKOUT SHORT when squeeze=expansion and close < BB20 lower with SHORT_ONLY bias", () => {
    // high=49000, low=46000, close=47000 → lower wick = (47000-46000)/(49000-46000) = 1000/3000 = 0.33 < 0.5 ✓
    const candle = makeCandle("47000", {
      high: new Decimal("49000"),
      low: new Decimal("46000"),
    });
    const indicators = makeIndicators({ squeeze: "expansion" });
    const bias: DailyBias = "SHORT_ONLY";

    const result = detectWatching(candle, indicators, bias);

    expect(result).not.toBeNull();
    expect(result!.detectionType).toBe("SQUEEZE_BREAKOUT");
    expect(result!.direction).toBe("SHORT");
    expect(result!.tp1Price.toString()).toBe("50000"); // sma20
    expect(result!.tp2Price.toString()).toBe("52000"); // bb20 upper
  });

  it("detects SQUEEZE_BREAKOUT when bias is NEUTRAL and close > BB20 upper", () => {
    // high=53000, low=49000, close=52500 → upper wick ratio = 0.125 < 0.5 ✓
    const candle = makeCandle("52500", {
      high: new Decimal("53000"),
      low: new Decimal("49000"),
    });
    const indicators = makeIndicators({ squeeze: "expansion" });
    const bias: DailyBias = "NEUTRAL";

    const result = detectWatching(candle, indicators, bias);

    expect(result).not.toBeNull();
    expect(result!.detectionType).toBe("SQUEEZE_BREAKOUT");
    expect(result!.direction).toBe("LONG");
  });

  it("returns null when squeeze is not expansion (normal)", () => {
    // high=53000, low=49000, close=52500
    const candle = makeCandle("52500", {
      high: new Decimal("53000"),
      low: new Decimal("49000"),
    });
    const indicators = makeIndicators({ squeeze: "normal" });
    const bias: DailyBias = "LONG_ONLY";

    // squeeze is not expansion → no SQUEEZE_BREAKOUT
    // close=52500 >= bb4Upper=51000 → but bias=LONG_ONLY → BB4 Touch LONG needs close <= bb4Lower
    // No match expected for SQUEEZE_BREAKOUT
    const result = detectWatching(candle, indicators, bias);

    expect(result?.detectionType).not.toBe("SQUEEZE_BREAKOUT");
  });

  it("returns null when squeeze is 'squeeze' (not expansion)", () => {
    // high=53000, low=49000, close=52500
    const candle = makeCandle("52500", {
      high: new Decimal("53000"),
      low: new Decimal("49000"),
    });
    const indicators = makeIndicators({ squeeze: "squeeze" });
    const bias: DailyBias = "LONG_ONLY";

    const result = detectWatching(candle, indicators, bias);

    expect(result?.detectionType).not.toBe("SQUEEZE_BREAKOUT");
  });

  it("includes context_data with BB values and squeeze state", () => {
    // high=53000, low=49000, close=52500 → upper wick ratio = 0.125 < 0.5 ✓
    const candle = makeCandle("52500", {
      high: new Decimal("53000"),
      low: new Decimal("49000"),
    });
    const indicators = makeIndicators({ squeeze: "expansion" });
    const bias: DailyBias = "LONG_ONLY";

    const result = detectWatching(candle, indicators, bias);

    expect(result).not.toBeNull();
    const ctx = result!.contextData as Record<string, unknown>;
    expect(ctx.squeeze).toBe("expansion");
    expect(ctx.bb20Upper).toBeDefined();
    expect(ctx.bb20Lower).toBeDefined();
    expect(ctx.close).toBe("52500");
  });

  it("returns null for SQUEEZE_BREAKOUT LONG when upper wick ratio >= 0.5 (wick dominated)", () => {
    // high=56000, low=49000, close=52500 → upper wick = (56000-52500)/(56000-49000) = 3500/7000 = 0.5 → reject
    const candleLong = makeCandle("52500", {
      high: new Decimal("56000"),
      low: new Decimal("49000"),
    });
    const indicators = makeIndicators({ squeeze: "expansion" });
    const result = detectWatching(candleLong, indicators, "LONG_ONLY");
    expect(result).toBeNull();
  });

  it("returns null for SQUEEZE_BREAKOUT SHORT when lower wick ratio >= 0.5 (wick dominated)", () => {
    // high=49000, low=43000, close=47000 → lower wick=(47000-43000)/(49000-43000)=4000/6000=0.667 >= 0.5 → reject
    const candleShort = makeCandle("47000", {
      high: new Decimal("49000"),
      low: new Decimal("43000"),
    });
    const indicators = makeIndicators({ squeeze: "expansion" });
    const result = detectWatching(candleShort, indicators, "SHORT_ONLY");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectWatching — BB4 Touch tests
// ---------------------------------------------------------------------------

describe("watching — detectWatching — BB4_TOUCH", () => {
  it("detects BB4_TOUCH LONG when close < BB4 lower and not in SR_CONFLUENCE zone", () => {
    // close=47500 is below BB20 lower=48000, so it's outside the SR_CONFLUENCE LONG zone
    // (SR_CONFLUENCE LONG requires close >= bb20Lower). BB4_TOUCH LONG fires (close <= bb4Lower=49000).
    const candle = makeCandle("47500");
    const indicators = makeIndicators({ squeeze: "normal" });
    const bias: DailyBias = "LONG_ONLY";

    const result = detectWatching(candle, indicators, bias);

    expect(result).not.toBeNull();
    expect(result!.detectionType).toBe("BB4_TOUCH");
    expect(result!.direction).toBe("LONG");
    expect(result!.tp1Price.toString()).toBe("50000"); // sma20
    expect(result!.tp2Price.toString()).toBe("52000"); // bb20 upper
  });

  it("detects BB4_TOUCH SHORT when close > BB4 upper and not in SR_CONFLUENCE zone", () => {
    // close=52500 is above BB20 upper=52000, so it's outside the SR_CONFLUENCE SHORT zone
    // (SR_CONFLUENCE SHORT requires close <= bb20Upper). BB4_TOUCH SHORT fires (close >= bb4Upper=51000).
    const candle = makeCandle("52500");
    const indicators = makeIndicators({ squeeze: "normal" });
    const bias: DailyBias = "SHORT_ONLY";

    const result = detectWatching(candle, indicators, bias);

    expect(result).not.toBeNull();
    expect(result!.detectionType).toBe("BB4_TOUCH");
    expect(result!.direction).toBe("SHORT");
    expect(result!.tp1Price.toString()).toBe("50000"); // sma20
    expect(result!.tp2Price.toString()).toBe("48000"); // bb20 lower
  });

  it("returns null when close is inside BB4 bands (no touch)", () => {
    const candle = makeCandle("50000"); // inside BB4
    const indicators = makeIndicators({ squeeze: "normal" });
    const bias: DailyBias = "LONG_ONLY";

    const result = detectWatching(candle, indicators, bias);

    expect(result).toBeNull();
  });

  it("returns null when BB4_TOUCH LONG detected but bias is SHORT_ONLY", () => {
    const candle = makeCandle("48500"); // below BB4 lower
    const indicators = makeIndicators({ squeeze: "normal" });
    const bias: DailyBias = "SHORT_ONLY";

    // BB4_TOUCH LONG would match close<=bb4Lower, but bias=SHORT_ONLY blocks LONG
    // SR_CONFLUENCE SHORT needs close between bb4Upper and bb20Upper (48500 is not)
    const result = detectWatching(candle, indicators, bias);

    if (result !== null) {
      expect(result.direction).toBe("SHORT");
    }
  });

  it("detects BB4_TOUCH with NEUTRAL bias when close is below BB20 lower", () => {
    // Use close below BB20 lower to avoid SR_CONFLUENCE match
    const candle = makeCandle("47500");
    const indicators = makeIndicators({ squeeze: "normal" });
    const bias: DailyBias = "NEUTRAL";

    const result = detectWatching(candle, indicators, bias);

    expect(result).not.toBeNull();
    expect(result!.detectionType).toBe("BB4_TOUCH");
    expect(result!.direction).toBe("LONG");
  });
});

// ---------------------------------------------------------------------------
// detectWatching — SR Confluence tests
// ---------------------------------------------------------------------------

describe("watching — detectWatching — SR_CONFLUENCE", () => {
  it("detects SR_CONFLUENCE LONG when close is between BB20 lower and BB4 lower", () => {
    // BB20 lower=48000, BB4 lower=49000 → close=48500, distance from bb20Lower=500
    // ATR14=2000 → threshold=600 > 500 ✓ (close is within ATR14×0.3 of support)
    const candle = makeCandle("48500");
    const indicators = makeIndicators({
      squeeze: "normal",
      atr14: new Decimal("2000"),
      bb20: {
        upper: new Decimal("52000"),
        middle: new Decimal("50000"),
        lower: new Decimal("48000"),
        bandwidth: new Decimal("0.08"),
        percentB: new Decimal("0.125"),
      },
      bb4: {
        upper: new Decimal("51000"),
        middle: new Decimal("50000"),
        lower: new Decimal("49000"),
        bandwidth: new Decimal("0.04"),
        percentB: new Decimal("0.25"),
      },
    });
    const bias: DailyBias = "LONG_ONLY";

    const result = detectWatching(candle, indicators, bias);

    expect(result).not.toBeNull();
    expect(result!.detectionType).toBe("SR_CONFLUENCE");
    expect(result!.direction).toBe("LONG");
    expect(result!.tp2Price.toString()).toBe("52000"); // bb20 upper
  });

  it("detects SR_CONFLUENCE SHORT when close is between BB4 upper and BB20 upper", () => {
    // BB4 upper=51000, BB20 upper=52000 → close=51500, distance from bb20Upper=500
    // ATR14=2000 → threshold=600 > 500 ✓ (close is within ATR14×0.3 of resistance)
    const candle = makeCandle("51500");
    const indicators = makeIndicators({ squeeze: "normal", atr14: new Decimal("2000") });
    const bias: DailyBias = "SHORT_ONLY";

    const result = detectWatching(candle, indicators, bias);

    expect(result).not.toBeNull();
    expect(result!.detectionType).toBe("SR_CONFLUENCE");
    expect(result!.direction).toBe("SHORT");
    expect(result!.tp2Price.toString()).toBe("48000"); // bb20 lower
  });

  it("returns null when close is outside both confluence zones", () => {
    const candle = makeCandle("50000"); // inside BB4 bands (not in confluence zone)
    const indicators = makeIndicators({ squeeze: "normal" });
    const bias: DailyBias = "NEUTRAL";

    const result = detectWatching(candle, indicators, bias);

    expect(result).toBeNull();
  });

  it("returns null for SR_CONFLUENCE LONG when close is too far from bb20Lower (ATR filter)", () => {
    // close=48500, bb20Lower=48000, distance=500
    // ATR14=500 → threshold=150 < 500 → rejected by ATR filter
    const candle = makeCandle("48500");
    const indicators = makeIndicators({
      squeeze: "normal",
      atr14: new Decimal("500"),
      bb20: {
        upper: new Decimal("52000"),
        middle: new Decimal("50000"),
        lower: new Decimal("48000"),
        bandwidth: new Decimal("0.08"),
        percentB: new Decimal("0.125"),
      },
      bb4: {
        upper: new Decimal("51000"),
        middle: new Decimal("50000"),
        lower: new Decimal("49000"),
        bandwidth: new Decimal("0.04"),
        percentB: new Decimal("0.25"),
      },
    });
    const result = detectWatching(candle, indicators, "LONG_ONLY");
    expect(result?.detectionType).not.toBe("SR_CONFLUENCE");
  });

  it("returns null for SR_CONFLUENCE SHORT when close is too far from bb20Upper (ATR filter)", () => {
    // close=51500, bb20Upper=52000, distance=500
    // ATR14=500 → threshold=150 < 500 → rejected by ATR filter
    const candle = makeCandle("51500");
    const indicators = makeIndicators({ squeeze: "normal", atr14: new Decimal("500") });
    const result = detectWatching(candle, indicators, "SHORT_ONLY");
    expect(result?.detectionType).not.toBe("SR_CONFLUENCE");
  });

  it("passes SR_CONFLUENCE when atr14 is null (ATR filter skipped)", () => {
    // When atr14 is null the ATR filter is skipped and the position-based check is sufficient
    // close=48500, between bb20Lower=48000 and bb4Lower=49000 ✓
    const candle = makeCandle("48500");
    const indicators = makeIndicators({
      squeeze: "normal",
      atr14: null,
      bb20: {
        upper: new Decimal("52000"),
        middle: new Decimal("50000"),
        lower: new Decimal("48000"),
        bandwidth: new Decimal("0.08"),
        percentB: new Decimal("0.125"),
      },
      bb4: {
        upper: new Decimal("51000"),
        middle: new Decimal("50000"),
        lower: new Decimal("49000"),
        bandwidth: new Decimal("0.04"),
        percentB: new Decimal("0.25"),
      },
    });
    const result = detectWatching(candle, indicators, "LONG_ONLY");
    expect(result).not.toBeNull();
    expect(result!.detectionType).toBe("SR_CONFLUENCE");
  });
});

// ---------------------------------------------------------------------------
// detectWatching — no conditions met
// ---------------------------------------------------------------------------

describe("watching — detectWatching — no match", () => {
  it("returns null when no conditions are met", () => {
    const candle = makeCandle("50000"); // inside all bands
    const indicators = makeIndicators({ squeeze: "normal" });
    const bias: DailyBias = "LONG_ONLY";

    const result = detectWatching(candle, indicators, bias);

    expect(result).toBeNull();
  });

  it("returns null when indicators are missing BB20", () => {
    const candle = makeCandle("52500");
    const indicators = makeIndicators({ squeeze: "expansion", bb20: null });
    const bias: DailyBias = "LONG_ONLY";

    const result = detectWatching(candle, indicators, bias);

    expect(result).toBeNull();
  });

  it("returns null when indicators are missing sma20", () => {
    const candle = makeCandle("52500");
    const indicators = makeIndicators({ squeeze: "expansion", sma20: null });
    const bias: DailyBias = "LONG_ONLY";

    const result = detectWatching(candle, indicators, bias);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkInvalidation — pure tests
// ---------------------------------------------------------------------------

describe("watching — checkInvalidation", () => {
  function makeSession(direction: "LONG" | "SHORT"): WatchSession {
    return {
      id: "00000000-0000-0000-0000-000000000002",
      symbol: "BTC/USDT",
      exchange: "binance",
      detection_type: "BB4_TOUCH",
      direction,
      tp1_price: new Decimal("50000"),
      tp2_price: new Decimal("52000"),
      detected_at: new Date("2024-01-01T00:00:00Z"),
      invalidated_at: null,
      invalidation_reason: null,
      context_data: null,
      created_at: new Date("2024-01-01T00:00:00Z"),
    };
  }

  it("returns 'bias_changed' when LONG session but bias is SHORT_ONLY", () => {
    const candle = makeCandle("50000");
    const indicators = makeIndicators();
    const session = makeSession("LONG");

    const result = checkInvalidation(candle, indicators, session, "SHORT_ONLY");

    expect(result).toBe("bias_changed");
  });

  it("returns 'bias_changed' when SHORT session but bias is LONG_ONLY", () => {
    const candle = makeCandle("50000");
    const indicators = makeIndicators();
    const session = makeSession("SHORT");

    const result = checkInvalidation(candle, indicators, session, "LONG_ONLY");

    expect(result).toBe("bias_changed");
  });

  it("returns 'bias_changed_to_neutral' when LONG session and bias changes to NEUTRAL", () => {
    const candle = makeCandle("50000");
    const indicators = makeIndicators();
    const session = makeSession("LONG");

    const result = checkInvalidation(candle, indicators, session, "NEUTRAL");

    expect(result).toBe("bias_changed_to_neutral");
  });

  it("returns 'bias_changed_to_neutral' when SHORT session and bias changes to NEUTRAL", () => {
    const candle = makeCandle("50000");
    const indicators = makeIndicators();
    const session = makeSession("SHORT");

    const result = checkInvalidation(candle, indicators, session, "NEUTRAL");

    expect(result).toBe("bias_changed_to_neutral");
  });

  it("returns 'price_breakout' when LONG session and close < BB20 lower", () => {
    const candle = makeCandle("47000"); // below BB20 lower of 48000
    const indicators = makeIndicators();
    const session = makeSession("LONG");

    const result = checkInvalidation(candle, indicators, session);

    expect(result).toBe("price_breakout");
  });

  it("returns 'price_breakout' when SHORT session and close > BB20 upper", () => {
    const candle = makeCandle("53000"); // above BB20 upper of 52000
    const indicators = makeIndicators();
    const session = makeSession("SHORT");

    const result = checkInvalidation(candle, indicators, session);

    expect(result).toBe("price_breakout");
  });

  it("returns null when LONG session and close is above BB20 lower (still valid)", () => {
    const candle = makeCandle("50000");
    const indicators = makeIndicators();
    const session = makeSession("LONG");

    const result = checkInvalidation(candle, indicators, session);

    expect(result).toBeNull();
  });

  it("returns null when SHORT session and close is below BB20 upper (still valid)", () => {
    const candle = makeCandle("50000");
    const indicators = makeIndicators();
    const session = makeSession("SHORT");

    const result = checkInvalidation(candle, indicators, session);

    expect(result).toBeNull();
  });

  it("returns null when bb20 is missing (cannot determine breakout)", () => {
    const candle = makeCandle("47000");
    const indicators = makeIndicators({ bb20: null });
    const session = makeSession("LONG");

    const result = checkInvalidation(candle, indicators, session);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DB integration tests
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("watching — DB integration", () => {
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

  function makeOpenParams(
    overrides: Partial<Parameters<typeof openWatchSession>[1]> = {},
  ): Parameters<typeof openWatchSession>[1] {
    return {
      symbol: "BTC/USDT",
      exchange: "binance",
      detectionType: "BB4_TOUCH",
      direction: "LONG",
      tp1Price: new Decimal("50000"),
      tp2Price: new Decimal("52000"),
      detectedAt: new Date("2024-01-01T01:00:00Z"),
      contextData: { test: true },
      ...overrides,
    };
  }

  it("openWatchSession creates a WatchSession record", async () => {
    await insertParentSymbol();
    const db = getDb();
    const params = makeOpenParams();

    const session = await openWatchSession(db, params);

    expect(session.id).toBeDefined();
    expect(session.symbol).toBe("BTC/USDT");
    expect(session.exchange).toBe("binance");
    expect(session.detection_type).toBe("BB4_TOUCH");
    expect(session.direction).toBe("LONG");
    expect(session.tp1_price?.toString()).toBe("50000");
    expect(session.tp2_price?.toString()).toBe("52000");
    expect(session.invalidated_at).toBeNull();
    expect(session.invalidation_reason).toBeNull();
  });

  it("openWatchSession auto-invalidates existing active session with 'new_session_started'", async () => {
    await insertParentSymbol();
    const db = getDb();

    // Open first session
    const first = await openWatchSession(db, makeOpenParams({ detectionType: "BB4_TOUCH" }));
    expect(first.invalidated_at).toBeNull();

    // Open second session for the same symbol/exchange
    const second = await openWatchSession(
      db,
      makeOpenParams({ detectionType: "SQUEEZE_BREAKOUT" }),
    );
    expect(second.invalidated_at).toBeNull();

    // Verify first session was invalidated
    const pool = getPool();
    const firstRow = await pool`
      SELECT invalidated_at, invalidation_reason
      FROM watch_session
      WHERE id = ${first.id}
    `;
    expect(firstRow[0]!.invalidated_at).not.toBeNull();
    expect(firstRow[0]!.invalidation_reason).toBe("new_session_started");
  });

  it("getActiveWatchSession returns the active session when one exists", async () => {
    await insertParentSymbol();
    const db = getDb();
    const params = makeOpenParams();

    const created = await openWatchSession(db, params);

    const found = await getActiveWatchSession(db, "BTC/USDT", "binance");

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.invalidated_at).toBeNull();
  });

  it("getActiveWatchSession returns null when no active session exists", async () => {
    await insertParentSymbol();
    const db = getDb();

    const result = await getActiveWatchSession(db, "BTC/USDT", "binance");

    expect(result).toBeNull();
  });

  it("getActiveWatchSession returns null after session is invalidated", async () => {
    await insertParentSymbol();
    const db = getDb();

    const session = await openWatchSession(db, makeOpenParams());
    await invalidateWatchSession(db, session.id, "bias_changed");

    const result = await getActiveWatchSession(db, "BTC/USDT", "binance");

    expect(result).toBeNull();
  });

  it("invalidateWatchSession sets invalidated_at and reason", async () => {
    await insertParentSymbol();
    const db = getDb();

    const session = await openWatchSession(db, makeOpenParams());
    await invalidateWatchSession(db, session.id, "price_breakout");

    const pool = getPool();
    const rows = await pool`
      SELECT invalidated_at, invalidation_reason
      FROM watch_session
      WHERE id = ${session.id}
    `;

    expect(rows[0]!.invalidated_at).not.toBeNull();
    expect(rows[0]!.invalidation_reason).toBe("price_breakout");
  });

  it("openWatchSession with two different symbols does not auto-invalidate", async () => {
    await insertParentSymbol("BTC/USDT", "binance");
    await insertParentSymbol("ETH/USDT", "binance");
    const db = getDb();

    const btcSession = await openWatchSession(
      db,
      makeOpenParams({ symbol: "BTC/USDT", exchange: "binance" }),
    );
    const ethSession = await openWatchSession(
      db,
      makeOpenParams({ symbol: "ETH/USDT", exchange: "binance" }),
    );

    // Neither should be invalidated (different symbols)
    const btcFound = await getActiveWatchSession(db, "BTC/USDT", "binance");
    const ethFound = await getActiveWatchSession(db, "ETH/USDT", "binance");

    expect(btcFound?.id).toBe(btcSession.id);
    expect(ethFound?.id).toBe(ethSession.id);
  });

  it("WatchSession context_data is stored and retrieved correctly", async () => {
    await insertParentSymbol();
    const db = getDb();
    const contextData = {
      squeeze: "expansion",
      bb20Upper: "52000",
      bb20Lower: "48000",
      close: "53000",
    };

    const session = await openWatchSession(db, makeOpenParams({ contextData }));

    expect(session.context_data).toMatchObject(contextData);
  });

  it("tp1_price and tp2_price are stored with full numeric precision", async () => {
    await insertParentSymbol();
    const db = getDb();
    const params = makeOpenParams({
      tp1Price: new Decimal("49876.123456789"),
      tp2Price: new Decimal("52123.987654321"),
    });

    const session = await openWatchSession(db, params);

    expect(session.tp1_price?.toString()).toBe("49876.123456789");
    expect(session.tp2_price?.toString()).toBe("52123.987654321");
  });

  // ---- T-18-009: FSM state transition tests ----

  async function insertSymbolState(
    symbol = "BTC/USDT",
    exchange = "binance",
    fsmState: "IDLE" | "WATCHING" | "HAS_POSITION" = "IDLE",
  ): Promise<void> {
    const pool = getPool();
    await pool`
      INSERT INTO symbol_state (symbol, exchange, fsm_state)
      VALUES (${symbol}, ${exchange}, ${fsmState})
      ON CONFLICT DO NOTHING
    `;
  }

  async function getFsmState(symbol: string, exchange: string): Promise<string | null> {
    const pool = getPool();
    const rows = await pool`
      SELECT fsm_state FROM symbol_state
      WHERE symbol = ${symbol} AND exchange = ${exchange}
    `;
    return (rows[0]?.fsm_state as string) ?? null;
  }

  it("T-18-009: openWatchSession — IDLE → WATCHING when symbol_state is IDLE", async () => {
    await insertParentSymbol();
    await insertSymbolState("BTC/USDT", "binance", "IDLE");
    const db = getDb();

    await openWatchSession(db, makeOpenParams());

    expect(await getFsmState("BTC/USDT", "binance")).toBe("WATCHING");
  });

  it("T-18-009: openWatchSession — does not change HAS_POSITION (active ticket guard)", async () => {
    await insertParentSymbol();
    await insertSymbolState("BTC/USDT", "binance", "HAS_POSITION");
    const db = getDb();

    await openWatchSession(db, makeOpenParams());

    // fsm_state must remain HAS_POSITION
    expect(await getFsmState("BTC/USDT", "binance")).toBe("HAS_POSITION");
  });

  it("T-18-009: openWatchSession replacing active session — fsm_state stays WATCHING", async () => {
    await insertParentSymbol();
    await insertSymbolState("BTC/USDT", "binance", "IDLE");
    const db = getDb();

    // First open: IDLE → WATCHING
    await openWatchSession(db, makeOpenParams({ detectionType: "BB4_TOUCH" }));
    expect(await getFsmState("BTC/USDT", "binance")).toBe("WATCHING");

    // Second open (replaces first): fsm_state should remain WATCHING
    // The WHERE clause only transitions IDLE → WATCHING, so WATCHING is a no-op
    await openWatchSession(db, makeOpenParams({ detectionType: "SQUEEZE_BREAKOUT" }));
    expect(await getFsmState("BTC/USDT", "binance")).toBe("WATCHING");
  });

  it("T-18-009: invalidateWatchSession — WATCHING → IDLE", async () => {
    await insertParentSymbol();
    await insertSymbolState("BTC/USDT", "binance", "IDLE");
    const db = getDb();

    const session = await openWatchSession(db, makeOpenParams());
    expect(await getFsmState("BTC/USDT", "binance")).toBe("WATCHING");

    await invalidateWatchSession(db, session.id, "bias_changed");

    expect(await getFsmState("BTC/USDT", "binance")).toBe("IDLE");
  });

  it("T-18-009: invalidateWatchSession — does not change HAS_POSITION (active ticket guard)", async () => {
    await insertParentSymbol();
    await insertSymbolState("BTC/USDT", "binance", "IDLE");
    const db = getDb();

    // Open to get a session ID, then manually force HAS_POSITION (simulating ticket creation)
    const session = await openWatchSession(db, makeOpenParams());
    const pool = getPool();
    await pool`
      UPDATE symbol_state SET fsm_state = 'HAS_POSITION'
      WHERE symbol = 'BTC/USDT' AND exchange = 'binance'
    `;
    expect(await getFsmState("BTC/USDT", "binance")).toBe("HAS_POSITION");

    await invalidateWatchSession(db, session.id, "price_breakout");

    // Must not have been downgraded to IDLE
    expect(await getFsmState("BTC/USDT", "binance")).toBe("HAS_POSITION");
  });

  it("T-18-009: invalidateWatchSession on already-invalidated session — no fsm_state change", async () => {
    await insertParentSymbol();
    await insertSymbolState("BTC/USDT", "binance", "IDLE");
    const db = getDb();

    const session = await openWatchSession(db, makeOpenParams());

    // First invalidation: WATCHING → IDLE
    await invalidateWatchSession(db, session.id, "first_reason");
    expect(await getFsmState("BTC/USDT", "binance")).toBe("IDLE");

    // Second invalidation on already-IDLE: no change
    await invalidateWatchSession(db, session.id, "second_reason");
    expect(await getFsmState("BTC/USDT", "binance")).toBe("IDLE");
  });

  it("T-18-009: full lifecycle — IDLE → WATCHING (openWatchSession) → IDLE (invalidateWatchSession)", async () => {
    await insertParentSymbol();
    await insertSymbolState("BTC/USDT", "binance", "IDLE");
    const db = getDb();

    // Start: IDLE
    expect(await getFsmState("BTC/USDT", "binance")).toBe("IDLE");

    // Open: IDLE → WATCHING
    const session = await openWatchSession(db, makeOpenParams());
    expect(await getFsmState("BTC/USDT", "binance")).toBe("WATCHING");

    // Invalidate: WATCHING → IDLE
    await invalidateWatchSession(db, session.id, "bias_changed");
    expect(await getFsmState("BTC/USDT", "binance")).toBe("IDLE");
  });
});

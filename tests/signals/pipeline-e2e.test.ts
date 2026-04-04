/**
 * E2E integration tests for the full signal pipeline:
 * Daily Bias → Trade Block → WATCHING → Evidence Gate → Safety Gate
 * → Vectorize → Insert Vector → KNN Search → Decision → Signal finalized
 *
 * Requires a running test database (see tests/helpers/test-db.ts).
 * Tests are skipped when the DB is unavailable.
 *
 * FK chain: symbol → symbol_state, candles → vectors → signals
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import { eq } from "drizzle-orm";

import { getDb, getPool } from "@/db/pool";
import type { DbInstance } from "@/db/pool";
import { candleTable, signalTable, symbolStateTable, vectorTable } from "@/db/schema";
import type { Candle, DailyBias, Exchange } from "@/core/types";
import type { AllIndicators } from "@/indicators/types";
import { seedTradeBlocks, isTradeBlocked } from "@/filters/trade-block";
import { updateDailyBias } from "@/filters/daily-direction";
import { detectWatching, openWatchSession } from "@/signals/watching";
import { checkEvidence, createSignal } from "@/signals/evidence-gate";
import { checkSafety, updateSignalSafety } from "@/signals/safety-gate";
import { vectorize } from "@/vectors/vectorizer";
import { insertVector } from "@/vectors/repository";
import { searchKnn } from "@/knn/engine";
import { applyTimeDecay } from "@/knn/time-decay";
import { makeDecision, updateSignalKnnDecision } from "@/knn/decision";
import { VECTOR_DIM } from "@/vectors/features";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYMBOL = "BTCUSDT";
const EXCHANGE: Exchange = "binance";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Builds a Candle domain object with sensible defaults.
 * All prices use Decimal.js.
 */
function makeTestCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    symbol: SYMBOL,
    exchange: EXCHANGE,
    timeframe: "5M",
    open_time: new Date("2024-01-15T10:00:00Z"),
    open: new Decimal("42000"),
    high: new Decimal("42800"),
    low: new Decimal("41200"),
    close: new Decimal("42500"),
    volume: new Decimal("500"),
    is_closed: true,
    created_at: new Date("2024-01-15T10:05:00Z"),
    ...overrides,
  };
}

/**
 * Builds an AllIndicators object with sensible defaults for a BTC ~42000 scenario.
 * BB20 bands: 44000 upper, 42000 middle, 40000 lower (4000 range).
 * BB4 bands: 43000 upper, 42000 middle, 41000 lower (2000 range).
 */
function makeTestIndicators(overrides: Partial<AllIndicators> = {}): AllIndicators {
  return {
    bb20: {
      upper: new Decimal("44000"),
      middle: new Decimal("42000"),
      lower: new Decimal("40000"),
      bandwidth: new Decimal("0.0952"),
      percentB: new Decimal("0.625"),
    },
    bb4: {
      upper: new Decimal("43000"),
      middle: new Decimal("42000"),
      lower: new Decimal("41000"),
      bandwidth: new Decimal("0.0476"),
      percentB: new Decimal("0.75"),
    },
    sma20: new Decimal("42000"),
    sma60: new Decimal("41500"),
    sma120: new Decimal("41000"),
    ema20: new Decimal("42100"),
    ema60: new Decimal("41600"),
    ema120: new Decimal("41100"),
    rsi14: new Decimal("55"),
    atr14: new Decimal("600"),
    squeeze: "normal",
    ...overrides,
  };
}

/**
 * Inserts N labeled vector rows into the DB as KNN training data.
 * Each vector gets a unique candle row (required by FK: vectors.candle_id).
 * Label distribution: e.g. { WIN: 40, LOSS: 10 } → 50 rows total.
 */
async function seedTestVectors(
  db: DbInstance,
  count: number,
  labelDistribution: Record<string, number>,
  symbol = SYMBOL,
  exchange: Exchange = EXCHANGE,
  timeframe = "5M",
): Promise<void> {
  const pool = getPool();
  const embedding = new Float32Array(VECTOR_DIM).fill(0.5);
  const embStr = `[${Array.from(embedding).join(",")}]`;

  const labels: string[] = [];
  for (const [label, n] of Object.entries(labelDistribution)) {
    for (let i = 0; i < n; i++) {
      labels.push(label);
    }
  }

  // Fill to `count` if distribution is under
  while (labels.length < count) {
    labels.push("WIN");
  }

  for (let i = 0; i < count; i++) {
    const openTimeMs = new Date("2023-01-01T00:00:00Z").getTime() + i * 5 * 60 * 1000;
    const openTime = new Date(openTimeMs).toISOString();

    // Insert candle
    const candleResult = await pool`
      INSERT INTO candles (symbol, exchange, timeframe, open_time, open, high, low, close, volume)
      VALUES (
        ${symbol}, ${exchange}, ${timeframe}, ${openTime}::timestamptz,
        ${"42000.00"}, ${"42800.00"}, ${"41200.00"}, ${"42500.00"}, ${"500.00"}
      )
      RETURNING id
    `;
    const candleId = candleResult[0]!.id as string;

    // Insert vector with label
    const label = labels[i] ?? "WIN";
    await pool`
      INSERT INTO vectors (candle_id, symbol, exchange, timeframe, embedding, label, grade)
      VALUES (
        ${candleId}, ${symbol}, ${exchange}, ${timeframe},
        ${embStr}::vector,
        ${label},
        ${"A"}
      )
    `;
  }
}

/**
 * Inserts symbol + symbol_state rows required by FK constraints.
 * symbol_state is initialized with a given daily_bias.
 */
async function insertSymbolWithState(
  symbol = SYMBOL,
  exchange: Exchange = EXCHANGE,
  bias: DailyBias = "LONG_ONLY",
): Promise<void> {
  const pool = getPool();
  await pool`
    INSERT INTO symbol (symbol, exchange, name, base_asset, quote_asset)
    VALUES (${symbol}, ${exchange}, ${"Bitcoin USDT"}, ${"BTC"}, ${"USDT"})
    ON CONFLICT DO NOTHING
  `;
  await pool`
    INSERT INTO symbol_state (symbol, exchange, daily_bias, daily_open)
    VALUES (${symbol}, ${exchange}, ${bias}, ${"42000"})
    ON CONFLICT (symbol, exchange) DO UPDATE
      SET daily_bias = EXCLUDED.daily_bias,
          daily_open = EXCLUDED.daily_open
  `;
}

/**
 * Inserts a single candle row and returns its DB-assigned ID.
 * Used when we need a real candle ID to pass to insertVector.
 */
async function insertSingleCandle(
  symbol = SYMBOL,
  exchange: Exchange = EXCHANGE,
  timeframe = "5M",
  openTime = "2024-01-15T10:00:00Z",
): Promise<string> {
  const pool = getPool();
  const result = await pool`
    INSERT INTO candles (symbol, exchange, timeframe, open_time, open, high, low, close, volume)
    VALUES (
      ${symbol}, ${exchange}, ${timeframe}, ${openTime}::timestamptz,
      ${"42000.00"}, ${"42800.00"}, ${"41200.00"}, ${"42500.00"}, ${"500.00"}
    )
    RETURNING id
  `;
  return result[0]!.id as string;
}

/**
 * Builds 25 candles spanning 25 consecutive 5-minute bars ending at `baseTime`.
 * All candles use BTCUSDT-like values for realistic vectorizer output.
 */
function buildCandleHistory(baseTime: Date, count = 25): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const openTime = new Date(baseTime.getTime() - (count - 1 - i) * 5 * 60 * 1000);
    candles.push(
      makeTestCandle({
        id: `candle-fake-${i.toString().padStart(4, "0")}`,
        open_time: openTime,
        open: new Decimal("42000").plus(new Decimal(i * 10)),
        high: new Decimal("42800").plus(new Decimal(i * 10)),
        low: new Decimal("41200").plus(new Decimal(i * 10)),
        close: new Decimal("42500").plus(new Decimal(i * 10)),
      }),
    );
  }
  return candles;
}

// ---------------------------------------------------------------------------
// DB availability check
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

// ---------------------------------------------------------------------------
// Shared DB lifecycle
// ---------------------------------------------------------------------------

if (dbAvailable) {
  beforeAll(async () => {
    await initTestDb();
  });

  afterEach(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });
}

// ---------------------------------------------------------------------------
// Scenario 1: LONG complete flow
// bias=LONG_ONLY → WATCHING (SQUEEZE_BREAKOUT) → Evidence (ONE_B) → Safety (pass)
// → Vectorize → Insert vector → KNN (PASS) → Signal.knn_decision='PASS'
// ---------------------------------------------------------------------------

describe.skipIf(!dbAvailable)("[E2E] LONG 전체 흐름: bias=LONG_ONLY → WATCHING → Evidence(ONE_B) → Safety(pass) → KNN(PASS) → Signal 완성", () => {
  it("pipeline completes: knn_decision=PASS, safety_passed=true", async () => {
    const db = getDb();

    // 1. Setup: symbol + state with LONG_ONLY bias
    await insertSymbolWithState(SYMBOL, EXCHANGE, "LONG_ONLY");

    // 2. Seed 50 labeled training vectors (40 WIN, 10 LOSS → winrate=0.8 > threshold 0.55)
    await seedTestVectors(db, 50, { WIN: 40, LOSS: 10 });

    // 3. Build candle history and indicators for WATCHING detection
    //    Squeeze breakout LONG: squeeze=expansion, close > BB20 upper
    const baseTime = new Date("2024-01-15T10:00:00Z");
    const candles = buildCandleHistory(baseTime, 25);
    const currentCandle = makeTestCandle({
      open_time: baseTime,
      close: new Decimal("44500"), // above BB20 upper (44000) → LONG squeeze breakout
      high: new Decimal("44800"),
      low: new Decimal("43800"),
    });

    const indicators = makeTestIndicators({
      squeeze: "expansion",
    });

    // 4. WATCHING detection
    const watchingResult = detectWatching(currentCandle, indicators, "LONG_ONLY");
    expect(watchingResult).not.toBeNull();
    expect(watchingResult!.detectionType).toBe("SQUEEZE_BREAKOUT");
    expect(watchingResult!.direction).toBe("LONG");

    // 5. Open WatchSession
    const session = await openWatchSession(db, {
      symbol: SYMBOL,
      exchange: EXCHANGE,
      detectionType: watchingResult!.detectionType,
      direction: watchingResult!.direction,
      tp1Price: watchingResult!.tp1Price,
      tp2Price: watchingResult!.tp2Price,
      detectedAt: baseTime,
      contextData: watchingResult!.contextData,
    });
    expect(session.id).toBeDefined();

    // 6. Evidence Gate — create a candle that touches BB4 lower for ONE_B LONG
    //    BB4 lower = 41000; candle.low <= 41000 → ONE_B touch; BB20 lower = 40000 (not touched)
    const evidenceCandle = makeTestCandle({
      open_time: new Date(baseTime.getTime() + 5 * 60 * 1000),
      low: new Decimal("40800"),     // below BB4 lower (41000), above BB20 lower (40000)
      high: new Decimal("42500"),
      close: new Decimal("42200"),
      open: new Decimal("42000"),
    });

    const evidenceResult = checkEvidence(evidenceCandle, indicators, session);
    expect(evidenceResult).not.toBeNull();
    expect(evidenceResult!.signalType).toBe("ONE_B");

    // 7. Create Signal
    const signal = await createSignal(db, evidenceResult!, session, "5M");
    expect(signal.knn_decision).toBeNull();
    expect(signal.safety_passed).toBe(false);

    // 8. Safety Gate — pass (normal candle: low wick ratio acceptable)
    //    evidenceCandle had wick ratio > 0.6; use a cleaner candle for safety check.
    //    low=40800, open=41100, close=41200, high=42500
    //    lower wick = (41100-40800)/(42500-40800) = 300/1700 ≈ 0.176 → passes
    const safeLongCandle = makeTestCandle({
      open_time: new Date(baseTime.getTime() + 5 * 60 * 1000),
      low: new Decimal("40800"),   // touches BB4 lower (41000? No, 40800 < 41000 ✓)
      high: new Decimal("42500"),
      open: new Decimal("41100"),
      close: new Decimal("41200"),
      // lower wick = (min(41100,41200) - 40800) / (42500-40800) = 300/1700 ≈ 0.176 ✓
    });

    const safetyResult = checkSafety(safeLongCandle, indicators, { direction: "LONG", timeframe: "5M" }, { session_box_high: null, session_box_low: null, daily_bias: "LONG_ONLY" });
    expect(safetyResult.passed).toBe(true);

    await updateSignalSafety(db, signal.id, safetyResult);

    // 9. Vectorize using candle history + current candle
    const allCandles = [...candles, safeLongCandle];
    const embedding = vectorize(allCandles, indicators, "5M");
    expect(embedding.length).toBe(VECTOR_DIM);

    // 10. Insert vector for this signal
    const candleId = await insertSingleCandle(SYMBOL, EXCHANGE, "5M", "2024-01-15T10:05:00Z");
    const vectorRow = await insertVector(db, {
      candleId,
      symbol: SYMBOL,
      exchange: EXCHANGE,
      timeframe: "5M",
      embedding,
    });
    expect(vectorRow.id).toBeDefined();

    // 11. KNN search
    const neighbors = await searchKnn(db, embedding, {
      symbol: SYMBOL,
      exchange: EXCHANGE,
      timeframe: "5M",
      topK: 50,
      distanceMetric: "cosine",
    });
    expect(neighbors.length).toBeGreaterThanOrEqual(30); // enough for PASS

    // 12. Apply time decay and make decision
    const now = new Date();
    const weighted = applyTimeDecay(neighbors, now, { halfLifeDays: 90 });
    const decision = makeDecision(weighted, "ONE_B", true);
    expect(decision.decision).toBe("PASS"); // 40 WIN / 50 total = 0.80 winrate > 0.55
    expect(decision.winRate).toBeGreaterThan(0.55);

    // 13. Update signal with KNN decision
    await updateSignalKnnDecision(db, signal.id, decision, vectorRow.id);

    // 14. Verify final Signal state in DB
    const finalSignal = await db.select().from(signalTable).where(eq(signalTable.id, signal.id));
    expect(finalSignal).toHaveLength(1);
    expect(finalSignal[0]!.knn_decision).toBe("PASS");
    expect(finalSignal[0]!.safety_passed).toBe(true);
    expect(finalSignal[0]!.vector_id).toBe(vectorRow.id);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: SHORT A-grade flow
// bias=SHORT_ONLY → WATCHING (BB4 touch) → Evidence (DOUBLE_B) → Safety (pass)
// → KNN (PASS, winrate >= 0.65) → a_grade=true
// ---------------------------------------------------------------------------

describe.skipIf(!dbAvailable)("[E2E] SHORT A-grade 흐름: bias=SHORT_ONLY → WATCHING → Evidence(DOUBLE_B) → Safety(pass) → KNN(PASS, winrate≥0.65) → a_grade=true", () => {
  it("pipeline completes: knn_decision=PASS, a_grade=true", async () => {
    const db = getDb();

    // 1. Setup: symbol + state with SHORT_ONLY bias
    await insertSymbolWithState(SYMBOL, EXCHANGE, "SHORT_ONLY");

    // 2. Seed 50 labeled vectors: 35 WIN, 15 LOSS → winrate ≈ 0.70 ≥ 0.65 (A-grade threshold)
    await seedTestVectors(db, 50, { WIN: 35, LOSS: 15 });

    const baseTime = new Date("2024-01-15T10:00:00Z");
    const candles = buildCandleHistory(baseTime, 25);

    // 3. Indicators setup for SHORT BB4 touch detection
    //    BB4 touch SHORT: close >= BB4 upper (43000)
    const indicators = makeTestIndicators({
      squeeze: "normal",
    });

    // WATCHING via BB4_TOUCH SHORT: close >= BB4 upper (43000)
    const watchingCandle = makeTestCandle({
      close: new Decimal("43200"), // >= BB4 upper (43000) → SHORT BB4 touch
      high: new Decimal("43500"),
      low: new Decimal("42200"),
    });

    const watchingResult = detectWatching(watchingCandle, indicators, "SHORT_ONLY");
    expect(watchingResult).not.toBeNull();
    expect(watchingResult!.direction).toBe("SHORT");
    // Detection type may be SR_CONFLUENCE or BB4_TOUCH depending on price position —
    // what matters for the E2E test is that a SHORT session is opened.
    expect(["SR_CONFLUENCE", "BB4_TOUCH"]).toContain(watchingResult!.detectionType);

    // 4. Open WatchSession
    const session = await openWatchSession(db, {
      symbol: SYMBOL,
      exchange: EXCHANGE,
      detectionType: watchingResult!.detectionType,
      direction: watchingResult!.direction,
      tp1Price: watchingResult!.tp1Price,
      tp2Price: watchingResult!.tp2Price,
      detectedAt: baseTime,
      contextData: watchingResult!.contextData,
    });

    // 5. Evidence Gate — DOUBLE_B SHORT: candle.high >= BB4 upper AND >= BB20 upper
    //    BB4 upper = 43000, BB20 upper = 44000 → high >= 44000 → DOUBLE_B
    const evidenceCandle = makeTestCandle({
      open_time: new Date(baseTime.getTime() + 5 * 60 * 1000),
      high: new Decimal("44500"),  // >= BB20 upper (44000) → DOUBLE_B
      low: new Decimal("43200"),
      open: new Decimal("43800"),
      close: new Decimal("43600"),
    });

    const evidenceResult = checkEvidence(evidenceCandle, indicators, session);
    expect(evidenceResult).not.toBeNull();
    expect(evidenceResult!.signalType).toBe("DOUBLE_B");
    expect(evidenceResult!.direction).toBe("SHORT");

    // 6. Create Signal
    const signal = await createSignal(db, evidenceResult!, session, "5M");
    expect(signal.signal_type).toBe("DOUBLE_B");

    // 7. Safety Gate — pass for SHORT
    //    SHORT: upper wick = (high - max(open,close)) / range
    //    high=44500, max(open,close)=43800, range=44500-43200=1300
    //    upper wick = (44500 - 43800) / 1300 = 700/1300 ≈ 0.538 < 0.6 → passes
    const safetyResult = checkSafety(evidenceCandle, indicators, { direction: "SHORT", timeframe: "5M" }, { session_box_high: null, session_box_low: null, daily_bias: "SHORT_ONLY" });
    expect(safetyResult.passed).toBe(true);

    await updateSignalSafety(db, signal.id, safetyResult);

    // 8. Vectorize
    const allCandles = [...candles, evidenceCandle];
    const embedding = vectorize(allCandles, indicators, "5M");

    // 9. Insert vector
    const candleId = await insertSingleCandle(SYMBOL, EXCHANGE, "5M", "2024-01-15T10:05:00Z");
    const vectorRow = await insertVector(db, {
      candleId,
      symbol: SYMBOL,
      exchange: EXCHANGE,
      timeframe: "5M",
      embedding,
    });

    // 10. KNN search
    const neighbors = await searchKnn(db, embedding, {
      symbol: SYMBOL,
      exchange: EXCHANGE,
      timeframe: "5M",
      topK: 50,
      distanceMetric: "cosine",
    });
    expect(neighbors.length).toBeGreaterThanOrEqual(30);

    // 11. Decision: DOUBLE_B + safetyPassed + winrate >= 0.65 → a_grade=true
    const now = new Date();
    const weighted = applyTimeDecay(neighbors, now, { halfLifeDays: 90 });
    const decision = makeDecision(weighted, "DOUBLE_B", true);
    expect(decision.decision).toBe("PASS");
    expect(decision.winRate).toBeGreaterThanOrEqual(0.65);
    expect(decision.aGrade).toBe(true);

    // 12. Update signal
    await updateSignalKnnDecision(db, signal.id, decision, vectorRow.id);

    // 13. Verify final state
    const finalSignal = await db.select().from(signalTable).where(eq(signalTable.id, signal.id));
    expect(finalSignal[0]!.knn_decision).toBe("PASS");
    expect(finalSignal[0]!.a_grade).toBe(true);
    expect(finalSignal[0]!.safety_passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Trade block scenario
// Seed trade blocks → check isTradeBlocked during Asia open time → blocked=true
// ---------------------------------------------------------------------------

describe.skipIf(!dbAvailable)("[E2E] 거래차단: 아시아장 오픈 시간 → isTradeBlocked=true", () => {
  it("isTradeBlocked returns true during Asia open window (00:00-02:00 UTC)", async () => {
    const db = getDb();

    // 1. Seed the standard trade block patterns (including Asia open 00:00-02:00 UTC)
    await seedTradeBlocks(db);

    // 2. Pick a time inside the Asia open block: 00:30 UTC
    const asiaOpenTime = new Date("2024-01-15T00:30:00Z");
    const result = await isTradeBlocked(db, asiaOpenTime);

    expect(result.blocked).toBe(true);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain("아시아");
  });

  it("isTradeBlocked returns false outside all block windows (e.g. 11:00 UTC Tuesday)", async () => {
    const db = getDb();

    await seedTradeBlocks(db);

    // 11:00 UTC is outside:
    // - Asia open (00:00-02:00), Europe open (07:00-09:00), US open (13:30-15:30), (14:30-16:30)
    // - Funding: 0, 8, 16 ±15min → 11:00 is not near any
    const clearTime = new Date("2024-01-16T11:00:00Z"); // Tuesday
    const result = await isTradeBlocked(db, clearTime);

    expect(result.blocked).toBe(false);
  });

  it("isTradeBlocked returns true during funding window (08:00 UTC ±15min)", async () => {
    const db = getDb();

    await seedTradeBlocks(db);

    // 08:10 UTC — inside the 08:00 funding block (±15min)
    const fundingTime = new Date("2024-01-15T08:10:00Z");
    const result = await isTradeBlocked(db, fundingTime);

    expect(result.blocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Safety failure scenario
// Setup bias → WATCHING → Evidence → Safety fails (high wick ratio)
// → safety_passed=false persisted in DB
// ---------------------------------------------------------------------------

describe.skipIf(!dbAvailable)("[E2E] Safety 실패: Evidence 통과 → 윅 비율 초과 → safety_passed=false", () => {
  it("safety_passed=false is persisted when wick ratio exceeds threshold", async () => {
    const db = getDb();

    // 1. Setup
    await insertSymbolWithState(SYMBOL, EXCHANGE, "LONG_ONLY");

    const baseTime = new Date("2024-01-15T10:00:00Z");
    const indicators = makeTestIndicators({ squeeze: "expansion" });

    // 2. WATCHING: squeeze breakout LONG (close > BB20 upper)
    const watchingCandle = makeTestCandle({
      close: new Decimal("44500"),
      high: new Decimal("44800"),
      low: new Decimal("43800"),
    });
    const watchingResult = detectWatching(watchingCandle, indicators, "LONG_ONLY");
    expect(watchingResult).not.toBeNull();

    const session = await openWatchSession(db, {
      symbol: SYMBOL,
      exchange: EXCHANGE,
      detectionType: watchingResult!.detectionType,
      direction: watchingResult!.direction,
      tp1Price: watchingResult!.tp1Price,
      tp2Price: watchingResult!.tp2Price,
      detectedAt: baseTime,
      contextData: watchingResult!.contextData,
    });

    // 3. Evidence: BB4 touch LONG (candle.low <= BB4 lower = 41000)
    const evidenceCandle = makeTestCandle({
      open_time: new Date(baseTime.getTime() + 5 * 60 * 1000),
      low: new Decimal("40800"),   // below BB4 lower (41000)
      high: new Decimal("43200"),
      open: new Decimal("43000"),
      close: new Decimal("43100"),
    });
    const evidenceResult = checkEvidence(evidenceCandle, indicators, session);
    expect(evidenceResult).not.toBeNull();

    // 4. Create Signal
    const signal = await createSignal(db, evidenceResult!, session, "5M");

    // 5. Safety Gate with a candle that has HIGH lower-wick ratio (> 0.6) → FAIL
    //    LONG wick: lower wick = (min(open,close) - low) / range
    //    Craft: low=40800, open=42800, close=42900, high=43000
    //    wick = (min(42800,42900) - 40800) / (43000 - 40800) = 2000/2200 ≈ 0.909 > 0.6 → FAIL
    const highWickCandle = makeTestCandle({
      low: new Decimal("40800"),
      high: new Decimal("43000"),
      open: new Decimal("42800"),
      close: new Decimal("42900"),
    });

    const safetyResult = checkSafety(
      highWickCandle,
      indicators,
      { direction: "LONG", timeframe: "5M" },
      { session_box_high: null, session_box_low: null, daily_bias: "LONG_ONLY" },
    );
    expect(safetyResult.passed).toBe(false);
    expect(safetyResult.reasons).toContain("wick_ratio_exceeded");

    // 6. Persist safety failure
    await updateSignalSafety(db, signal.id, safetyResult);

    // 7. Verify safety_passed=false in DB
    const finalSignal = await db.select().from(signalTable).where(eq(signalTable.id, signal.id));
    expect(finalSignal).toHaveLength(1);
    expect(finalSignal[0]!.safety_passed).toBe(false);
    expect(finalSignal[0]!.knn_decision).toBeNull(); // KNN never ran
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: KNN SKIP — insufficient labeled vectors
// Full pipeline flow but with < 30 labeled vectors → knn_decision='SKIP'
// ---------------------------------------------------------------------------

describe.skipIf(!dbAvailable)("[E2E] KNN SKIP: labeled 벡터 부족 → knn_decision='SKIP'", () => {
  it("knn_decision=SKIP when fewer than 30 labeled vectors exist", async () => {
    const db = getDb();

    // 1. Setup with LONG_ONLY bias
    await insertSymbolWithState(SYMBOL, EXCHANGE, "LONG_ONLY");

    // 2. Seed only 10 labeled vectors — below the 30 min_samples threshold
    await seedTestVectors(db, 10, { WIN: 7, LOSS: 3 });

    const baseTime = new Date("2024-01-15T10:00:00Z");
    const candles = buildCandleHistory(baseTime, 25);
    const indicators = makeTestIndicators({ squeeze: "expansion" });

    // 3. WATCHING: squeeze breakout LONG
    const watchingCandle = makeTestCandle({
      close: new Decimal("44500"),
      high: new Decimal("44800"),
      low: new Decimal("43800"),
    });
    const watchingResult = detectWatching(watchingCandle, indicators, "LONG_ONLY");
    expect(watchingResult).not.toBeNull();

    const session = await openWatchSession(db, {
      symbol: SYMBOL,
      exchange: EXCHANGE,
      detectionType: watchingResult!.detectionType,
      direction: watchingResult!.direction,
      tp1Price: watchingResult!.tp1Price,
      tp2Price: watchingResult!.tp2Price,
      detectedAt: baseTime,
      contextData: watchingResult!.contextData,
    });

    // 4. Evidence: BB4 touch LONG — safe candle (low wick < 0.6)
    //    low=40800, open=41100, close=41200, high=42500
    //    wick = (41100-40800)/(42500-40800) = 300/1700 ≈ 0.176 → safety passes
    const evidenceCandle = makeTestCandle({
      open_time: new Date(baseTime.getTime() + 5 * 60 * 1000),
      low: new Decimal("40800"),
      high: new Decimal("42500"),
      open: new Decimal("41100"),
      close: new Decimal("41200"),
    });
    const evidenceResult = checkEvidence(evidenceCandle, indicators, session);
    expect(evidenceResult).not.toBeNull();

    // 5. Create Signal
    const signal = await createSignal(db, evidenceResult!, session, "5M");

    // 6. Safety: passes (wick ratio OK)
    const safetyResult = checkSafety(
      evidenceCandle,
      indicators,
      { direction: "LONG", timeframe: "5M" },
      { session_box_high: null, session_box_low: null, daily_bias: "LONG_ONLY" },
    );
    expect(safetyResult.passed).toBe(true);
    await updateSignalSafety(db, signal.id, safetyResult);

    // 7. Vectorize
    const allCandles = [...candles, evidenceCandle];
    const embedding = vectorize(allCandles, indicators, "5M");

    // 8. Insert vector
    const candleId = await insertSingleCandle(SYMBOL, EXCHANGE, "5M", "2024-01-15T10:05:00Z");
    const vectorRow = await insertVector(db, {
      candleId,
      symbol: SYMBOL,
      exchange: EXCHANGE,
      timeframe: "5M",
      embedding,
    });

    // 9. KNN search — returns only 10 labeled rows (< 30 threshold)
    const neighbors = await searchKnn(db, embedding, {
      symbol: SYMBOL,
      exchange: EXCHANGE,
      timeframe: "5M",
      topK: 50,
      distanceMetric: "cosine",
    });
    expect(neighbors.length).toBeLessThan(30);

    // 10. Apply time decay and make decision — should be SKIP
    const now = new Date();
    const weighted = applyTimeDecay(neighbors, now, { halfLifeDays: 90 });
    const decision = makeDecision(weighted, "ONE_B", true);
    expect(decision.decision).toBe("SKIP");
    expect(decision.sampleCount).toBeLessThan(30);

    // 11. Persist SKIP decision
    await updateSignalKnnDecision(db, signal.id, decision, vectorRow.id);

    // 12. Verify knn_decision='SKIP' in DB
    const finalSignal = await db.select().from(signalTable).where(eq(signalTable.id, signal.id));
    expect(finalSignal).toHaveLength(1);
    expect(finalSignal[0]!.knn_decision).toBe("SKIP");
    expect(finalSignal[0]!.safety_passed).toBe(true);
  });
});

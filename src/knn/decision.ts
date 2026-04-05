import { and, eq } from "drizzle-orm";

import type { KnnDecision } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import { commonCodeTable, signalTable } from "@/db/schema";
import type { WeightedNeighbor } from "@/knn/time-decay";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { KnnDecision } from "@/core/types";

/** The resolved output of a KNN decision computation. */
export type KnnDecisionResult = {
  /** PASS → entry allowed; FAIL → entry blocked; SKIP → insufficient data */
  decision: KnnDecision;
  /** Weighted win rate in [0, 1]. 0 when sampleCount is 0. */
  winRate: number;
  /** Weighted expectancy in [-1, 1]. 0 when sampleCount is 0. */
  expectancy: number;
  /** Number of labeled neighbors used for the calculation. */
  sampleCount: number;
  /** True when signal qualifies for position-size boost. */
  aGrade: boolean;
};

/** Configuration thresholds used by makeDecision. */
export type KnnDecisionConfig = {
  winrateThreshold: number;
  minSamples: number;
  aGradeWinrateThreshold: number;
  /** Minimum labeled-neighbor count required when the signal is A-grade (default 20). */
  aGradeMinSamples: number;
  /** Round-trip commission rate deducted from raw expectancy (default 0.0008 = 0.08%). */
  commissionPct: number;
};

// ---------------------------------------------------------------------------
// Constants (hard-coded defaults — override via CommonCode KNN group)
// ---------------------------------------------------------------------------

const DEFAULT_WINRATE_THRESHOLD = 0.55;
const DEFAULT_MIN_SAMPLES = 30;
const DEFAULT_A_GRADE_WINRATE_THRESHOLD = 0.5;
const DEFAULT_A_GRADE_MIN_SAMPLES = 20;
const DEFAULT_COMMISSION_PCT = 0.0008;

// ---------------------------------------------------------------------------
// Pure decision function
// ---------------------------------------------------------------------------

/**
 * Derives a KNN decision from a set of time-decay-weighted neighbors.
 *
 * Decision rules (evaluated in order):
 *  1. SKIP  — sampleCount < effectiveMinSamples (or neighbors array is empty)
 *  2. PASS  — winRate ≥ effectiveWinrateThreshold AND expectancy > 0
 *  3. FAIL  — otherwise
 *
 * A-grade branching (PRD §7.9):
 *  - isAGrade=true  → effectiveMinSamples = aGradeMinSamples (default 20),
 *                     effectiveWinrateThreshold = aGradeWinrateThreshold (default 0.50)
 *  - isAGrade=false → effectiveMinSamples = minSamples (default 30),
 *                     effectiveWinrateThreshold = winrateThreshold (default 0.55)
 *
 * The isAGrade flag is determined externally (evidence-gate.ts: 1H BB4 touch)
 * and passed in — this function never derives it internally.
 *
 * @param neighbors - Time-decay-weighted KNN neighbors (labeled only).
 * @param isAGrade  - Whether the signal qualifies as A-grade (1H BB4 touch detected).
 * @param config    - Optional override for decision thresholds.
 * @returns KnnDecisionResult with decision, winRate, expectancy, sampleCount, aGrade.
 */
export function makeDecision(
  neighbors: WeightedNeighbor[],
  isAGrade: boolean,
  config: KnnDecisionConfig = {
    winrateThreshold: DEFAULT_WINRATE_THRESHOLD,
    minSamples: DEFAULT_MIN_SAMPLES,
    aGradeWinrateThreshold: DEFAULT_A_GRADE_WINRATE_THRESHOLD,
    aGradeMinSamples: DEFAULT_A_GRADE_MIN_SAMPLES,
    commissionPct: DEFAULT_COMMISSION_PCT,
  },
): KnnDecisionResult {
  // A급 분기: 완화된 임계값 vs 엄격한 임계값
  const effectiveMinSamples = isAGrade ? config.aGradeMinSamples : config.minSamples;
  const effectiveWinrateThreshold = isAGrade
    ? config.aGradeWinrateThreshold
    : config.winrateThreshold;

  // Filter to neighbors with non-null labels
  const labeled = neighbors.filter((n) => n.label !== null);
  const sampleCount = labeled.length;

  // Not enough data — aGrade=false when insufficient samples regardless of isAGrade
  if (sampleCount < effectiveMinSamples) {
    return { decision: "SKIP", winRate: 0, expectancy: 0, sampleCount, aGrade: false };
  }

  // Compute weighted sums
  let weightSum = 0;
  let winWeightedSum = 0;
  let expectancyWeightedSum = 0;

  for (const neighbor of labeled) {
    const w = neighbor.weight;
    weightSum += w;

    // Weighted win rate: isWin = label === 'WIN' ? 1 : 0
    winWeightedSum += w * (neighbor.label === "WIN" ? 1 : 0);

    // Weighted expectancy: WIN → +1, LOSS → -1, TIME_EXIT → -0.5
    let pnlDir: number;
    if (neighbor.label === "WIN") {
      pnlDir = 1;
    } else if (neighbor.label === "LOSS") {
      pnlDir = -1;
    } else {
      // TIME_EXIT
      pnlDir = -0.5;
    }
    expectancyWeightedSum += w * pnlDir;
  }

  const winRate = weightSum > 0 ? winWeightedSum / weightSum : 0;
  const rawExpectancy = weightSum > 0 ? expectancyWeightedSum / weightSum : 0;
  const expectancy = rawExpectancy - config.commissionPct;

  // PASS / FAIL — expectancy condition uses net (fee-deducted) value
  const decision: KnnDecision =
    winRate >= effectiveWinrateThreshold && expectancy > 0 ? "PASS" : "FAIL";

  // aGrade: isAGrade pass-through — 내부에서 재결정하지 않는다.
  // FAIL인 경우에도 aGrade=isAGrade를 유지하여 DB 기록에서 등급 정보를 보존한다.
  const aGrade = isAGrade;

  return { decision, winRate, expectancy, sampleCount, aGrade };
}

// ---------------------------------------------------------------------------
// DB update
// ---------------------------------------------------------------------------

/**
 * Updates a Signal row with the KNN decision result.
 *
 * Sets knn_decision, a_grade, and vector_id in a single UPDATE statement.
 *
 * @param db       - Drizzle ORM instance.
 * @param signalId - UUID of the Signal to update.
 * @param result   - Decision result from makeDecision().
 * @param vectorId - UUID of the query vector stored for this signal.
 */
export async function updateSignalKnnDecision(
  db: DbInstance,
  signalId: string,
  result: KnnDecisionResult,
  vectorId: string,
): Promise<void> {
  await db
    .update(signalTable)
    .set({
      knn_decision: result.decision,
      a_grade: result.aGrade,
      vector_id: vectorId,
    })
    .where(eq(signalTable.id, signalId));
}

// ---------------------------------------------------------------------------
// DB-backed config loader
// ---------------------------------------------------------------------------

/**
 * Loads the KNN decision thresholds from the CommonCode table (KNN group).
 *
 * Reads:
 *  - `KNN.winrate_threshold`         → default 0.55
 *  - `KNN.min_samples`               → default 30
 *  - `KNN.a_grade_winrate_threshold` → default 0.50
 *  - `KNN.a_grade_min_samples`       → default 20
 *  - `KNN.commission_pct`            → default 0.0008
 *
 * Falls back to the hard-coded default for any row that is absent, inactive,
 * or contains an invalid value.
 *
 * @param db - Drizzle ORM instance (from getDb()).
 * @returns Resolved KnnDecisionConfig.
 */
export async function loadKnnDecisionConfig(db: DbInstance): Promise<KnnDecisionConfig> {
  const rows = await db
    .select({ code: commonCodeTable.code, value: commonCodeTable.value })
    .from(commonCodeTable)
    .where(and(eq(commonCodeTable.group_code, "KNN"), eq(commonCodeTable.is_active, true)));

  let winrateThreshold = DEFAULT_WINRATE_THRESHOLD;
  let minSamples = DEFAULT_MIN_SAMPLES;
  let aGradeWinrateThreshold = DEFAULT_A_GRADE_WINRATE_THRESHOLD;
  let aGradeMinSamples = DEFAULT_A_GRADE_MIN_SAMPLES;
  let commissionPct = DEFAULT_COMMISSION_PCT;

  for (const row of rows) {
    if (row.code === "winrate_threshold") {
      const raw = row.value;
      if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw <= 1) {
        winrateThreshold = raw;
      }
    } else if (row.code === "min_samples") {
      const raw = row.value;
      if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
        minSamples = Math.floor(raw);
      }
    } else if (row.code === "a_grade_winrate_threshold") {
      const raw = row.value;
      if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw <= 1) {
        aGradeWinrateThreshold = raw;
      }
    } else if (row.code === "a_grade_min_samples") {
      const raw = row.value;
      if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
        aGradeMinSamples = Math.floor(raw);
      }
    } else if (row.code === "commission_pct") {
      const raw = row.value;
      if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
        commissionPct = raw;
      }
    }
  }

  return { winrateThreshold, minSamples, aGradeWinrateThreshold, aGradeMinSamples, commissionPct };
}

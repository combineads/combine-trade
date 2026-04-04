import { and, eq } from "drizzle-orm";

import type { KnnDecision, SignalType } from "@/core/types";
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
};

// ---------------------------------------------------------------------------
// Constants (hard-coded defaults — override via CommonCode KNN group)
// ---------------------------------------------------------------------------

const DEFAULT_WINRATE_THRESHOLD = 0.55;
const DEFAULT_MIN_SAMPLES = 30;
const DEFAULT_A_GRADE_WINRATE_THRESHOLD = 0.65;

// ---------------------------------------------------------------------------
// Pure decision function
// ---------------------------------------------------------------------------

/**
 * Derives a KNN decision from a set of time-decay-weighted neighbors.
 *
 * Decision rules (evaluated in order):
 *  1. SKIP  — sampleCount < minSamples (or neighbors array is empty)
 *  2. PASS  — winRate ≥ winrateThreshold AND expectancy > 0
 *  3. FAIL  — otherwise
 *
 * A-grade criteria (all must be true):
 *  - signalType === 'DOUBLE_B'
 *  - safetyPassed === true
 *  - winRate ≥ aGradeWinrateThreshold
 *
 * @param neighbors   - Time-decay-weighted KNN neighbors (labeled only).
 * @param signalType  - Signal type of the candidate entry.
 * @param safetyPassed - Whether the pre-entry safety check passed.
 * @param config      - Optional override for decision thresholds.
 * @returns KnnDecisionResult with decision, winRate, expectancy, sampleCount, aGrade.
 */
export function makeDecision(
  neighbors: WeightedNeighbor[],
  signalType: SignalType,
  safetyPassed: boolean,
  config: KnnDecisionConfig = {
    winrateThreshold: DEFAULT_WINRATE_THRESHOLD,
    minSamples: DEFAULT_MIN_SAMPLES,
    aGradeWinrateThreshold: DEFAULT_A_GRADE_WINRATE_THRESHOLD,
  },
): KnnDecisionResult {
  // Filter to neighbors with non-null labels
  const labeled = neighbors.filter((n) => n.label !== null);
  const sampleCount = labeled.length;

  // Not enough data
  if (sampleCount < config.minSamples) {
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
  const expectancy = weightSum > 0 ? expectancyWeightedSum / weightSum : 0;

  // PASS / FAIL
  const decision: KnnDecision =
    winRate >= config.winrateThreshold && expectancy > 0 ? "PASS" : "FAIL";

  // A-grade
  const aGrade =
    signalType === "DOUBLE_B" && safetyPassed === true && winRate >= config.aGradeWinrateThreshold;

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
 *  - `KNN.winrate_threshold`       → default 0.55
 *  - `KNN.min_samples`             → default 30
 *  - `KNN.a_grade_winrate_threshold` → default 0.65
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
    }
  }

  return { winrateThreshold, minSamples, aGradeWinrateThreshold };
}

import type { FullMetrics } from "@/backtest/metrics";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Defines the search range for a single tunable parameter.
 * - group: CommonCode group (e.g. "KNN", "POSITION", "FEATURE_WEIGHT")
 * - code: parameter code used as the key in ParamSet
 * - min, max: inclusive range bounds
 * - step: increment between candidate values
 *
 * ANCHOR group parameters are structurally fixed and must never appear in
 * a ParamSpace — they are rejected at runtime.
 */
export type ParamSpace = {
  group: string;
  code: string;
  min: number;
  max: number;
  step: number;
};

/**
 * A concrete parameter combination: maps each param code to its value.
 */
export type ParamSet = Record<string, number>;

/**
 * The result of running a backtest with a specific ParamSet.
 */
export type ParamResult = {
  params: ParamSet;
  metrics: FullMetrics;
};

// ---------------------------------------------------------------------------
// Tunable parameter whitelist (PRD §7.25)
// ---------------------------------------------------------------------------

/**
 * The complete set of tunable parameter group/code combinations.
 *
 * Rules (PRD §7.25 L475–476):
 *  - All KNN group codes are tunable.
 *  - All FEATURE_WEIGHT group codes are tunable.
 *  - Only SYMBOL_CONFIG.risk_pct is tunable (not the rest of SYMBOL_CONFIG).
 *  - ANCHOR group is always blocked (structurally fixed).
 *  - All other group/code combinations are blocked.
 *
 * The sentinel "*" means "all codes in this group are allowed".
 */
export const TUNABLE_PARAM_WHITELIST: ReadonlyArray<{ group: string; code: string }> = [
  { group: "KNN", code: "*" },
  { group: "FEATURE_WEIGHT", code: "*" },
  { group: "SYMBOL_CONFIG", code: "risk_pct" },
] as const;

/**
 * Checks whether a single ParamSpace entry is permitted by the whitelist.
 */
function isTunable(space: ParamSpace): boolean {
  return TUNABLE_PARAM_WHITELIST.some(
    (entry) => entry.group === space.group && (entry.code === "*" || entry.code === space.code),
  );
}

/**
 * Throws if any space in the array is not on the tunable whitelist.
 * Also catches the ANCHOR group before it reaches rejectAnchorGroup.
 *
 * @throws {Error} "not in tunable whitelist" when a blocked param is found.
 */
export function assertTunableParams(spaces: ParamSpace[]): void {
  for (const space of spaces) {
    if (!isTunable(space)) {
      throw new Error(
        `ParamSpace "${space.group}.${space.code}" is not in tunable whitelist. ` +
          "Only KNN.*, FEATURE_WEIGHT.*, and SYMBOL_CONFIG.risk_pct may be tuned.",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Throws if any space belongs to the ANCHOR group.
 * ANCHOR parameters define structural anchors (BB20, BB4, MA periods, etc.)
 * that are code-fixed and must never be tuned.
 */
function rejectAnchorGroup(spaces: ParamSpace[]): void {
  const anchor = spaces.find((s) => s.group === "ANCHOR");
  if (anchor !== undefined) {
    throw new Error(
      `ParamSpace "${anchor.code}" belongs to the ANCHOR group. ` +
        "ANCHOR parameters are structurally fixed and cannot be tuned.",
    );
  }
}

/**
 * Returns all candidate values for a single ParamSpace as an array.
 * Values are produced by stepping from min to max (inclusive) by step.
 * Uses integer arithmetic to avoid floating-point accumulation errors.
 */
function expandSpace(space: ParamSpace): number[] {
  const { min, max, step } = space;
  const values: number[] = [];
  // Work in integer units to avoid floating-point drift
  const scale = 1e9; // 9 decimal places of precision for step
  const iMin = Math.round(min * scale);
  const iMax = Math.round(max * scale);
  const iStep = Math.round(step * scale);

  for (let v = iMin; v <= iMax + Number.EPSILON * scale; v += iStep) {
    values.push(Math.round(v) / scale);
  }
  return values;
}

/**
 * Snap a raw random value to the nearest step multiple above min.
 */
function snapToStep(value: number, min: number, max: number, step: number): number {
  const scale = 1e9;
  const iMin = Math.round(min * scale);
  const iStep = Math.round(step * scale);
  const iValue = Math.round(value * scale);
  const steps = Math.round((iValue - iMin) / iStep);
  const snapped = iMin + steps * iStep;
  // Clamp to [min, max]
  const iMax = Math.round(max * scale);
  const clamped = Math.min(Math.max(snapped, iMin), iMax);
  return Math.round(clamped) / scale;
}

// ---------------------------------------------------------------------------
// generateGridCombinations
// ---------------------------------------------------------------------------

/**
 * Generates the full cartesian product of all parameter spaces.
 *
 * Each ParamSpace produces a sequence of values from min to max at step
 * intervals (inclusive on both ends). The result is the cross-product of
 * all those sequences — one ParamSet per combination.
 *
 * Throws if any space belongs to the ANCHOR group.
 *
 * @example
 *   generateGridCombinations([{code:"a", min:1, max:3, step:1}])
 *   // → [{a:1}, {a:2}, {a:3}]
 */
export function generateGridCombinations(spaces: ParamSpace[]): ParamSet[] {
  rejectAnchorGroup(spaces);

  if (spaces.length === 0) {
    return [{}];
  }

  // Build value arrays for each space
  const expanded: Array<{ code: string; values: number[] }> = spaces.map((space) => ({
    code: space.code,
    values: expandSpace(space),
  }));

  // Iterative cartesian product (avoids deep recursion for large grids)
  let combinations: ParamSet[] = [{}];

  for (const { code, values } of expanded) {
    const next: ParamSet[] = [];
    for (const existing of combinations) {
      for (const value of values) {
        next.push({ ...existing, [code]: value });
      }
    }
    combinations = next;
  }

  return combinations;
}

// ---------------------------------------------------------------------------
// generateRandomCombinations
// ---------------------------------------------------------------------------

/**
 * Generates `n` random ParamSets by uniform sampling within each space.
 *
 * Each sampled value is snapped to the nearest step-aligned grid point
 * within [min, max], so results are always valid step multiples.
 *
 * Throws if any space belongs to the ANCHOR group.
 *
 * @param spaces  Parameter spaces to sample from.
 * @param n       Number of random combinations to generate.
 */
export function generateRandomCombinations(spaces: ParamSpace[], n: number): ParamSet[] {
  rejectAnchorGroup(spaces);

  const results: ParamSet[] = [];

  for (let i = 0; i < n; i++) {
    const combo: ParamSet = {};
    for (const space of spaces) {
      const raw = space.min + Math.random() * (space.max - space.min);
      combo[space.code] = snapToStep(raw, space.min, space.max, space.step);
    }
    results.push(combo);
  }

  return results;
}

// ---------------------------------------------------------------------------
// runParameterSearch
// ---------------------------------------------------------------------------

/**
 * Orchestrates a 2-stage parameter search.
 *
 * Stage 1 — Grid search:
 *   Runs `runBacktest` for every combination in the cartesian product of
 *   `gridSpaces`. Results are collected as ParamResult[].
 *
 * Stage 2 — Random search (optional):
 *   If `randomSpaces` is provided, the top-`topN` grid results (by
 *   expectancy) are used as base ParamSets. For each base, a random sample
 *   of `randomSpaces` is merged in, and `runBacktest` is called again.
 *   This refines the search around the most promising grid region.
 *
 * All results (grid + random) are merged and sorted by expectancy DESC.
 *
 * @param runBacktest   Callback that runs a backtest for a given ParamSet.
 *                      Abstracted so that tests can inject a simple mock.
 * @param gridSpaces    Parameter spaces for Stage 1 grid search.
 * @param randomSpaces  Optional parameter spaces for Stage 2 random search.
 * @param topN          Number of top grid results that seed Stage 2 (default: 5).
 * @param randomSamples Number of random samples per top-N seed (default: 20).
 */
export async function runParameterSearch(
  runBacktest: (params: ParamSet) => Promise<FullMetrics>,
  gridSpaces: ParamSpace[],
  randomSpaces?: ParamSpace[],
  topN = 5,
  randomSamples = 20,
): Promise<ParamResult[]> {
  // Validate all parameter spaces against the tunable whitelist before any
  // backtest runs. Throws immediately if a non-whitelisted space is found.
  assertTunableParams(gridSpaces);
  if (randomSpaces !== undefined) {
    assertTunableParams(randomSpaces);
  }

  const allResults: ParamResult[] = [];

  // ── Stage 1: Grid search ──────────────────────────────────────────────────

  const gridCombinations = generateGridCombinations(gridSpaces);

  for (const params of gridCombinations) {
    const metrics = await runBacktest(params);
    allResults.push({ params, metrics });
  }

  // Sort grid results by expectancy DESC to identify top-N seeds
  allResults.sort((a, b) => b.metrics.expectancy.toNumber() - a.metrics.expectancy.toNumber());

  // ── Stage 2: Random search (optional) ────────────────────────────────────

  if (randomSpaces !== undefined && randomSpaces.length > 0) {
    const seeds = allResults.slice(0, topN);

    for (const seed of seeds) {
      const randomCombos = generateRandomCombinations(randomSpaces, randomSamples);
      for (const randomParams of randomCombos) {
        // Merge: grid base params + random additional params
        const merged: ParamSet = { ...seed.params, ...randomParams };
        const metrics = await runBacktest(merged);
        allResults.push({ params: merged, metrics });
      }
    }
  }

  // ── Final sort by expectancy DESC ────────────────────────────────────────

  allResults.sort((a, b) => b.metrics.expectancy.toNumber() - a.metrics.expectancy.toNumber());

  return allResults;
}

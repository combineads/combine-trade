// ---------------------------------------------------------------------------
// WFO window types and generator
// ---------------------------------------------------------------------------

import { d } from "@/core/decimal";
import { Decimal } from "@/core/decimal";
import type { FullMetrics } from "@/backtest/metrics";
import type { ParamSet, ParamSpace } from "@/backtest/param-search";

/**
 * Configuration for Walk-Forward Optimization window generation.
 * Default values match the strategy spec: IS=6 months, OOS=2 months, roll=1 month.
 */
export type WfoConfig = {
  /** Number of months for the In-Sample (training) period. Default: 6. */
  isMonths: number;
  /** Number of months for the Out-of-Sample (validation) period. Default: 2. */
  oosMonths: number;
  /** Number of months to advance the window start each step. Default: 1. */
  rollMonths: number;
  /** Inclusive start of the overall data range (UTC). */
  totalStartDate: Date;
  /** Exclusive end of the overall data range (UTC). */
  totalEndDate: Date;
};

/**
 * A single IS/OOS window produced by `generateWfoWindows`.
 * All dates are UTC Date objects representing month boundaries.
 * Convention: [isStart, isEnd) and [oosStart, oosEnd) are half-open intervals.
 */
export type WfoWindow = {
  isStart: Date;
  isEnd: Date;
  oosStart: Date;
  oosEnd: Date;
  windowIndex: number;
};

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/** Return a new UTC Date with `months` added to `d`. Uses UTC month arithmetic. */
function addMonths(d: Date, months: number): Date {
  const result = new Date(d);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Generate rolling IS/OOS windows for Walk-Forward Optimization.
 *
 * Algorithm:
 *   - Window 0 starts at totalStartDate.
 *   - IS  = [start, start + isMonths)
 *   - OOS = [start + isMonths, start + isMonths + oosMonths)
 *   - Next window start = previous start + rollMonths
 *   - Windows whose OOS end exceeds totalEndDate are excluded.
 */
export function generateWfoWindows(config: WfoConfig): WfoWindow[] {
  const { isMonths, oosMonths, rollMonths, totalStartDate, totalEndDate } = config;

  const windows: WfoWindow[] = [];
  let windowStart = new Date(totalStartDate);
  let windowIndex = 0;

  while (true) {
    const isStart = new Date(windowStart);
    const isEnd = addMonths(isStart, isMonths);
    const oosStart = new Date(isEnd);
    const oosEnd = addMonths(oosStart, oosMonths);

    // Exclude this window if OOS end would exceed the total date range.
    if (oosEnd.getTime() > totalEndDate.getTime()) {
      break;
    }

    windows.push({ isStart, isEnd, oosStart, oosEnd, windowIndex });

    windowIndex += 1;
    windowStart = addMonths(new Date(totalStartDate), windowIndex * rollMonths);
  }

  return windows;
}

// ---------------------------------------------------------------------------
// WFO result types
// ---------------------------------------------------------------------------

/**
 * Result for a single IS/OOS window in a WFO run.
 * Only produced for windows where IS expectancy > 0.
 */
export type WfoWindowResult = {
  /** The IS/OOS window this result corresponds to. */
  window: WfoWindow;
  /** Full metrics from the IS (training) backtest. */
  isMetrics: FullMetrics;
  /** Full metrics from the OOS (validation) backtest. */
  oosMetrics: FullMetrics;
  /** Best parameter set found during IS parameter search. */
  bestParams: ParamSet;
  /**
   * WFO efficiency = OOS expectancy / IS expectancy.
   * Only computed when IS expectancy > 0.
   */
  efficiency: Decimal;
};

/**
 * Aggregated result from a full WFO run across all windows.
 */
export type WfoResult = {
  /** Results for each valid (IS expectancy > 0) window. */
  windows: WfoWindowResult[];
  /**
   * Average efficiency across all valid windows.
   * 0 when no windows had IS expectancy > 0.
   */
  overallEfficiency: Decimal;
  /**
   * Best params from the window with the highest IS expectancy.
   * null when no valid windows exist.
   */
  bestParams: ParamSet | null;
};

// ---------------------------------------------------------------------------
// Dependency injection interface
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for `runWfo`.
 * Allows full unit testing without DB or real backtest execution.
 */
export type WfoDeps = {
  /** Generates IS/OOS windows from a WfoConfig. Defaults to generateWfoWindows. */
  generateWindows: (config: WfoConfig) => WfoWindow[];
  /**
   * Runs a parameter search over the provided spaces.
   * Returns results sorted by expectancy DESC (best first).
   */
  searchParams: (
    runBacktest: (params: ParamSet) => Promise<FullMetrics>,
    spaces: ParamSpace[],
  ) => Promise<{ params: ParamSet; metrics: FullMetrics }[]>;
  /** Runs a backtest for a given date window and parameter set. */
  runBacktest: (window: { start: Date; end: Date }, params: ParamSet) => Promise<FullMetrics>;
  /**
   * Optional: persists a WFO run or window result row.
   * Returns the assigned row ID (string) so child rows can reference parent.
   */
  saveResult?: (result: {
    runType: string;
    parentId?: string;
    windowIndex?: number;
    config: unknown;
    results: unknown;
  }) => Promise<string>;
};

// ---------------------------------------------------------------------------
// runWfo
// ---------------------------------------------------------------------------

/**
 * Orchestrates a full Walk-Forward Optimization run.
 *
 * For each window:
 *   1. IS phase: searchParams → best params
 *   2. Skip if IS expectancy ≤ 0
 *   3. OOS phase: runBacktest(oosWindow, bestParams) → oosMetrics
 *   4. efficiency = OOS expectancy / IS expectancy
 *
 * Overall efficiency = average of valid window efficiencies.
 * If saveResult is provided, persists a parent WFO row then one child per valid window.
 *
 * @param wfoConfig   Date range and IS/OOS/roll configuration.
 * @param paramSpaces Parameter spaces passed to searchParams.
 * @param deps        Injectable dependencies for testing.
 */
export async function runWfo(
  wfoConfig: WfoConfig,
  paramSpaces: ParamSpace[],
  deps: WfoDeps,
): Promise<WfoResult> {
  const ZERO = d("0");

  const allWindows = deps.generateWindows(wfoConfig);
  const windowResults: WfoWindowResult[] = [];

  // ── Optional: save parent WFO row ─────────────────────────────────────────
  let parentId: string | undefined;
  if (deps.saveResult !== undefined) {
    parentId = await deps.saveResult({
      runType: "WFO",
      config: {
        isMonths: wfoConfig.isMonths,
        oosMonths: wfoConfig.oosMonths,
        rollMonths: wfoConfig.rollMonths,
        totalStartDate: wfoConfig.totalStartDate.toISOString(),
        totalEndDate: wfoConfig.totalEndDate.toISOString(),
      },
      results: {},
    });
  }

  // ── Process each window ────────────────────────────────────────────────────
  for (const win of allWindows) {
    // IS phase: bind runBacktest to IS window dates
    const isRunBacktest = (params: ParamSet): Promise<FullMetrics> =>
      deps.runBacktest({ start: win.isStart, end: win.isEnd }, params);

    const searchResults = await deps.searchParams(isRunBacktest, paramSpaces);

    // Pick the best result (highest expectancy — searchParams returns DESC sorted)
    const bestResult = searchResults[0];
    if (bestResult === undefined) continue;

    const isMetrics = bestResult.metrics;
    const bestParams = bestResult.params;

    // Skip window if IS expectancy ≤ 0
    if (isMetrics.expectancy.lessThanOrEqualTo(ZERO)) {
      continue;
    }

    // OOS phase: run with best IS params
    const oosMetrics = await deps.runBacktest(
      { start: win.oosStart, end: win.oosEnd },
      bestParams,
    );

    // efficiency = OOS expectancy / IS expectancy
    const efficiency = oosMetrics.expectancy.dividedBy(isMetrics.expectancy);

    const windowResult: WfoWindowResult = {
      window: win,
      isMetrics,
      oosMetrics,
      bestParams,
      efficiency,
    };
    windowResults.push(windowResult);

    // Optional: save child window row
    if (deps.saveResult !== undefined && parentId !== undefined) {
      await deps.saveResult({
        runType: "WFO_WINDOW",
        parentId,
        windowIndex: win.windowIndex,
        config: {
          isStart: win.isStart.toISOString(),
          isEnd: win.isEnd.toISOString(),
          oosStart: win.oosStart.toISOString(),
          oosEnd: win.oosEnd.toISOString(),
          bestParams,
        },
        results: {
          isExpectancy: isMetrics.expectancy.toNumber(),
          oosExpectancy: oosMetrics.expectancy.toNumber(),
          efficiency: efficiency.toNumber(),
        },
      });
    }
  }

  // ── Overall efficiency = average of valid window efficiencies ──────────────
  let overallEfficiency: Decimal;
  let bestParams: ParamSet | null = null;

  if (windowResults.length === 0) {
    overallEfficiency = ZERO;
  } else {
    let sum = ZERO;
    for (const wr of windowResults) {
      sum = sum.plus(wr.efficiency);
    }
    overallEfficiency = sum.dividedBy(d(String(windowResults.length)));

    // Best params: from window with highest IS expectancy
    let bestIsExpectancy = ZERO.minus(d("1")); // start below 0 so any valid window wins
    for (const wr of windowResults) {
      if (wr.isMetrics.expectancy.greaterThan(bestIsExpectancy)) {
        bestIsExpectancy = wr.isMetrics.expectancy;
        bestParams = wr.bestParams;
      }
    }
  }

  return { windows: windowResults, overallEfficiency, bestParams };
}

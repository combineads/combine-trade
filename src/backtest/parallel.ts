import type { FullMetrics } from "@/backtest/metrics";
import type { ParamSet, ParamResult } from "@/backtest/param-search";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ParallelSearchConfig = {
  /**
   * Number of concurrent promise slots (batches).
   * threads=1 means sequential execution (batch size of 1).
   * threads > combinations means all run in one batch.
   */
  threads: number;
  /**
   * Callback that runs a single backtest for the given parameter set.
   * Must be safe to call concurrently up to `threads` times.
   */
  runBacktest: (params: ParamSet) => Promise<FullMetrics>;
};

// ---------------------------------------------------------------------------
// ParallelSearchManager
// ---------------------------------------------------------------------------

/**
 * Distributes a list of parameter combinations across concurrent Promise
 * batches and collects results.
 *
 * Design notes:
 * - Uses Promise.allSettled so a single failure does not abort the batch.
 * - Failed combinations are retried exactly once before being skipped.
 * - threads=1 produces sequential execution (batch size = 1).
 * - No real Bun Worker threads are used — concurrency is Promise-based,
 *   which is fully testable without multi-threading infrastructure.
 */
export class ParallelSearchManager {
  private readonly threads: number;
  private readonly runBacktest: (params: ParamSet) => Promise<FullMetrics>;

  constructor(config: ParallelSearchConfig) {
    if (config.threads < 1) {
      throw new Error(`threads must be >= 1, got ${config.threads}`);
    }
    this.threads = config.threads;
    this.runBacktest = config.runBacktest;
  }

  /**
   * Runs all combinations and returns collected results.
   *
   * - Combinations are processed in batches of `threads`.
   * - Any combination that throws is retried once; if it fails again it is
   *   logged and skipped (not included in the returned array).
   * - The returned array preserves batch order but skips failed items.
   */
  async run(combinations: ParamSet[]): Promise<ParamResult[]> {
    if (combinations.length === 0) {
      return [];
    }

    const results: ParamResult[] = [];
    const batchSize = Math.max(1, this.threads);

    for (let i = 0; i < combinations.length; i += batchSize) {
      const batch = combinations.slice(i, i + batchSize);

      // Run the batch concurrently
      const settled = await Promise.allSettled(
        batch.map((params) => this.runWithRetry(params)),
      );

      for (const outcome of settled) {
        if (outcome.status === "fulfilled") {
          results.push(outcome.value);
        }
        // Rejected outcomes were already logged inside runWithRetry
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Attempts to run a single backtest.  On failure retries exactly once.
   * If the retry also fails the error is logged and the promise rejects so
   * the caller (Promise.allSettled) treats it as a skipped combination.
   */
  private async runWithRetry(params: ParamSet): Promise<ParamResult> {
    try {
      const metrics = await this.runBacktest(params);
      return { params, metrics };
    } catch (firstError) {
      // Retry once
      try {
        const metrics = await this.runBacktest(params);
        return { params, metrics };
      } catch (retryError) {
        const paramStr = JSON.stringify(params);
        console.error(
          `[ParallelSearchManager] Combination skipped after retry — params: ${paramStr}`,
          retryError,
        );
        throw retryError;
      }
    }
  }
}

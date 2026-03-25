/**
 * Warm-up period detection and tracking for strategy evaluation.
 *
 * Warm-up period = max indicator lookback period used in strategy code.
 * Events are suppressed until enough candles have been seen to make
 * all indicators meaningful (no NaN padding at the current bar).
 */

// Default periods for indicators that have fixed periods or complex defaults
const MACD_DEFAULT_SLOW_PERIOD = 26; // MACD: max(fast=12, slow=26)

/**
 * Indicator call patterns to extract period arguments from strategy code.
 * Each entry: { regex to find calls, which capture group is the period arg }
 */
const INDICATOR_PERIOD_PATTERNS: Array<{ pattern: RegExp; groupIndex: number }> = [
	// indicator.ema(source, period)
	{ pattern: /indicator\.ema\s*\([^,)]+,\s*(\d+)/g, groupIndex: 1 },
	// indicator.sma(source, period)
	{ pattern: /indicator\.sma\s*\([^,)]+,\s*(\d+)/g, groupIndex: 1 },
	// indicator.bb(source, period, ...)
	{ pattern: /indicator\.bb\s*\([^,)]+,\s*(\d+)/g, groupIndex: 1 },
	// indicator.rsi(source, period)
	{ pattern: /indicator\.rsi\s*\([^,)]+,\s*(\d+)/g, groupIndex: 1 },
	// indicator.atr(period) — no source argument
	{ pattern: /indicator\.atr\s*\(\s*(\d+)/g, groupIndex: 1 },
	// indicator.cci(period) — no source argument
	{ pattern: /indicator\.cci\s*\(\s*(\d+)/g, groupIndex: 1 },
	// indicator.stochastic(kPeriod, ...)
	{ pattern: /indicator\.stochastic\s*\(\s*(\d+)/g, groupIndex: 1 },
	// indicator.wma(source, period)
	{ pattern: /indicator\.wma\s*\([^,)]+,\s*(\d+)/g, groupIndex: 1 },
	// indicator.adx(period) — no source argument
	{ pattern: /indicator\.adx\s*\(\s*(\d+)/g, groupIndex: 1 },
];

/**
 * Detect the warm-up period required for a strategy by scanning its code
 * for indicator calls and extracting the maximum period argument.
 *
 * Returns 0 if no indicator calls with numeric period arguments are found.
 */
export function calculateWarmupPeriod(code: string): number {
	let maxPeriod = 0;

	// Check for MACD calls (fixed default slow period = 26)
	const macdPattern = /indicator\.macd\s*\(/g;
	if (macdPattern.test(code)) {
		maxPeriod = Math.max(maxPeriod, MACD_DEFAULT_SLOW_PERIOD);
	}

	for (const { pattern, groupIndex } of INDICATOR_PERIOD_PATTERNS) {
		// Reset lastIndex for global regex
		pattern.lastIndex = 0;
		let match = pattern.exec(code);
		while (match !== null) {
			const periodStr = match[groupIndex];
			if (periodStr !== undefined) {
				const period = Number.parseInt(periodStr, 10);
				if (!Number.isNaN(period) && period > maxPeriod) {
					maxPeriod = period;
				}
			}
			match = pattern.exec(code);
		}
	}

	return maxPeriod;
}

/**
 * Tracks candle counts per strategy evaluation key.
 *
 * Key format: `{strategyId}:{strategyVersion}:{symbol}:{timeframe}`
 * This ensures warm-up is tracked independently per strategy+version+symbol+timeframe scope.
 */
export class WarmupTracker {
	private readonly counts = new Map<string, number>();

	/**
	 * Increment candle count for a key and return the new count.
	 */
	increment(key: string): number {
		const current = this.counts.get(key) ?? 0;
		const next = current + 1;
		this.counts.set(key, next);
		return next;
	}

	/**
	 * Returns true if enough candles have been seen to exit warm-up.
	 * If warmupPeriod is 0, always returns true (no warm-up needed).
	 *
	 * Warm-up completes after `warmupPeriod` candles have been suppressed,
	 * so the (warmupPeriod + 1)th candle is the first to emit events.
	 * i.e., count > warmupPeriod.
	 */
	isComplete(key: string, warmupPeriod: number): boolean {
		if (warmupPeriod === 0) return true;
		const count = this.counts.get(key) ?? 0;
		return count > warmupPeriod;
	}

	/**
	 * Returns the current candle count for a key (0 if not seen yet).
	 */
	getCandleCount(key: string): number {
		return this.counts.get(key) ?? 0;
	}

	/**
	 * Reset the warm-up counter for a key (e.g. on strategy version change).
	 */
	reset(key: string): void {
		this.counts.delete(key);
	}
}

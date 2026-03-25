/**
 * Eligible timeframes for LLM filter routing.
 *
 * Only timeframes >= 15m qualify for LLM evaluation.
 * Short timeframes (1m, 3m, 5m) are excluded to respect the < 1s latency budget.
 * This list is exhaustive — any unlisted timeframe defaults to not eligible.
 */
const LLM_ELIGIBLE_TIMEFRAMES = new Set([
	"15m",
	"30m",
	"1h",
	"2h",
	"4h",
	"6h",
	"8h",
	"12h",
	"1d",
	"3d",
	"1w",
	"1M",
]);

/**
 * Pure function: returns true when `timeframe` meets the >= 15m threshold
 * required for LLM filter routing.
 *
 * This check is always AND-ed with `strategy.useLlmFilter`; timeframe alone
 * is not sufficient to route to the LLM path.
 */
export function isLlmEligibleTimeframe(timeframe: string): boolean {
	return LLM_ELIGIBLE_TIMEFRAMES.has(timeframe);
}

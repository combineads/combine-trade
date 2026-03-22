export { simulateMarketFill, scanForExit } from "./matcher.js";
export {
	applyEntry,
	applyExit,
	calculateMargin,
	calculateUnrealizedPnl,
	computePeriodSummary,
	createBalance,
	resetBalance,
} from "./balance.js";
export { expectancyDelta, maxDrawdown, sharpeRatio, zTestWinRate } from "./comparator.js";
export { calculateReadinessScore, type ReadinessInput, type ReadinessScore } from "./readiness.js";
export type {
	PaperBalance,
	PaperCandle,
	PaperDirection,
	PaperExitReason,
	PaperExitResult,
	PaperFill,
	PaperOrderConfig,
	PaperPosition,
	PeriodSummary,
} from "./types.js";

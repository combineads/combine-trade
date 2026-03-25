// Backtesting engine — historical data replay through strategy pipeline.
export {
	parseBinanceVisionCsv,
	parseBinanceVisionCsvRows,
	type CandleContext,
	type RawKlineRow,
} from "./csv-parser.js";

export { resumeFromCheckpoint, runBacktest } from "./engine.js";

export { labelBacktestEvent, toForwardCandles, type ResultConfig } from "./labeler.js";

export {
	computeMaxConsecutiveLoss,
	computeMaxDrawdown,
	computeMonthlyBreakdown,
	computeReport,
	type BacktestReport,
	type LabeledEvent,
	type MonthlyBreakdown,
	type SlippageStats,
} from "./report.js";

export type {
	BacktestCheckpoint,
	BacktestConfig,
	BacktestEngineDeps,
	BacktestEvent,
	BacktestResult,
	StrategyOutput,
} from "./types.js";

export {
	buildTableName,
	runReVectorize,
	type FeatureVector,
	type MigrateTableFn,
	type ReVectorizeConfig,
	type ReVectorizeDeps,
	type ReVectorizeResult,
	type StoredEvent,
} from "./re-vectorize.js";

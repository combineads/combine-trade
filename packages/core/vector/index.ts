export type {
	NormalizationMethod,
	NormalizationConfig,
	FeatureInput,
	SearchResult,
	SearchStatus,
	SearchResponse,
	PatternStatistics,
} from "./types.js";

export {
	normalize,
	normalizePercent,
	normalizeSigmoid,
	normalizeBoolean,
	normalizeMinmax,
	normalizePercentile,
	normalizeNone,
} from "./normalize.js";

export { normalizeFeatures } from "./orchestrator.js";

export { computeStatistics, type EventLabel } from "./statistics.js";

export { VectorTableManager } from "./table-manager.js";
export { VectorRepository } from "./repository.js";
export type { SqlExecutor } from "./sql-types.js";

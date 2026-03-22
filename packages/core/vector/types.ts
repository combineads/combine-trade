/** Supported normalization methods for feature values */
export type NormalizationMethod =
	| "percent"
	| "sigmoid"
	| "boolean"
	| "minmax"
	| "percentile"
	| "none";

/** Configuration for normalization, per feature */
export interface NormalizationConfig {
	method: NormalizationMethod;
	/** For minmax: domain-fixed min value */
	min?: number;
	/** For minmax: domain-fixed max value */
	max?: number;
	/** For percentile: window size (number of historical values) */
	lookback?: number;
}

/** A feature value ready for normalization */
export interface FeatureInput {
	name: string;
	value: number;
	normalization: NormalizationConfig;
}

/** Result of vector search */
export interface SearchResult {
	eventId: string;
	distance: number;
}

export type SearchStatus = "SUFFICIENT" | "INSUFFICIENT";

export interface SearchResponse {
	status: SearchStatus;
	results: SearchResult[];
	threshold: number;
	totalCandidates: number;
	validCount: number;
}

/** Pattern statistics from labeled events */
export interface PatternStatistics {
	winrate: number;
	avgWin: number;
	avgLoss: number;
	expectancy: number;
	sampleCount: number;
	status: "SUFFICIENT" | "INSUFFICIENT";
}

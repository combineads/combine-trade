import type { NormalizationConfig } from "./types.js";

function sanitize(value: number): number | null {
	if (Number.isNaN(value)) return null;
	return value;
}

function clamp01(value: number): number {
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

/** percent: value / 100, clamped to [0,1] */
export function normalizePercent(value: number): number {
	const v = sanitize(value);
	if (v === null) return 0;
	if (v === Number.POSITIVE_INFINITY) return 1;
	if (v === Number.NEGATIVE_INFINITY) return 0;
	return clamp01(v / 100);
}

/** sigmoid: 1 / (1 + exp(-value)) */
export function normalizeSigmoid(value: number): number {
	const v = sanitize(value);
	if (v === null) return 0;
	if (v === Number.POSITIVE_INFINITY) return 1;
	if (v === Number.NEGATIVE_INFINITY) return 0;
	return 1 / (1 + Math.exp(-v));
}

/** boolean: value > 0 → 1, else 0 */
export function normalizeBoolean(value: number): number {
	const v = sanitize(value);
	if (v === null) return 0;
	return v > 0 ? 1 : 0;
}

/** minmax: (value - min) / (max - min), clamped to [0,1] */
export function normalizeMinmax(value: number, min: number, max: number): number {
	const v = sanitize(value);
	if (v === null) return 0;
	if (v === Number.POSITIVE_INFINITY) return 1;
	if (v === Number.NEGATIVE_INFINITY) return 0;
	const range = max - min;
	if (range === 0) return 0;
	return clamp01((v - min) / range);
}

/** percentile: rank of value within history array, normalized to [0,1] */
export function normalizePercentile(value: number, history: number[]): number {
	const v = sanitize(value);
	if (v === null) return 0;
	if (history.length === 0) return 0.5;
	let below = 0;
	let equal = 0;
	for (const h of history) {
		if (h < v) below++;
		else if (h === v) equal++;
	}
	// Percentile rank using midpoint method
	return clamp01((below + equal * 0.5) / history.length);
}

/** none: passthrough, value must already be in [0,1] */
export function normalizeNone(value: number): number {
	const v = sanitize(value);
	if (v === null) return 0;
	if (v < 0 || v > 1) {
		throw new Error(`normalizeNone: value ${v} is outside [0,1] range`);
	}
	return v;
}

/** Dispatch normalization by method */
export function normalize(value: number, config: NormalizationConfig, history?: number[]): number {
	switch (config.method) {
		case "percent":
			return normalizePercent(value);
		case "sigmoid":
			return normalizeSigmoid(value);
		case "boolean":
			return normalizeBoolean(value);
		case "minmax":
			if (config.min === undefined || config.max === undefined) {
				throw new Error("minmax normalization requires min and max in config");
			}
			return normalizeMinmax(value, config.min, config.max);
		case "percentile":
			return normalizePercentile(value, history ?? []);
		case "none":
			return normalizeNone(value);
		default:
			throw new Error(`Unknown normalization method: ${config.method as string}`);
	}
}

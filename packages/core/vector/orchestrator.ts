import { normalize } from "./normalize.js";
import type { FeatureInput } from "./types.js";

/**
 * Normalizes an array of features into a [0,1] vector.
 * Feature order is preserved: features[0] → vector[0].
 */
export function normalizeFeatures(
	features: FeatureInput[],
	history?: Map<string, number[]>,
): number[] {
	const vector: number[] = [];

	for (const feature of features) {
		try {
			const featureHistory = history?.get(feature.name);
			const normalized = normalize(feature.value, feature.normalization, featureHistory);
			vector.push(normalized);
		} catch (err) {
			throw new Error(
				`Normalization failed for feature "${feature.name}": ${(err as Error).message}`,
			);
		}
	}

	return vector;
}

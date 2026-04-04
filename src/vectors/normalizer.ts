/**
 * Median/IQR normalizer for 202-dimensional feature vectors.
 *
 * Normalization formula: normalized[i] = (raw[i] - median[i]) / iqr[i]
 * IQR = Q3 - Q1 (75th percentile - 25th percentile)
 * IQR = 0 → output 0.0 (constant feature, cannot normalize)
 *
 * NormParams are computed from a training corpus of vectors and then
 * applied to new vectors before KNN distance computation.
 */

import { VECTOR_DIM } from "@/vectors/features";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-feature normalization parameters.
 * Array of exactly VECTOR_DIM (202) elements — one per feature dimension.
 */
export type NormParams = { median: number; iqr: number }[];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Computes the value at a given percentile (0–100) using linear interpolation.
 * Input array is expected to be sorted ascending.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;

  // Convert percentile [0, 100] to index in [0, n-1]
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);

  if (lo === hi) {
    return sorted[lo] ?? 0;
  }

  const frac = idx - lo;
  return (sorted[lo] ?? 0) * (1 - frac) + (sorted[hi] ?? 0) * frac;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Applies Median/IQR normalization to a raw 202-dimensional vector.
 *
 * @param raw - Input Float32Array of length VECTOR_DIM (202).
 * @param params - NormParams with VECTOR_DIM elements.
 * @returns New Float32Array of length VECTOR_DIM with normalized values.
 *          Features with IQR=0 are mapped to 0.0.
 */
export function normalize(raw: Float32Array, params: NormParams): Float32Array {
  const out = new Float32Array(VECTOR_DIM);
  for (let i = 0; i < VECTOR_DIM; i++) {
    const p = params[i];
    if (!p || p.iqr === 0) {
      out[i] = 0.0;
    } else {
      const v = ((raw[i] ?? 0) - p.median) / p.iqr;
      out[i] = Number.isFinite(v) ? v : 0.0;
    }
  }
  return out;
}

/**
 * Computes per-feature Median/IQR normalization parameters from a corpus of vectors.
 *
 * For each dimension i, collects values[i] across all vectors, sorts them,
 * then computes:
 *   median = 50th percentile
 *   q1     = 25th percentile
 *   q3     = 75th percentile
 *   iqr    = q3 - q1
 *
 * @param vectors - Non-empty array of Float32Array(202) training vectors.
 * @returns NormParams array of 202 {median, iqr} objects.
 * @throws If vectors is empty.
 */
export function computeNormParams(vectors: Float32Array[]): NormParams {
  if (vectors.length === 0) {
    throw new Error("computeNormParams: vectors array must not be empty");
  }

  const params: NormParams = [];

  for (let dim = 0; dim < VECTOR_DIM; dim++) {
    // Collect all values for this dimension across all vectors
    const values: number[] = new Array(vectors.length);
    for (let j = 0; j < vectors.length; j++) {
      values[j] = vectors[j]?.[dim] ?? 0;
    }

    // Sort ascending for percentile computation
    values.sort((a, b) => a - b);

    const median = percentile(values, 50);
    const q1 = percentile(values, 25);
    const q3 = percentile(values, 75);
    const iqr = q3 - q1;

    params.push({ median, iqr });
  }

  return params;
}

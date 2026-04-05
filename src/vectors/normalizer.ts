/**
 * Median/IQR normalizer for 202-dimensional feature vectors.
 *
 * Normalization pipeline (per feature):
 *   1. z = (raw[i] - median[i]) / iqr[i]   (Median/IQR)
 *   2. z_clamped = clamp(z, -3, 3)          (outlier clamp)
 *   3. out = (z_clamped + 3) / 6            ([0,1] scaling)
 *
 * Special cases:
 *   IQR = 0         → 0.5 (center of [0,1]; constant feature)
 *   NaN or ±Infinity → 0.5 (center of [0,1])
 *
 * NormParams are computed from a training corpus of vectors (last `lookback`
 * vectors, default 60) and then applied to new vectors before KNN distance
 * computation.
 */

import { VECTOR_DIM } from "@/vectors/feature-spec";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-feature normalization parameters.
 * Array of exactly VECTOR_DIM (202) elements — one per feature dimension.
 */
export type NormParams = { median: number; iqr: number }[];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default lookback window for computeNormParams. */
const DEFAULT_LOOKBACK = 60;

/** Clamp bounds for z-score before [0,1] scaling. */
const CLAMP_MIN = -3;
const CLAMP_MAX = 3;

/** Output value for degenerate cases (IQR=0, NaN, ±Infinity). */
const CENTER = 0.5;

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
 * Pipeline per feature i:
 *   1. z = (raw[i] - median[i]) / iqr[i]
 *   2. z_clamped = clamp(z, -3, 3)
 *   3. out[i] = (z_clamped + 3) / 6   → result in [0, 1]
 *
 * Degenerate cases map to 0.5 (center of [0,1]):
 *   - IQR = 0 (constant feature)
 *   - NaN or ±Infinity in raw input or as result of division
 *
 * @param raw - Input Float32Array of length VECTOR_DIM (202).
 * @param params - NormParams with VECTOR_DIM elements.
 * @returns New Float32Array of length VECTOR_DIM with values in [0, 1].
 */
export function normalize(raw: Float32Array, params: NormParams): Float32Array {
  const out = new Float32Array(VECTOR_DIM);
  for (let i = 0; i < VECTOR_DIM; i++) {
    const p = params[i];
    if (!p || p.iqr === 0) {
      out[i] = CENTER;
      continue;
    }

    const rawVal = raw[i] ?? 0;
    if (!Number.isFinite(rawVal)) {
      out[i] = CENTER;
      continue;
    }

    const z = (rawVal - p.median) / p.iqr;

    if (!Number.isFinite(z)) {
      out[i] = CENTER;
      continue;
    }

    // Clamp to [-3, 3]
    const zClamped = Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, z));

    // Scale to [0, 1]
    out[i] = (zClamped - CLAMP_MIN) / (CLAMP_MAX - CLAMP_MIN);
  }
  return out;
}

/**
 * Computes per-feature Median/IQR normalization parameters from a corpus of vectors.
 *
 * Only the last `lookback` vectors are used (default: 60). If the corpus has
 * fewer vectors than `lookback`, all vectors are used.
 *
 * For each dimension i, collects values[i] across the selected vectors, sorts
 * them, then computes:
 *   median = 50th percentile
 *   q1     = 25th percentile
 *   q3     = 75th percentile
 *   iqr    = q3 - q1
 *
 * @param vectors - Non-empty array of Float32Array(202) training vectors.
 * @param lookback - Number of most-recent vectors to use (default: 60).
 *                   Pass `undefined` to use the default.
 * @returns NormParams array of 202 {median, iqr} objects.
 * @throws If vectors is empty.
 */
export function computeNormParams(
  vectors: Float32Array[],
  lookback: number | undefined = DEFAULT_LOOKBACK,
): NormParams {
  if (vectors.length === 0) {
    throw new Error("computeNormParams: vectors array must not be empty");
  }

  // Apply lookback window: use only the last `lookback` vectors
  const window =
    lookback !== undefined && vectors.length > lookback
      ? vectors.slice(vectors.length - lookback)
      : vectors;

  const params: NormParams = [];

  for (let dim = 0; dim < VECTOR_DIM; dim++) {
    // Collect all values for this dimension across windowed vectors
    const values: number[] = new Array(window.length);
    for (let j = 0; j < window.length; j++) {
      values[j] = window[j]?.[dim] ?? 0;
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

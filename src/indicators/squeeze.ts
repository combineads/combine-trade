import type { Decimal } from "@/core/decimal";
import { add, d, div, gt, isZero, lt } from "@/core/decimal";
import type { SqueezeState } from "./types";

/**
 * Detect squeeze state from a series of BB20 bandwidth values.
 *
 * - "squeeze":   current bandwidth < 50% of lookback average
 * - "expansion": current bandwidth > 150% of lookback average
 * - "normal":    otherwise
 *
 * The lookback window excludes the current value so the average is
 * computed from the preceding `lookback` (or fewer) values.
 */
export function detectSqueeze(bandwidths: Decimal[], lookback: number = 20): SqueezeState {
  if (bandwidths.length <= 1) return "normal";

  // biome-ignore lint/style/noNonNullAssertion: length > 1 guaranteed above
  const current = bandwidths[bandwidths.length - 1]!;

  // Window = up to `lookback` values immediately before the current one.
  const windowSize = Math.min(lookback, bandwidths.length - 1);
  const window = bandwidths.slice(bandwidths.length - 1 - windowSize, bandwidths.length - 1);

  let sum = d("0");
  for (const bw of window) {
    sum = add(sum, bw);
  }

  if (isZero(sum)) return "normal";

  const avg = div(sum, d(windowSize.toString()));

  // squeeze threshold: current < avg * 0.5
  const squeezeThreshold = div(avg, d("2"));
  if (lt(current, squeezeThreshold)) return "squeeze";

  // expansion threshold: current > avg * 1.5
  const expansionThreshold = add(avg, div(avg, d("2")));
  if (gt(current, expansionThreshold)) return "expansion";

  return "normal";
}

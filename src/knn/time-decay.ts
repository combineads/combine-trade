// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for time-decay weighting.
 *
 * The decay steps are structural anchors (constants), not tunable parameters.
 * This type is intentionally empty and kept for API compatibility with callers
 * that pass a config object (e.g. pipeline.ts).
 */
export type TimeDecayConfig = Record<string, never>;

/**
 * Structural anchor constants for the 3-step discrete time-decay function.
 *
 * These values are code-fixed (like BB20/BB4) and must NOT be made tunable.
 *  - ≤ recentDays  → recentWeight  (1.0)
 *  - ≤ mediumDays  → mediumWeight  (0.7)
 *  - > mediumDays  → oldWeight     (0.2)
 */
export const TIME_DECAY_STEPS = {
  /** Upper boundary (inclusive) for the recent tier, in days. */
  recentDays: 30,
  /** Upper boundary (inclusive) for the medium tier, in days. */
  mediumDays: 90,
  /** Weight assigned to vectors created within recentDays. */
  recentWeight: 1.0,
  /** Weight assigned to vectors created between recentDays+1 and mediumDays. */
  mediumWeight: 0.7,
  /** Weight assigned to vectors created more than mediumDays ago. */
  oldWeight: 0.2,
} as const;

/**
 * A KNN neighbour retrieved from pgvector search.
 * Fields mirror the vector table columns used by the KNN subsystem.
 */
export type KnnNeighbor = {
  vectorId: string;
  distance: number;
  label: string | null;
  grade: string | null;
  createdAt: Date;
};

/** KnnNeighbor enriched with a time-decay weight in the range (0, 1]. */
export type WeightedNeighbor = KnnNeighbor & {
  weight: number;
};

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Calculates the discrete 3-step time-decay weight for a single neighbour.
 *
 * Steps (structural anchors — not configurable):
 *  - ≤ 30 days  → 1.0
 *  - 31–90 days → 0.7
 *  - > 90 days  → 0.2
 *
 * Guarantees:
 *  - Same calendar day  → 1.0
 *  - Future date (now < createdAt) → 1.0 (safe clamp)
 *  - Weight is always in {0.2, 0.7, 1.0} ⊆ (0, 1]
 *
 * @param neighborCreatedAt - When the neighbour vector was created.
 * @param now - Reference point for "current time".
 * @param _config - Unused; kept for API compatibility. Steps are structural constants.
 * @returns A weight in {0.2, 0.7, 1.0}.
 */
export function calcTimeDecay(
  neighborCreatedAt: Date,
  now: Date,
  _config: TimeDecayConfig,
): number {
  const MS_PER_DAY = 86_400_000;

  // Convert both dates to whole UTC days to satisfy the "same day → 1.0"
  // requirement and avoid sub-day noise.
  const nowDay = Math.floor(now.getTime() / MS_PER_DAY);
  const createdDay = Math.floor(neighborCreatedAt.getTime() / MS_PER_DAY);

  const daysSince = nowDay - createdDay;

  // Future dates and same-day vectors both receive full weight.
  if (daysSince <= 0) {
    return TIME_DECAY_STEPS.recentWeight;
  }

  if (daysSince <= TIME_DECAY_STEPS.recentDays) {
    return TIME_DECAY_STEPS.recentWeight;
  }

  if (daysSince <= TIME_DECAY_STEPS.mediumDays) {
    return TIME_DECAY_STEPS.mediumWeight;
  }

  return TIME_DECAY_STEPS.oldWeight;
}

/**
 * Applies time-decay weights to every element in a neighbour array.
 *
 * @param neighbors - KNN neighbours to weight.
 * @param now - Reference point for "current time".
 * @param config - Decay configuration (structural; steps are constants).
 * @returns A new array of WeightedNeighbor with the `weight` field added.
 */
export function applyTimeDecay(
  neighbors: KnnNeighbor[],
  now: Date,
  config: TimeDecayConfig,
): WeightedNeighbor[] {
  return neighbors.map((neighbor) => ({
    ...neighbor,
    weight: calcTimeDecay(neighbor.createdAt, now, config),
  }));
}

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

/**
 * Returns the (empty) time-decay configuration.
 *
 * The discrete decay steps are structural anchors defined in TIME_DECAY_STEPS
 * and are not loaded from the database.  This function is kept for API
 * compatibility with pipeline.ts which expects a loadTimeDecayConfig call.
 *
 * @returns Resolved TimeDecayConfig (always the default empty object).
 */
export async function loadTimeDecayConfig(): Promise<TimeDecayConfig> {
  return {};
}

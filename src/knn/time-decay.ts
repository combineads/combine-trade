import { and, eq } from "drizzle-orm";

import type { DbInstance } from "@/db/pool";
import { commonCodeTable } from "@/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the exponential time-decay weighting function. */
export type TimeDecayConfig = {
  /** Half-life in days: the elapsed time after which weight drops to 0.5. */
  halfLifeDays: number;
};

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
 * Calculates the exponential time-decay weight for a single neighbour.
 *
 * Formula: weight = exp(-λ × daysSince)
 *   where λ = ln(2) / halfLifeDays
 *
 * Guarantees:
 *  - Same calendar day  → 1.0
 *  - Future date (now < createdAt) → 1.0 (safe clamp)
 *  - Exactly halfLifeDays elapsed → ≈ 0.5
 *  - Weight is always in (0, 1]
 *
 * @param neighborCreatedAt - When the neighbour vector was created.
 * @param now - Reference point for "current time".
 * @param config - Decay configuration.
 * @returns A weight in the range (0, 1].
 */
export function calcTimeDecay(neighborCreatedAt: Date, now: Date, config: TimeDecayConfig): number {
  const MS_PER_DAY = 86_400_000;

  // Convert both dates to whole UTC days to satisfy the "same day → 1.0"
  // requirement and avoid sub-day noise.
  const nowDay = Math.floor(now.getTime() / MS_PER_DAY);
  const createdDay = Math.floor(neighborCreatedAt.getTime() / MS_PER_DAY);

  const daysSince = nowDay - createdDay;

  // Future dates and same-day vectors both receive full weight.
  if (daysSince <= 0) {
    return 1.0;
  }

  const lambda = Math.LN2 / config.halfLifeDays;
  return Math.exp(-lambda * daysSince);
}

/**
 * Applies time-decay weights to every element in a neighbour array.
 *
 * @param neighbors - KNN neighbours to weight.
 * @param now - Reference point for "current time".
 * @param config - Decay configuration.
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
// DB-backed config loader
// ---------------------------------------------------------------------------

const DEFAULT_HALF_LIFE_DAYS = 90;

/**
 * Loads the time-decay configuration from CommonCode.
 *
 * Reads the `TIME_DECAY.half_life_days` row (must be active).
 * Falls back to `{ halfLifeDays: 90 }` when:
 *  - The row does not exist
 *  - `is_active` is false
 *  - The stored value is not a positive finite number
 *
 * @param db - Drizzle ORM instance (from getDb()).
 * @returns Resolved TimeDecayConfig.
 */
export async function loadTimeDecayConfig(db: DbInstance): Promise<TimeDecayConfig> {
  const rows = await db
    .select({ value: commonCodeTable.value })
    .from(commonCodeTable)
    .where(
      and(
        eq(commonCodeTable.group_code, "TIME_DECAY"),
        eq(commonCodeTable.code, "half_life_days"),
        eq(commonCodeTable.is_active, true),
      ),
    )
    .limit(1);

  const firstRow = rows[0];

  if (firstRow === undefined) {
    return { halfLifeDays: DEFAULT_HALF_LIFE_DAYS };
  }

  const raw = firstRow.value;

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return { halfLifeDays: raw };
  }

  // Stored value is invalid — return safe default.
  return { halfLifeDays: DEFAULT_HALF_LIFE_DAYS };
}

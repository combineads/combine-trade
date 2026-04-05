/**
 * KNN search engine backed by pgvector HNSW index.
 *
 * Uses raw SQL via getPool() because pgvector distance operators
 * (<=> cosine, <-> L2) are not supported by the Drizzle query builder.
 *
 * All public functions accept the Drizzle db instance for Drizzle-based
 * queries (CommonCode lookup) and call getPool() internally when raw SQL
 * is required.
 *
 * ## 가중 거리 전략 (D-005: pre-multiply)
 *
 * PRD §7.8은 피처별 가중치를 요구한다 (upperWick×1.5, lowerWick×1.5,
 * bb4_position×2.0, pivot_distance×1.5 등).
 *
 * T-15-001 D-005 결정: pre-multiply 전략을 채택한다.
 *
 * 가중치는 벡터를 저장하기 전에 피처값에 직접 곱해진다:
 *   - candle-features.ts: upperWick × 1.5, lowerWick × 1.5 (extractBarFeatures 내부)
 *   - strategy-features.ts: bb4_pos × 2.0, pivot_distance × 1.5,
 *                           daily_open_distance × 1.5, session_box_position × 1.5
 *
 * 결과적으로 pgvector의 네이티브 L2/cosine 연산자가 pre-multiply된 벡터에
 * 적용되면, 고가중치 피처가 거리에 더 많이 기여한다:
 *   - weight=2.0 피처는 squared distance에 4× 기여
 *   - weight=1.5 피처는 squared distance에 2.25× 기여
 *
 * 따라서 이 engine.ts는 추가적인 post-rerank 없이 searchKnn()의
 * 결과가 이미 가중 거리 기준으로 정렬된다.
 *
 * buildWeightIndexMap()은 FEATURE_NAMES 인덱스 → 가중치 매핑 유틸로,
 * 디버깅/검증 목적으로 제공된다.
 */

import { and, eq } from "drizzle-orm";

import type { DbInstance } from "@/db/pool";
import { getPool } from "@/db/pool";
import { commonCodeTable } from "@/db/schema";
import type { KnnNeighbor } from "@/knn/time-decay";
import { FEATURE_NAMES, FEATURE_WEIGHTS, VECTOR_DIM } from "@/vectors/feature-spec";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { KnnNeighbor } from "@/knn/time-decay";

/** Options for a KNN similarity search. */
export type KnnSearchOptions = {
  symbol: string;
  exchange: string;
  timeframe: string;
  /** Maximum number of neighbours to return. Defaults to CommonCode KNN.top_k (fallback 50). */
  topK?: number;
  /** Distance metric to use. Defaults to CommonCode KNN.distance_metric (fallback 'cosine'). */
  distanceMetric?: "cosine" | "l2";
  /**
   * When true (default), only vectors with label IS NOT NULL are returned.
   * This option exists for documentation clarity; the engine always filters
   * to labeled vectors to ensure meaningful KNN decisions.
   */
  minLabeledOnly?: boolean;
};

/** Resolved KNN configuration. */
export type KnnConfig = {
  topK: number;
  distanceMetric: "cosine" | "l2";
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K = 50;
const DEFAULT_DISTANCE_METRIC: "cosine" | "l2" = "cosine";

/** ef_search controls HNSW recall/speed trade-off. 100 gives high recall. */
const HNSW_EF_SEARCH = 100;

// ---------------------------------------------------------------------------
// Weight index map (diagnostic / validation utility)
// ---------------------------------------------------------------------------

/**
 * FEATURE_NAMES 인덱스 → 가중치 매핑을 반환한다.
 *
 * pre-multiply 전략(D-005)에서 실제 가중치는 vectorizer/candle-features/
 * strategy-features에서 피처값에 직접 곱해진다. 이 함수는 어떤 인덱스에
 * 어떤 가중치가 매핑되는지 검사/디버깅할 때 사용한다.
 *
 * 규칙:
 *   - FEATURE_WEIGHTS에 이름이 있는 피처 → 해당 가중치
 *   - 명시적 가중치 없는 피처 → 기본 1.0
 *   - upperWick/lowerWick은 논리 그룹 키로, candle-features.ts가
 *     각 봉의 upperWick(i*5+1)과 lowerWick(i*5+2)에 적용한다.
 *     이 함수에서는 FEATURE_NAMES에 해당 이름이 없으므로 1.0으로 표시된다.
 *     (실제 pre-multiply는 extractBarFeatures 내에서 처리됨)
 *
 * @returns Float32Array(202) — 인덱스 i의 값 = 해당 피처의 논리적 가중치
 */
export function buildWeightIndexMap(): Float32Array {
  const map = new Float32Array(VECTOR_DIM).fill(1.0);

  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    const name = FEATURE_NAMES[i];
    if (name !== undefined && Object.hasOwn(FEATURE_WEIGHTS, name)) {
      map[i] = FEATURE_WEIGHTS[name] ?? 1.0;
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

/**
 * Loads the KNN configuration from the CommonCode table.
 *
 * Reads:
 *  - `KNN.top_k`          → number of neighbours (default 50)
 *  - `KNN.distance_metric` → 'cosine' or 'l2' (default 'cosine')
 *
 * Falls back to defaults when rows are absent, inactive, or contain
 * invalid values.
 *
 * @param db - Drizzle ORM instance (from getDb()).
 * @returns Resolved KnnConfig.
 */
export async function loadKnnConfig(db: DbInstance): Promise<KnnConfig> {
  const rows = await db
    .select({ code: commonCodeTable.code, value: commonCodeTable.value })
    .from(commonCodeTable)
    .where(and(eq(commonCodeTable.group_code, "KNN"), eq(commonCodeTable.is_active, true)));

  let topK = DEFAULT_TOP_K;
  let distanceMetric: "cosine" | "l2" = DEFAULT_DISTANCE_METRIC;

  for (const row of rows) {
    if (row.code === "top_k") {
      const raw = row.value;
      if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
        topK = Math.floor(raw);
      }
    } else if (row.code === "distance_metric") {
      const raw = row.value;
      if (raw === "cosine" || raw === "l2") {
        distanceMetric = raw;
      }
    }
  }

  return { topK, distanceMetric };
}

// ---------------------------------------------------------------------------
// KNN search
// ---------------------------------------------------------------------------

/**
 * Converts a Float32Array to pgvector literal format: "[0.1,0.2,...]"
 */
function float32ToPgVector(arr: Float32Array): string {
  return `[${Array.from(arr).join(",")}]`;
}

/**
 * Searches for the K nearest neighbours to `queryVector` using the
 * pgvector HNSW index on the vectors table.
 *
 * Only vectors that share the same symbol/exchange/timeframe AND have
 * a non-null label are returned (minLabeledOnly is always true in
 * practice; the option is accepted but its value does not change
 * filtering behaviour — labeled-only is always enforced).
 *
 * The function:
 *  1. Resolves topK and distanceMetric from options (falling back to
 *     CommonCode config, then hard-coded defaults).
 *  2. Opens a transaction to issue `SET LOCAL hnsw.ef_search = 100`
 *     followed by the HNSW distance query.
 *  3. Returns KnnNeighbor[] sorted ascending by distance.
 *
 * @param db - Drizzle ORM instance (used for config lookup).
 * @param queryVector - The query embedding as a Float32Array.
 * @param options - Search options (symbol, exchange, timeframe, topK, …).
 * @returns Array of KnnNeighbor sorted by distance ascending.
 */
export async function searchKnn(
  db: DbInstance,
  queryVector: Float32Array,
  options: KnnSearchOptions,
): Promise<KnnNeighbor[]> {
  const { symbol, exchange, timeframe } = options;

  // Resolve topK and distanceMetric — prefer explicit options, then DB config
  let resolvedTopK = options.topK;
  let resolvedMetric = options.distanceMetric;

  if (resolvedTopK === undefined || resolvedMetric === undefined) {
    const config = await loadKnnConfig(db);
    if (resolvedTopK === undefined) {
      resolvedTopK = config.topK;
    }
    if (resolvedMetric === undefined) {
      resolvedMetric = config.distanceMetric;
    }
  }

  const embeddingStr = float32ToPgVector(queryVector);
  const distanceExpr = resolvedMetric === "cosine" ? "<=>" : "<->";

  const pool = getPool();

  // Use a transaction so that SET LOCAL hnsw.ef_search applies only to
  // the subsequent query in this session.
  const rows = await pool.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL hnsw.ef_search = ${HNSW_EF_SEARCH}`);

    // The embedding cast to vector is required because the parameter
    // arrives as a text literal and pgvector needs the explicit type.
    const distanceExprSql = `embedding ${distanceExpr} $1::vector`;

    return tx.unsafe<
      {
        id: string;
        distance: string;
        label: string | null;
        grade: string | null;
        created_at: Date;
      }[]
    >(
      `
      SELECT
        id,
        ${distanceExprSql} AS distance,
        label,
        grade,
        created_at
      FROM vectors
      WHERE symbol = $2
        AND exchange = $3
        AND timeframe = $4
        AND label IS NOT NULL
      ORDER BY ${distanceExprSql}
      LIMIT $5
      `,
      [embeddingStr, symbol, exchange, timeframe, resolvedTopK],
    );
  });

  return rows.map((row) => ({
    vectorId: row.id,
    distance: parseFloat(row.distance),
    label: row.label,
    grade: row.grade,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  }));
}

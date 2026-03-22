# 03-vector-engine

## Objective
전략이 정의한 features를 [0,1]로 정규화하여 벡터화하고, pgvector HNSW 인덱스를 통한 L2 유사 검색을 수행한다. 전략·버전·심볼 격리 원칙을 물리적으로 보장하는 동적 벡터 테이블 관리를 포함한다.

## Scope
- `packages/core/vector/` — 정규화, 벡터화, 유사 검색, 통계 계산
- 동적 벡터 테이블: `vectors_{strategy_id}_v{version}` 생성/관리
- pgvector HNSW 인덱스 구성
- 격리 원칙 기계적 강제
- `workers/vector-worker/` — 벡터 생성 + 검색 워커

## Non-goals
- 전략 실행 (02-strategy-sandbox에서 처리)
- 라벨 판정 (04-label-decision에서 처리)
- 백테스트 모드 (05-backtest에서 처리)

## Prerequisites (milestone-level)
- M1 (Normalization): EP00-M2
- M2 (Table management): EP00-M3, EP02-M2
- M3 (Storage/retrieval): EP03-M2
- M4 (Pattern statistics): EP03-M3 (event_labels data from EP04-M1, EP04-M2 — result labeling engine + label worker. Use fixture data for independent testing.)
- M5 (Vector-worker integration): EP02-M6, EP03-M4, EP04-M3 (decision engine, inline execution)

## Milestones

### M1 — Feature normalization engine
- Deliverables:
  - `packages/core/vector/normalize.ts` — 정규화 엔진
  - 정규화 타입 구현:
    - `percent`: value / 100
    - `sigmoid`: 1 / (1 + exp(-value))
    - `percentile`: rolling percentile (윈도우 기반)
    - `minmax`: (value - min) / (max - min) (도메인 고정 범위)
    - `boolean`: 0 또는 1
  - 전략의 normalization_config 기반 동적 정규화 실행
  - 모든 출력이 [0, 1] 범위 내 보장
- Acceptance criteria:
  - 각 정규화 타입의 수학적 정확성 검증
  - 엣지 케이스: NaN, Infinity, 0 분산 → 0.0 출력
  - 출력 범위 [0, 1] 외 값 발생 시 에러
- Validation:
  ```bash
  bun test -- --filter "normalize"
  ```

### M2 — Dynamic vector table management
- Deliverables:
  - `packages/core/vector/table-manager.ts` — 동적 테이블 생성/삭제
  - 전략 버전 생성 시 자동으로 `vectors_{strategy_id}_v{version}` 테이블 생성
  - pgvector `vector(dimension)` 컬럼 + HNSW 인덱스 자동 생성
  - 테이블 존재 여부 캐시
  - **벡터 테이블 레지스트리**: `vector_table_registry` 테이블 (EP00-M3에서 스키마 선행 생성)로 모든 동적 테이블 추적 (strategy_id, version, dimension, row_count, created_at)
  - 고아 테이블 정리: 삭제된 전략의 벡터 테이블 정리 정책
  - **pgvector HNSW index tuning** — configure `m` (max connections per node, default 16), `ef_construction` (build quality, default 64), `ef_search` (query quality, default 40). Include benchmark task to validate recall@10 > 95% on a representative dataset before tuning values are finalised.
  - **Schema migration utility for dynamic tables**: when vector dimension changes (strategy feature set updated), migrate existing table by creating new table with correct dimension, copying compatible data, and dropping old table. Includes dry-run mode.
- Acceptance criteria:
  - 새 전략 버전 등록 시 벡터 테이블 자동 생성
  - HNSW 인덱스가 L2 distance 기반으로 생성
  - 이미 존재하는 테이블에 대한 생성 요청은 무시 (멱등)
- Validation:
  ```bash
  bun test -- --filter "table-manager"
  ```

### M3 — Vector storage & retrieval
- Deliverables:
  - `packages/core/vector/repository.ts` — 벡터 저장/조회
  - 벡터 저장: event_id, symbol, timeframe, embedding
  - L2 유사 검색: `ORDER BY embedding <-> query_vector LIMIT top_k`
  - similarity_threshold 적용: `√d × 0.3`
  - 검색 범위 강제: 동일 전략 + 동일 버전 + 동일 심볼
  - **Filtering logic** (PRODUCT.md §3 참조):
    1. Query pgvector: `ORDER BY embedding <-> query_vector LIMIT 50`
    2. Filter: discard results where `distance > √d × 0.3`
    3. Remaining = valid similar patterns
    4. If valid count < min_samples (30) → return INSUFFICIENT (→ PASS)
    5. If valid count ≥ 30 → return valid set for statistics calculation
- Acceptance criteria:
  - 벡터 저장 후 L2 검색으로 유사 벡터 조회 가능
  - top_k=50 검색 < 100ms
  - threshold 초과 벡터가 통계 계산에서 제외됨
  - threshold 통과 벡터 < 30개일 때 INSUFFICIENT 반환
  - 다른 전략/버전/심볼의 벡터는 절대 반환 안 됨
- Validation:
  ```bash
  bun test -- --filter "vector-repo|vector-search"
  ```

### M4 — Pattern statistics computation
- Deliverables:
  - `packages/core/vector/statistics.ts` — 유사 패턴 통계 계산
  - 입력: 유사 벡터의 event_id 목록 + event_labels
  - 출력: winrate, avg_win, avg_loss, expectancy, sample_count
  - min_samples 필터: 유효 샘플 < 30이면 INSUFFICIENT 반환
  - **중요**: 실시간 통계 계산은 기존 라벨만 사용 (아직 라벨링 안 된 최근 이벤트 제외). 라벨이 누적될수록 통계 정밀도 향상
- Acceptance criteria:
  - winrate = WIN 수 / 전체 라벨 수 (TIME_EXIT 포함)
  - expectancy = (winrate × avg_win) - ((1 - winrate) × avg_loss)
  - 라벨 없는 이벤트는 통계에서 제외
  - 결과가 수학적으로 정확
- Validation:
  ```bash
  bun test -- --filter "statistics"
  ```

### M5 — Vector worker integration
- Deliverables:
  - `workers/vector-worker/` — 벡터 생성 + 검색 워커
  - `LISTEN strategy_event_created` → 피처 정규화 → 벡터 저장 → L2 검색 → 통계 계산 → 의사결정(인라인) → `decisions` 저장
  - `NOTIFY decision_completed` 발행 (EP07 결정: decision engine이 vector-worker에서 인라인 실행, 다운스트림은 decision_completed 수신)
  - 벡터 저장 멱등성: unique(event_id, strategy_id, version)
- Acceptance criteria:
  - 이벤트 수신 → 벡터 생성 → 검색 → 통계 계산 파이프라인 완료
  - 동일 이벤트 재처리 시 멱등
  - 전략별 올바른 벡터 테이블에 저장
- Validation:
  ```bash
  bun test -- --filter "vector-worker"
  ```

## Task candidates
- T-039: Implement percent, sigmoid, boolean normalizers
- T-040: Implement rolling percentile normalizer
- T-041: Implement min-max normalizer with domain-fixed ranges
- T-042: Build normalization orchestrator (strategy config → pipeline)
- T-043: Implement dynamic vector table creation with pgvector + HNSW
- T-044: Implement vector table existence cache
- T-045: Build vector repository (store + L2 search)
- T-046: Implement similarity threshold filtering (√d × 0.3)
- T-047: Enforce isolation: strategy+version+symbol scope in queries
- T-048: Implement pattern statistics calculator (winrate, expectancy)
- T-049: Build vector-worker with LISTEN → normalize → store → search → stats → decision(inline) → NOTIFY decision_completed
- T-050: Add vector write idempotency (unique event_id per table)
- T-051: Integration test: event → vector → search → statistics pipeline
- T-052: Performance test: L2 search < 100ms for top_k=50
- T-052a: Implement dynamic vector table schema migration utility (dimension change)
- T-052b: Vector table count guard — enforce max 1,000 dynamic vector tables per deployment, reject creation beyond limit with ERR_USER_TABLE_LIMIT error

## Risks
- pgvector HNSW 인덱스 빌드 시간이 대량 벡터 삽입 시 느릴 수 있음
- 전략별 물리 테이블 분리로 인한 DB 관리 복잡도 증가
- 동적 dimension(전략마다 다름)에 대한 pgvector 인덱스 최적화
- rolling percentile 계산 시 윈도우 데이터 프리로딩 성능
- HNSW 인덱스 대량 벡터 삽입 후 성능 저하 시 REINDEX 필요 — 백테스트 완료 시 자동 REINDEX 스케줄 권장

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | 전략·버전별 물리 테이블 분리 | 격리 원칙의 기계적 보장 — 쿼리 실수로 교차 검색 불가능 |
| 2026-03-21 | L2 distance (cosine 아님) | Discovery 요구사항 확정 |
| 2026-03-21 | HNSW 인덱스 (IVFFlat 아님) | 실시간 검색 성능 + 인서트 후 즉시 검색 가능 |
| 2026-03-21 | similarity_threshold = √d × 0.3 | 차원에 비례하는 동적 임계값 |
| 2026-03-22 | Threshold mathematical rationale confirmed | For [0,1]-normalized vectors in d dimensions, expected random L2 distance ≈ √(d/6) ≈ 0.408√d. Threshold 0.3√d is ~73% of random baseline — filters noise while keeping genuinely similar patterns. Fine-tuning in EP03-M2 benchmark (recall@10 > 95%). |
| 2026-03-22 | Filtering logic: query → threshold filter → count check → INSUFFICIENT or valid set | Top_k=50 results are post-filtered by threshold. Remaining valid results must be ≥ min_samples (30) for statistics. Below → PASS (insufficient evidence). |
| 2026-03-21 | Dynamic vector tables exempt from DrizzleORM policy | Vector engine creates per-metric tables dynamically; DrizzleORM cannot handle dynamic table schemas. Decision: use raw SQL with type-safe wrapper functions for dynamic vector tables. Consequences: vector engine module owns all dynamic table operations; no other module may create dynamic tables. |
| 2026-03-21 | 백테스트 후 HNSW REINDEX 권장 | 대량 삽입 후 인덱스 품질 저하 방지 |
| 2026-03-21 | EP03-M5 depends on EP04-M3 (circular dependency resolution) | EP03-M5 (vector-worker) calls EP04-M3 (decision engine) inline for latency optimization. This creates a reverse dependency: EP03-M5 must be scheduled after EP04-M3 completion. Decision engine is implemented as a pure function in packages/core/decision, importable by vector-worker without worker-level dependency. PLANS.md milestone graph updated to reflect: EP03-M5 depends on EP04-M3. |

## Progress notes
- 2026-03-22: Tasks generated T-027 through T-034 (8 tasks). Includes decision engine (EP04-M3) as T-032 since it's required by vector worker (EP03-M5). Deferred: HNSW tuning benchmark, schema migration utility, orphan table cleanup.
- 2026-03-22: All tasks implemented (T-027–T-034). 283 tests passing. Typecheck clean. Lint clean.

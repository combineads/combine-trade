# 02-strategy-sandbox

## Objective
TypeScript로 작성된 전략 코드를 DB에 저장하고 런타임 샌드박스에서 안전하게 실행하는 동적 전략 시스템을 구축한다. Pine Script 수준의 기술지표 API와 캔들 데이터 접근을 제공한다.

## Scope
- `packages/core/indicator/` — 기술지표 라이브러리 (SMA, EMA, BB, RSI, MACD, ATR 등)
- `packages/core/strategy/` — 전략 샌드박스, API, 실행 엔진
- DB schema: `strategies` 테이블 (코드 + 메타데이터 + 버전)
- Strategy API: 캔들 데이터, 지표, 타임프레임 접근
- 전략 코드 출력: event_condition, features[], entry/exit conditions

## Non-goals
- 전략 코드 에디터 UI (08-api-ui에서 처리)
- 벡터화 (03-vector-engine에서 처리)
- 백테스트 실행 (05-backtest에서 처리)

## Prerequisites
- `00-project-bootstrap` M2 (모노레포), M3 (DB), M4 (indicator 기초), M5 (IoC/AOP)
- `01-candle-collection` M2 (캔들 모델/저장소) — 전략이 캔들 데이터에 접근해야 함
- Note: M0 (Sandbox isolation PoC) has no prerequisites beyond EP00-M2 (monorepo scaffold) and can start immediately after EP00-M2 is complete.

## Milestones

### M0 — V8 isolate sandbox setup
- Deliverables:
  - Install and configure `isolated-vm` library
  - Implement base isolate factory: create V8 isolate with memory limit (128MB) and execution timeout (500ms)
  - Implement sandbox security boundary:
    - No access to filesystem, network, or parent process memory
    - No access to Node/Bun built-ins (fs, net, http, child_process)
    - Only provided Strategy API surface is available
  - Establish security boundary document: what can and cannot be accessed from the sandbox
  - Benchmark: isolate creation time, memory overhead, execution time for sample strategy
- Success criteria:
  - Strategy code cannot access filesystem, network, or parent process memory
  - Memory limit enforced: > 128MB allocation throws ERR_FATAL_SANDBOX_OOM
  - Execution timeout enforced: > 500ms throws ERR_FATAL_SANDBOX_TIMEOUT
  - Isolate creation < 50ms, strategy execution < 100ms for single candle
- Validation:
  ```bash
  bun test -- --filter "sandbox-poc"
  ```
- Decision: **V8 isolates (`isolated-vm`) selected over Bun worker threads** — see Decision log 2026-03-22 entry.

### M1 — Technical indicator library
- Deliverables:
  - `packages/core/indicator/` — 순수 함수 기반 지표 라이브러리
  - 구현 대상: SMA, EMA, WMA, BB (Bollinger Bands), RSI, MACD, ATR, Stochastic, CCI, ADX, OBV, VWAP
  - 각 지표에 대한 단위 테스트 (알려진 데이터셋 대비 검증)
  - 스트리밍/인크리멘탈 계산 지원 (실시간 성능용)
- Acceptance criteria:
  - 모든 지표가 TradingView/ta-lib 결과와 소수점 6자리까지 일치
  - 빈 입력, 불충분 데이터 등 엣지 케이스 처리
  - 지표 함수는 외부 의존성 없는 순수 함수
- Validation:
  ```bash
  bun test -- --filter "indicator"
  ```

### M2 — Strategy model & CRUD
- Deliverables:
  - `strategies` 테이블 DrizzleORM 스키마
  - 전략 CRUD 서비스: create, read, update (version bump), delete (soft)
  - 전략 메타데이터 검증: features[], normalization_config, search_config 필수
  - **저장 전 코드 검증**:
    - TypeScript 파싱/AST 검증 (구문 오류 감지)
    - 금지 API 정적 분석 (eval, import, require, fetch, fs 등 감지)
    - Strategy API 타입 호환성 체크 (defineFeature, setEntry 등 올바른 사용)
  - 버전 관리: version bump 시 새 레코드 생성
  - **Strategy activation workflow** — strategies require explicit activation by the user, with validation checks (syntax valid, API version compatible, risk limits configured) before going live. Inactive strategies cannot receive market data.
  - **Strategy deactivation workflow**: deactivation stops all real-time processing (candle_closed events ignored), preserves historical data and vectors. Reactivation requires passing validation checks (syntax, API version, risk limits) before resuming.
- Acceptance criteria:
  - TypeScript 코드 + 메타데이터 저장/조회 가능
  - features[] 미정의 시 저장 거부
  - 문법 오류 있는 코드 저장 거부
  - 금지 API 사용 코드 저장 거부 (eval, import 등)
  - 버전 변경 시 기존 버전 보존 (immutable)
  - `packages/core/strategy/` must use repository interfaces for data access — no direct Drizzle schema imports. Workers inject concrete repository implementations.
- Validation:
  ```bash
  bun test -- --filter "strategy-model|strategy-crud"
  ```

### M3 — Strategy sandbox runtime
- Deliverables:
  - `packages/core/strategy/sandbox.ts` — V8 isolate 기반 격리 실행 환경
  - `isolated-vm` 라이브러리를 사용한 전략 코드 실행
  - 리소스 제한: 메모리 128MB, 실행 타임아웃 500ms
  - 금지 API: 직접 DB 접근, 네트워크, 파일시스템, eval, dynamic import
  - Isolate lifecycle: 전략 활성화 시 생성, 캔들 평가 간 재사용, 비활성화 시 파괴
  - 리소스 위반 시 kill switch 연동: OOM → ERR_FATAL_SANDBOX_OOM, timeout → ERR_FATAL_SANDBOX_TIMEOUT (EP09 M1 자동 트리거)
- Acceptance criteria:
  - 전략 코드가 제공된 API 외 시스템 리소스 접근 불가
  - 무한 루프 시 500ms 후 타임아웃
  - 메모리 128MB 초과 시 에러로 종료
  - 정상 전략 코드 실행 결과 반환
  - 한 전략의 crash가 다른 전략에 영향 없음 (isolate 격리)
- Validation:
  ```bash
  bun test -- --filter "sandbox"
  ```

### M4 — Strategy API (Pine Script level)
- Deliverables:
  - 샌드박스 내 사용 가능한 API 세트:
    - `candle(symbol, timeframe, offset)` — OHLCV 데이터 접근
    - `indicator.sma(source, period)`, `indicator.ema(...)`, `indicator.bb(...)` 등
    - `timeframe(tf)` — 멀티 타임프레임 데이터 참조
    - `close`, `open`, `high`, `low`, `volume` — 현재 캔들 단축 접근
    - `bar_index` — 현재 바 인덱스
  - features 정의 API:
    - `defineFeature(name, value, normalization)` — 벡터 피처 등록
  - 매매 조건 API (선택):
    - `setEntry(condition)`, `setExit(condition)` — 커스텀 매매 조건
- Acceptance criteria:
  - 전략 코드에서 지표 호출 → 올바른 결과 반환
  - 멀티 타임프레임 데이터 접근 가능
  - defineFeature로 정의한 피처가 정확히 수집됨
- Validation:
  ```bash
  bun test -- --filter "strategy-api"
  ```

### M5 — Strategy warm-up period handling
- Deliverables:
  - 전략 warm-up 기간 자동 감지:
    - 전략이 사용하는 최대 지표 기간 계산 (예: EMA(200) → 200바 warm-up)
    - 멀티 타임프레임 접근 시 상위 타임프레임 warm-up도 반영
  - warm-up 기간 내 이벤트 발생 억제:
    - 지표 계산에 충분한 데이터 없으면 event_condition 평가 스킵
    - 백테스트 시 warm-up 기간 결과 제외
  - warm-up 상태 보고: 전략 시작 시 "warm-up 진행 중 (N/M bars)" 로그
- Acceptance criteria:
  - EMA(200) 사용 전략 → 처음 200바 동안 이벤트 미발생
  - 백테스트 리포트에서 warm-up 제외 기간 명시
  - 전략에 warm-up 관련 설정 없어도 자동 감지
- Validation:
  ```bash
  bun test -- --filter "warm-up|warmup"
  ```

### M6 — Strategy evaluation pipeline
- Deliverables:
  - `workers/strategy-worker/` — 전략 평가 워커
  - `LISTEN candle_closed` → 활성 전략 로드 → 샌드박스 실행 → 이벤트 판정
  - 이벤트 발생 시: `strategy_events` 저장 + `NOTIFY strategy_event_created`
  - 전략별 독립 실행 (한 전략 에러가 다른 전략 차단 안 함)
  - **Parallel strategy evaluation** using V8 isolate pool (`isolated-vm`) — evaluate multiple active strategies concurrently. Pool size: `Math.max(2, os.cpus().length - 1)`. Backpressure: reject backtest work when pool is saturated rather than unbounded queuing. Real-time strategies have priority over backtest.
- Acceptance criteria:
  - 캔들 close 이벤트 수신 → 모든 활성 전략 평가
  - 전략 조건 충족 시 strategy_events 저장
  - NOTIFY 발행
  - 단일 전략 에러 시 다른 전략 정상 처리
- Validation:
  ```bash
  bun test -- --filter "strategy-worker"
  ```

## Task candidates
- (not implemented): Implement SMA, EMA, WMA indicators with tests
- T-02-001: Implement BB, RSI, MACD indicators with tests
- T-02-002: Implement ATR, Stochastic, CCI, ADX indicators with tests
- T-02-003: Implement OBV, VWAP indicators with tests
- T-02-004: Create strategies DrizzleORM schema and CRUD service
- T-02-005: Implement strategy code pre-save validation (TypeScript parsing, forbidden API detection)
- (not implemented): Implement Strategy API type compatibility check at save time
- (not implemented): Implement strategy version management (immutable versions)
- T-02-006: Build sandbox runtime with V8 isolates (isolated-vm) — isolate factory, lifecycle management
- (not implemented): Implement sandbox resource limits (128MB memory, 500ms timeout) + kill switch integration (ERR_FATAL_SANDBOX_OOM/TIMEOUT)
- T-02-007: Design and implement Strategy API (candle access, indicators)
- T-02-008: Implement multi-timeframe data access and warm-up period auto-detection in sandbox API
- (not implemented): Implement defineFeature API for vector feature registration
- (not implemented): Implement optional setEntry/setExit custom trade conditions
- (not implemented): Implement warm-up period event suppression (real-time + backtest)
- T-02-010: Build strategy-worker with LISTEN candle_closed → evaluate
- (not implemented): Add per-strategy error isolation in strategy-worker
- T-02-011: Integration test: strategy code → sandbox → event generation

## Risks
- V8 isolate (`isolated-vm`) 라이브러리의 Bun 호환성 — Bun은 Node.js native addon을 대부분 지원하나, `isolated-vm`의 V8 바인딩이 Bun 버전에 따라 비호환 가능. M0 PoC에서 즉시 검증.
- Isolate 메모리 오버헤드 — 전략당 ~50MB, 50개 전략 시 ~2.5GB. MVP(5-10 전략)에서는 문제 없으나 확장 시 worker 분리 필요.
- Pine Script 수준 API 범위 정의가 넓어 초기 구현 범위 조절 필요
- 전략 코드의 TypeScript 파싱/검증 복잡도
- 멀티 타임프레임 데이터 접근 시 캔들 데이터 프리로딩 성능
- 전략 warm-up 기간이 긴 지표(EMA 200 등) 사용 시 초기 데이터 로드 시간

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | 지표 라이브러리를 순수 함수로 구현 | 외부 의존 없이 테스트 가능, 샌드박스 내 안전 사용 |
| 2026-03-21 | 전략 코드는 DB 저장 (파일 기반 아님) | Discovery 결정: UI에서 작성, DB 저장, 런타임 실행 |
| 2026-03-21 | features[] 정의를 필수로 강제 | 벡터화 파이프라인의 핵심 입력 — 미정의 시 시스템 무의미 |
| 2026-03-21 | 매매 조건은 선택적 오버라이드 | 미정의 시 기본 의사결정 로직 (winrate/expectancy) 사용 |
| 2026-03-22 | V8 isolates (`isolated-vm`) 선택 (Bun worker threads 탈락) | Worker threads는 격리 수준 낮음 (shared memory, escape paths). V8 isolates는 진정한 heap-level 격리 + 메모리/CPU 제한 강제. 24/7 실자금 거래 환경에서 보안이 latency보다 우선. See ARCHITECTURE.md §Strategy evaluation concurrency. |
| 2026-03-22 | Sandbox 타임아웃 500ms (5초에서 단축) | 캔들 close → 결정 1초 budget에서 sandbox 500ms + vector search/decision 500ms 배분. |

## Progress notes
- 2026-03-22: Tasks generated T-02-001 through T-02-011 (11 tasks)
  - T-02-001: RSI, MACD indicators
  - T-02-002: ATR, Stochastic, CCI, ADX indicators
  - T-02-003: OBV, VWAP indicators
  - T-02-004: Strategies schema + CRUD service
  - T-02-005: Strategy code validation
  - T-02-006: V8 isolate sandbox runtime
  - T-02-007: Strategy API for sandbox
  - T-02-008: Multi-timeframe + warm-up handling
  - T-02-009: Strategy events schema
  - T-02-010: Strategy evaluation worker
  - T-02-011: Strategy sandbox integration test

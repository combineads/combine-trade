# 05-signal-pipeline

## Objective
Double-BB 전략의 핵심 시그널 파이프라인을 구현한다. 방향 필터 → WATCHING 감지 → Evidence Gate → Safety Gate → 벡터화 → KNN 의사결정 전체 흐름을 구축한다.

## Scope
- `src/filters/` (L4): 일간 방향 필터, 거래차단 관리자
- `src/vectors/` (L3): 202차원 벡터라이저, Median/IQR 정규화
- `src/knn/` (L4): KNN 엔진, 거리 메트릭, 시간 감쇠
- `src/signals/` (L5): WATCHING 감지기, Evidence Gate, Safety Gate

## Non-goals
- 포지션 사이징/주문 실행 (EP-06)
- 백테스트 런너 (EP-13)
- 웹 UI 시그널 표시 (EP-11)
- 데몬 파이프라인 오케스트레이션 (EP-09) — 각 모듈은 독립 API로 제공, 데몬이 호출 순서를 결정

## Prerequisites
- EP-01 (core, db, config) 완료 ✅ — 아카이빙: `docs/tasks/archive/ep-01-foundation/`
- EP-02 (indicators) 완료 ✅ — 아카이빙: `docs/tasks/archive/ep-02-indicators/`
- EP-04 (market-data) 완료 ✅ — DB 테스트 인프라(docker-compose, test-db helpers, global-teardown) 사용 가능. 아카이빙: `docs/tasks/archive/ep-04-market-data/`
- **참고:** EP-04에서 구축한 DB 테스트 인프라(tests/helpers/test-db.ts, tests/helpers/global-teardown.ts, docker-compose.yml)를 모든 DB 통합 테스트에 활용. mock DB 금지.

## Milestones

### M0 — 202차원 벡터 피처 명세
- Deliverables:
  - `docs/VECTOR_SPEC.md` — 202개 피처의 이름, 계산 방법, 출처 캔들 타임프레임
  - `src/vectors/features.ts` — 피처 이름 상수 배열 (VECTOR_SPEC.md와 동기화, 런타임 검증용)
  - 피처 카테고리: 가격 위치(BB20/BB4 %B), 모멘텀(RSI), 변동성(ATR, bandwidth), 추세(MA slope), 시간(세션 위치) 등
  - 각 피처의 정규화 방법 (Median/IQR)
  - FEATURE_WEIGHT CommonCode 그룹과의 매핑
- Acceptance criteria:
  - 정확히 202개 피처 목록 완성
  - 각 피처에 계산 수식/로직 명시
  - 출처 타임프레임(5M/1M) 명시
  - 정규화 파라미터 산출 방법 정의
  - `src/vectors/features.ts` 상수 배열 길이 = 202 테스트 통과
- Validation:
  - `bun test -- --grep "features"`
  - `bun run typecheck`

### M1 — 스키마 마이그레이션 (TradeBlock, WatchSession, Signal, SignalDetail, Vector)
- Deliverables:
  - `src/db/schema.ts` — 5개 Transaction 테이블 Drizzle 스키마 정의
  - Drizzle 마이그레이션 SQL (도메인별 분리: filters/signals/vectors)
  - 모든 CHECK 제약, FK, 인덱스 포함
  - Vector 테이블 pgvector HNSW 인덱스
- Acceptance criteria:
  - 5개 테이블 모두 DATA_MODEL.md 정의와 일치
  - FK 참조 무결성 (Symbol, WatchSession→Signal, Signal→SignalDetail 등)
  - HNSW 인덱스 생성 (ef_construction=200, m=16, cosine)
  - 마이그레이션 정상 실행 (기존 테이블 보존)
  - DB 통합 테스트로 테이블 존재 및 제약 조건 검증
- Validation:
  - `bun test -- --grep "schema"`
  - `bun run typecheck`

### M2 — 방향 필터 & 거래차단
- Deliverables:
  - `src/filters/daily-direction.ts` — 1D 마감 시 LONG_ONLY/SHORT_ONLY/NEUTRAL 결정
  - `src/filters/trade-block.ts` — TradeBlock 테이블 기반 거래차단 판단
  - SymbolState.daily_bias 업데이트 로직
- Acceptance criteria:
  - daily_MA20 기울기(vs 전일) + 현재가 vs daily_open 기반 방향 결정 정확
  - 경제이벤트, 펀딩, 장 개장, 수동 차단 모두 처리
  - 반복 패턴과 일회성 이벤트 분리 처리
  - Investing.com API 실패 시 fail-closed (차단 유지)
  - DB 통합 테스트: TradeBlock CRUD + 시간 기반 차단 판정
- Validation:
  - `bun test -- --grep "filters"`
  - `bun run typecheck && bun run lint`

### M3 — WATCHING 감지기
- Deliverables:
  - `src/signals/watching.ts` — 1H 마감 시 3가지 조건 감지:
    1. 스퀴즈 브레이크아웃 (Squeeze Breakout)
    2. 지지/저항 컨플루언스 (S/R Confluence)
    3. BB4 터치
  - WatchSession DB 생성/무효화 로직
  - 심볼×거래소당 활성 세션 1개 제약 준수
- Acceptance criteria:
  - 3가지 감지 유형 모두 구현
  - 전제 붕괴 시 즉시 무효화 (bias 변경, 가격 이탈 등)
  - WatchSession DB 저장 정상 (DB 통합 테스트)
  - 활성 세션 제약: 새 세션 시작 시 기존 활성 세션 자동 무효화
- Validation:
  - `bun test -- --grep "watching"`
  - `bun run typecheck && bun run lint`

### M4 — Evidence Gate & Safety Gate
- Deliverables:
  - `src/signals/evidence-gate.ts` — 5M/1M BB4 터치 감지, Double-B vs One-B 분류
  - `src/signals/safety-gate.ts` — 윅 비율, 박스 범위 중심, 비정상 캔들 필터, 1M 노이즈 필터 포함
  - Signal 레코드 생성 (knn_decision=null — KNN 단계에서 업데이트)
  - SignalDetail key-value 관측값 기록
- Acceptance criteria:
  - BB4 터치 감지 정확 (Low <= BB4_lower (LONG) / High >= BB4_upper (SHORT))
  - Double-B: BB4 + BB20 동시 터치 감지 (2연속 아님)
  - Safety Gate 통과/실패 이유 SignalDetail에 기록
  - 1M 노이즈 필터: 5M MA20 방향이 일봉 방향과 불일치 시 PASS (PRD 7.7)
  - WATCHING 상태에서만 시그널 생성
  - 5M/1M 동시 시그널 시 1M 우선 (SL 타이트 → 손익비 유리, PRD 7.16)
  - DB 통합 테스트: Signal + SignalDetail 저장/조회
- Validation:
  - `bun test -- --grep "evidence-gate|safety-gate"`
  - `bun run typecheck && bun run lint`

### M5 — 202차원 벡터라이저
- Deliverables:
  - `src/vectors/vectorizer.ts` — 캔들 + 지표 데이터 → 202차원 Float32Array (features.ts 상수 기반)
  - `src/vectors/normalizer.ts` — Median/IQR 정규화
  - Vector DB 저장 (pgvector)
- Acceptance criteria:
  - 벡터 차원이 정확히 202 (features.ts 상수와 일치)
  - 정규화로 특성 스케일 통일
  - pgvector 저장 및 조회 성공 (DB 통합 테스트)
  - 5M, 1M 타임프레임에서만 생성
- Validation:
  - `bun test -- --grep "vectors"`
  - `bun run typecheck && bun run lint`

### M6 — KNN 의사결정 엔진
- Deliverables:
  - `src/knn/engine.ts` — KNN 검색 (cosine/L2), top-k 결과 반환
  - `src/knn/time-decay.ts` — 시간 감쇠 가중치
  - `src/knn/decision.ts` — PASS/FAIL/SKIP 결정 (승률, 기대값, 샘플 수)
  - A-grade 시그널 부스트 로직
  - Signal.knn_decision 업데이트 로직
- Acceptance criteria:
  - pgvector HNSW 인덱스 활용 검색 (DB 통합 테스트)
  - 시간 감쇠 적용 (최근 데이터 가중)
  - CommonCode KNN 파라미터 (top_k 등) 참조
  - 결정 결과가 Signal.knn_decision에 기록 (null → PASS/FAIL/SKIP 업데이트)
  - A-grade 판정: Double-B + Safety 통과 + KNN 승률 임계치 초과 → a_grade=true
- Validation:
  - `bun test -- --grep "knn"`
  - `bun run typecheck && bun run lint`
  - 벡터 100개 이상에서 검색 성능 < 100ms 확인

## Task candidates
- T-05-000: docs/VECTOR_SPEC.md + src/vectors/features.ts — 202차원 벡터 피처 사양 및 상수 정의
- T-05-001: db/schema.ts — TradeBlock, WatchSession 테이블 Drizzle 스키마 & 마이그레이션
- T-05-002: db/schema.ts — Signal, SignalDetail 테이블 Drizzle 스키마 & 마이그레이션
- T-05-003: db/schema.ts — Vector 테이블 + pgvector HNSW 인덱스 Drizzle 스키마 & 마이그레이션
- T-05-004: filters/daily-direction.ts — 일간 방향 필터 (MA20 기울기 + daily_bias 업데이트)
- T-05-005: filters/trade-block.ts — 거래차단 관리자 (반복 패턴 + 일회성 + fail-closed)
- T-05-006: signals/watching.ts — WATCHING 감지기 (3가지 유형: Squeeze Breakout, S/R Confluence, BB4 Touch) + WatchSession DB 생명주기
- T-05-007: signals/evidence-gate.ts — Evidence Gate (BB4 터치 감지 + Double-B vs One-B 분류 + Signal/SignalDetail 생성)
- T-05-008: signals/safety-gate.ts — Safety Gate (윅 비율, 박스 범위 중심, 비정상 캔들, 1M 노이즈 필터)
- T-05-009: vectors/vectorizer.ts — 202차원 벡터 생성 (features.ts + VECTOR_SPEC.md 기반)
- T-05-010: vectors/normalizer.ts — Median/IQR 정규화 + Vector DB 저장
- T-05-011: knn/engine.ts — pgvector HNSW KNN 검색 (cosine/L2)
- T-05-012: knn/time-decay.ts — 시간 감쇠 가중치
- T-05-013: knn/decision.ts — PASS/FAIL/SKIP 의사결정 + A-grade 판정 + Signal.knn_decision 업데이트
- T-05-014: 시그널 파이프라인 E2E 통합 테스트

## Risks
- **202차원 벡터 정의**: 정확한 피처 구성이 PRD에 상세하지 않음. 백테스트 결과로 검증 필요. 가정: 기본 피처셋 정의 후 WFO에서 가중치 조정.
- **KNN 성능**: 100K+ 벡터에서 HNSW 검색 100ms 이내 보장 어려울 수 있음. 대안: ef_search 파라미터 튜닝.
- **S/R 컨플루언스 정의**: 지지/저항 레벨 계산 방법이 명시적이지 않음. Decision log에 기록.
- **스키마 마이그레이션 크기**: 5개 테이블을 3개 태스크로 분할했으나, FK 간 의존성(Signal→WatchSession, Vector→Candle) 때문에 마이그레이션 순서가 중요. T-05-001 → T-05-002 → T-05-003 순서 필수.

## Decision log
- 벡터 202차원 구성은 M0에서 docs/VECTOR_SPEC.md로 사전 확정 (M5 벡터라이저의 전제 조건)
- **202차원 출처**: 원 전략(김직선)의 피처 설계에서 유래. 카테고리: 가격 위치(BB20/BB4 %B, MA 대비 위치) ~40개, 모멘텀(RSI, ROC) ~30개, 변동성(ATR, bandwidth, range) ~30개, 추세(MA slope, 정배열) ~40개, 시계열 파생(이전 N봉 변화율) ~50개, 시간/세션(장 위치, 요일) ~12개. 정확한 구성은 VECTOR_SPEC.md에서 확정.
- S/R 레벨은 최근 N개 피봇 포인트 기반으로 구현 (피봇 기간, 컨플루언스 기준은 VECTOR_SPEC과 함께 정의)
- KNN은 cosine 거리 기본, L2는 CommonCode 설정으로 전환 가능
- Transaction 테이블(TradeBlock, WatchSession, Signal, SignalDetail, Vector)은 이 에픽의 3개 마이그레이션 태스크에서 도메인별 분리 생성
- **Signal 2단계 흐름**: Signal은 Evidence Gate에서 knn_decision=null로 생성됨 → Vectorizer가 벡터 생성 → KNN이 결정 후 Signal.knn_decision 업데이트. 데몬(EP-09)이 이 흐름을 오케스트레이션.
- **A-grade 판정 기준**: signal_type=DOUBLE_B + safety_passed=true + KNN 승률 ≥ CommonCode.KNN.a_grade_winrate_threshold (가정: 0.65). KNN decision 단계에서 판정하여 Signal.a_grade에 기록.
- **1M 노이즈 필터는 Safety Gate에 통합**: 별도 파일/태스크가 아닌 safety-gate.ts 내부에 1M 전용 조건으로 구현. Safety Gate가 모든 필터링 조건을 일원화.
- **WATCHING 감지기 3가지 유형 통합**: Squeeze Breakout, S/R Confluence, BB4 Touch는 같은 인터페이스(`detect(candle, indicators) → WatchingResult | null`)를 공유하므로 단일 모듈로 구현. 파일 분할은 코드 크기에 따라 구현 시 판단.

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- 2026-04-04: 에픽 리뷰 완료. Critical 3건 수정: (1) T-05-001 5개 테이블→3개 태스크로 분할 (도메인별: filters+signals / signals / vectors), (2) T-05-004/005/006 watching.ts 3개→1개 통합, (3) T-05-007/008 evidence-gate.ts 2개→1개 통합. Important 5건 수정: M0 runnable validation 추가, Prerequisites EP-04 DB 인프라 명시, noise filter Safety Gate 통합, 17→15 태스크 축소, A-grade 기준 Decision log 추가. Minor 3건: typecheck/lint validation 추가, 202차원 출처 기록, Signal 2단계 흐름 명시.
- 2026-04-04: 태스크 생성 완료 (15개, T-05-000 ~ T-05-014). 의존성 체인:
  - Wave 1: T-05-000(features), T-05-001(schema:filters), T-05-004(direction), T-05-012(time-decay)
  - Wave 2: T-05-002(schema:signals), T-05-005(trade-block), T-05-006(watching), T-05-009(vectorizer)
  - Wave 3: T-05-003(schema:vector), T-05-007(evidence-gate)
  - Wave 4: T-05-008(safety-gate), T-05-010(normalizer), T-05-011(knn-engine)
  - Wave 5: T-05-013(knn-decision)
  - Wave 6: T-05-014(e2e-test)

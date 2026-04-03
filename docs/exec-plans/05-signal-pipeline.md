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
- 백테스트 런너 (EP-11)
- 웹 UI 시그널 표시 (EP-10)

## Prerequisites
- EP-01 (core, db, config) 완료
- EP-02 (indicators) 완료
- EP-04 M1 (히스토리 캔들 — 벡터 생성에 필요) 진행 중 이상

## Milestones

### M0 — 202차원 벡터 피처 명세
- Deliverables:
  - `docs/VECTOR_SPEC.md` — 202개 피처의 이름, 계산 방법, 출처 캔들 타임프레임
  - 피처 카테고리: 가격 위치(BB20/BB4 %B), 모멘텀(RSI), 변동성(ATR, bandwidth), 추세(MA slope), 시간(세션 위치) 등
  - 각 피처의 정규화 방법 (Median/IQR)
  - FEATURE_WEIGHT CommonCode 그룹과의 매핑
- Acceptance criteria:
  - 정확히 202개 피처 목록 완성
  - 각 피처에 계산 수식/로직 명시
  - 출처 타임프레임(5M/1M) 명시
  - 정규화 파라미터 산출 방법 정의
- Validation:
  - 피처 수 합계 = 202 확인
  - 모든 피처가 EP-02 지표 또는 candle 원시 데이터로 계산 가능한지 검증

### M1 — 방향 필터 & 거래차단
- Deliverables:
  - `src/filters/daily-direction.ts` — 1D 마감 시 LONG_ONLY/SHORT_ONLY/NEUTRAL 결정
  - `src/filters/trade-block.ts` — TradeBlock 테이블 기반 거래차단 판단
  - SymbolState.daily_bias 업데이트 로직
- Acceptance criteria:
  - daily_MA20 기울기(vs 전일) + 현재가 vs daily_open 기반 방향 결정 정확
  - 경제이벤트, 펀딩, 장 개장, 수동 차단 모두 처리
  - 반복 패턴과 일회성 이벤트 분리 처리
  - Investing.com API 실패 시 fail-closed (차단 유지)
- Validation:
  - `bun test -- --grep "filters"`

### M2 — WATCHING 감지기
- Deliverables:
  - `src/signals/watching.ts` — 1H 마감 시 3가지 조건 감지:
    1. 스퀴즈 브레이크아웃 (Squeeze Breakout)
    2. 지지/저항 컨플루언스 (S/R Confluence)
    3. BB4 터치
  - WatchSession 생성/무효화 로직
  - 심볼×거래소당 활성 세션 1개 제약 준수
- Acceptance criteria:
  - 3가지 감지 유형 모두 구현
  - 전제 붕괴 시 즉시 무효화 (bias 변경, 가격 이탈 등)
  - WatchSession DB 저장 정상
- Validation:
  - `bun test -- --grep "watching"`

### M3 — Evidence Gate & Safety Gate
- Deliverables:
  - `src/signals/evidence-gate.ts` — 5M/1M BB4 터치 감지, Double-B vs One-B 분류
  - `src/signals/safety-gate.ts` — 윅 비율, 박스 범위 중심, 비정상 캔들 필터
  - Signal 레코드 생성 (SignalDetail 포함)
- Acceptance criteria:
  - BB4 터치 감지 정확 (Low <= BB4_lower (LONG) / High >= BB4_upper (SHORT))
  - Double-B: BB4 + BB20 동시 터치 감지 (2연속 아님)
  - Safety Gate 통과/실패 이유 SignalDetail에 기록
  - 1M 전용 노이즈 필터: 5M MA20 방향이 일봉 방향과 불일치 시 PASS (PRD 7.7)
  - WATCHING 상태에서만 시그널 생성
  - 5M/1M 동시 시그널 시 1M 우선 (SL 타이트 → 손익비 유리, PRD 7.16)
- Validation:
  - `bun test -- --grep "evidence-gate|safety-gate"`

### M4 — 202차원 벡터라이저
- Deliverables:
  - `src/vectors/vectorizer.ts` — 캔들 + 지표 데이터 → 202차원 Float32Array
  - `src/vectors/normalizer.ts` — Median/IQR 정규화
  - Vector DB 저장 (pgvector)
- Acceptance criteria:
  - 벡터 차원이 정확히 202
  - 정규화로 특성 스케일 통일
  - pgvector 저장 및 조회 성공
  - 5M, 1M 타임프레임에서만 생성
- Validation:
  - `bun test -- --grep "vectors"`

### M5 — KNN 의사결정 엔진
- Deliverables:
  - `src/knn/engine.ts` — KNN 검색 (cosine/L2), top-k 결과 반환
  - `src/knn/time-decay.ts` — 시간 감쇠 가중치
  - `src/knn/decision.ts` — PASS/FAIL/SKIP 결정 (승률, 기대값, 샘플 수)
  - A-grade 시그널 부스트 로직
- Acceptance criteria:
  - pgvector HNSW 인덱스 활용 검색
  - 시간 감쇠 적용 (최근 데이터 가중)
  - CommonCode KNN 파라미터 (top_k 등) 참조
  - 결정 결과가 Signal.knn_decision에 기록
- Validation:
  - `bun test -- --grep "knn"`
  - 벡터 100개 이상에서 검색 성능 < 100ms 확인

## Task candidates
- T-05-000: docs/VECTOR_SPEC.md — 202차원 벡터 피처 사양 정의
- T-05-001: db/migrations/003 — TradeBlock, WatchSession, Signal, SignalDetail, Vector 테이블 마이그레이션
- T-05-002: filters/daily-direction.ts — 일간 방향 필터
- T-05-003: filters/trade-block.ts — 거래차단 관리자
- T-05-004: signals/watching.ts — 스퀴즈 브레이크아웃 감지
- T-05-005: signals/watching.ts — S/R 컨플루언스 감지
- T-05-006: signals/watching.ts — BB4 터치 감지 & WatchSession 생명주기
- T-05-007: signals/evidence-gate.ts — BB4 터치 Evidence Gate
- T-05-008: signals/evidence-gate.ts — Double-B vs One-B 분류
- T-05-009: signals/safety-gate.ts — Safety Gate (윅, 박스, 비정상 캔들)
- T-05-010: signals/noise-filter.ts — 1M 전용 노이즈 필터 (5M MA20 방향 vs 일봉 방향)
- T-05-011: vectors/vectorizer.ts — 202차원 벡터 생성 (VECTOR_SPEC.md 기반)
- T-05-012: vectors/normalizer.ts — Median/IQR 정규화
- T-05-013: knn/engine.ts — pgvector KNN 검색
- T-05-014: knn/time-decay.ts — 시간 감쇠 가중치
- T-05-015: knn/decision.ts — PASS/FAIL/SKIP 의사결정
- T-05-016: 시그널 파이프라인 E2E 통합 테스트

## Risks
- **202차원 벡터 정의**: 정확한 피처 구성이 PRD에 상세하지 않음. 백테스트 결과로 검증 필요. 가정: 기본 피처셋 정의 후 WFO에서 가중치 조정.
- **KNN 성능**: 100K+ 벡터에서 HNSW 검색 100ms 이내 보장 어려울 수 있음. 대안: ef_search 파라미터 튜닝.
- **S/R 컨플루언스 정의**: 지지/저항 레벨 계산 방법이 명시적이지 않음. Decision log에 기록 필요.

## Decision log
- 벡터 202차원 구성은 M0에서 docs/VECTOR_SPEC.md로 사전 확정 (M4 벡터라이저의 전제 조건)
- S/R 레벨은 최근 N개 피봇 포인트 기반으로 구현 (피봇 기간, 컨플루언스 기준은 VECTOR_SPEC과 함께 정의)
- KNN은 cosine 거리 기본, L2는 설정으로 전환 가능
- Transaction 테이블(TradeBlock, WatchSession, Signal, SignalDetail, Vector)은 이 에픽 마이그레이션에서 생성

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- (작업 전)

# EP-15 — PRD v2.0 코드 정렬

## Objective
PRD v2.0과 현재 코드 사이의 핵심 불일치를 해소한다. 벡터 파이프라인을 PRD §7.8 원본 구조(38봉×5 + 12전략 = 202차원)로 재작성하고, KNN 판정(§7.9), 신호 파이프라인(§7.7/§7.16), 이체(§7.20), 웹 UI(§7.23) 등 기존 코드의 PRD 갭을 수정한다.

舊 EP-15(벡터 정렬) + 舊 EP-17(코드 정합성) 통합.

## Scope
- `docs/VECTOR_SPEC.md` — PRD §7.8 기준 검증 + 전략 피처 수식 감사/갱신
- `src/vectors/` (L3) — 피처 추출, 정규화, 벡터 조립 재작성 + 기존 features.ts/vectorizer.ts 교체
- `src/knn/` (L4) — 가중 거리 개별 피처 가중치 + A급 분기 + 수수료 차감
- `src/config/` (L1) — FEATURE_WEIGHT 시드/스키마 (upperWick/lowerWick 신규 추가), KNN commission_pct/a_grade_min_samples
- `src/signals/` (L5) — 1M 노이즈 필터 (5M MA20 방향), 5M/1M 동시 신호 억제 로직
- `src/transfer/` (L7) — calculateTransferable() 수익 기반 전환, getDailyProfit() 신규
- `src/daemon/pipeline.ts` (L9) — A-grade 플래그 KNN 전달 수정, 동시 신호 억제
- `src/web/` (standalone) — 거래 내역 성과 요약
- `src/api/` (L8) — StatsResult 필드 추가 (expectancy, max_consecutive_losses)
- `tests/` — 관련 테스트 전면 수정
- `docs/decisions/` — Investing.com API ADR

## Non-goals
- KNN 알고리즘 자체 변경 (cosine/L2, top_k, threshold 등)
- pgvector 인덱스 구조 변경 (차원 수 202 유지)
- 백테스트 실행기 변경 (벡터 생성만 변경, 파이프라인 구조 유지)
- WFO 튜닝 로직 변경
- 런타임 KPI (EP-16 범위)
- 보안 강화 (EP-17 범위)
- 이체 실행기(executor) 변경 — CCXT transfer() 호출 로직 유지
- 이체 스케줄러 타이밍 변경 — UTC 00:30 유지
- Daily direction filter 변경 (§7.1/§7.2) — 신호 검증은 하되 방향 필터 로직은 변경하지 않음

## Prerequisites
- EP-05 (signal-pipeline) ✅
- EP-06 (position-management) ✅
- EP-08 (safety-net) ✅
- EP-10 (strategy-alignment) ✅
- EP-13 (backtest) ✅
- EP-14 (auto-transfer) ✅

## Milestone Dependency Graph
```
M1 → M2 → M3 → M4 → M5   (벡터 파이프라인, 순차)
M6a: M4 이후               (A-grade pipeline 연결이 M4에서 수정되므로)
M6b: M1 이후 독립 실행 가능 (이체 전환, 벡터/KNN과 무관)
M7: M4 + M6 이후            (commission_pct + 이체 seed 정리 필요)
```
> **변경 사항 (리뷰 반영)**: M6a가 M4에 의존. M4에서 makeDecision() 시그니처 변경 + pipeline.ts 호출부 수정이 이루어지므로, M6a의 동시 신호 억제 로직이 변경된 pipeline 기반 위에서 구현되어야 함. M6b는 이체 전용이므로 M1 이후 독립 실행 가능 유지.

## Milestones

### M1 — VECTOR_SPEC 검증 & 설정 시드 정렬 (PRD §7.8, §3.1, §3.2)
VECTOR_SPEC.md는 이미 PRD §7.8 기준으로 정렬됨. 이 마일스톤은 문서를 검증하고, **전략 피처 수식 충돌 4건을 감사·해소**하며, 설정 시드를 정렬한다.

- Deliverables:
  - `docs/VECTOR_SPEC.md` 검증 + 전략 피처 수식 감사:
    - `atr_separation`: VECTOR_SPEC "(bb20_upper - bb20_lower) / ATR14" vs 코드 "abs(close - sma20) / atr14" → PRD 원문 기준 결정
    - `rsi_extreme_count`: VECTOR_SPEC "recent 14 bars / 14" vs 코드 "last 20 bars / 20" → PRD 원문 기준 결정
    - `disparity_divergence`: VECTOR_SPEC "(close/MA20 - 1) - (RSI14/50 - 1)" vs 코드 "bb4_pct_b - bb20_pct_b" → PRD 원문 기준 결정
    - `breakout_intensity`: VECTOR_SPEC "|close - bb20_band| / (bb20_upper - bb20_lower)" vs 코드 "(close - bb20_upper) / atr14" → PRD 원문 기준 결정
    - 감사 결과를 VECTOR_SPEC.md에 반영
  - `src/config/seed.ts` — FEATURE_WEIGHT 시드 개별 피처 단위로 변경:
    - `upperWick: 1.5`, `lowerWick: 1.5` **신규 추가** (현재 FEATURE_WEIGHTS에 없음)
    - 기존 유지: `bb4_position: 2.0`, `pivot_distance: 1.5`, `daily_open_distance: 1.5`, `session_box_position: 1.5`
    - `default: 1.0` 추가
  - `src/config/schema.ts` — FEATURE_WEIGHT 스키마 수정 (새 키 수용)
  - ANCHOR normalization 값 확인: `{ method: "median_iqr", lookback: 60 }`
  - **pgvector 가중 거리 전략 결정**: pre-multiply (피처에 sqrt(weight) 곱해서 저장 → pgvector L2 = weighted L2) vs post-rerank (pgvector로 후보 검색 후 앱에서 재랭킹) → Decision log에 기록
- Acceptance criteria:
  - VECTOR_SPEC.md의 12 전략 피처 수식이 PRD 원문과 1:1 대응 (4건 충돌 해소됨)
  - FEATURE_WEIGHT 시드가 PRD §3.2와 일치 (upperWick/lowerWick 추가됨)
  - ANCHOR normalization이 PRD §3.1과 일치
  - pgvector 가중 거리 전략이 Decision log에 기록됨
  - 4건 전략 피처 수식 감사 결과가 각각 Decision log에 근거와 함께 기록됨
  - `bun run typecheck` 통과
- Validation:
  - `bun run typecheck`
  - VECTOR_SPEC.md vs PRD §7.8 수동 대조 (12 전략 피처 × 수식 1:1 매칭 확인)
  - Decision log에 4건 감사 결과 + pgvector 전략 = 5건 결정 기록 확인

### M2 — 피처 추출기: 캔들 190차원 + 전략 12차원 (PRD §7.8)
현재 `vectorizer.ts`(1175줄)의 6카테고리 구조(price_position/momentum/volatility/trend/time_series/strategy)를 PRD의 38봉 반복 구조로 전면 교체한다.

- Deliverables:
  - `src/vectors/candle-features.ts` — 38봉 × 5피처 추출기:
    - 입력: 최근 38개 닫힌 캔들 배열
    - 5피처/봉: body, upperWick, lowerWick, range, ret (수익률)
    - 출력 인덱스 0-189: 봉 순서 (bar[0]의 5피처, bar[1]의 5피처, ...)
    - Decimal.js 사용
  - `src/vectors/strategy-features.ts` — 12 전략 피처 추출기 (M1에서 감사된 수식 기반):
    - bb20_pos, bb4_pos, ma_ordering, ma20_slope, atr_separation, pivot_distance, rsi_normalized, rsi_extreme_count, breakout_intensity, disparity_divergence, daily_open_distance, session_box_position
  - **기존 모듈 호환 전환**: `src/vectors/features.ts`의 FEATURE_NAMES, FEATURE_CATEGORIES, VECTOR_DIM, FEATURE_WEIGHTS를 새 파일에서 호환 re-export (M3에서 제거)
  - `vectorize()` 함수 시그니처 유지: `(candles: Candle[], indicators: AllIndicators, timeframe) => Float32Array` — 내부 구현만 변경, backtest 등 호출자 수정 불필요
  - `tests/vectors/candle-features.test.ts`:
    - 38봉 정상 → 190차원 출력, 인덱스 0-189 봉 순서 검증
    - 캔들 부족 시 0.0 패딩
    - 가중치 적용 검증 (upperWick×1.5, lowerWick×1.5)
    - edge case: 도지(body=0), 마루보즈(wick=0)
  - `tests/vectors/strategy-features.test.ts`
- Acceptance criteria:
  - 38봉 × 5피처 = 190차원, 인덱스 0-189가 봉 순서 (category 순서 아님)
  - 12 전략 피처, 수식이 M1 감사 결과와 일치
  - 가중치 정확 적용 (1.5×, 2.0×)
  - 모든 값 Decimal.js 계산 후 toNumber()
  - 기존 import 경로(`@/vectors/features`, `@/vectors/vectorizer`)가 깨지지 않음
  - `bun run typecheck` 통과 (import 깨짐 없음)
- Validation:
  - `bun test -- --grep "candle-features|strategy-features"`
  - `bun run typecheck`

### M3 — 정규화 & 202차원 벡터 조립 (PRD §3.1)
- Deliverables:
  - `src/vectors/normalizer.ts` — PRD 정규화 사양 **검증** (현재 코드 이미 PRD 일치 확인됨):
    - ✅ Median/IQR 방식, lookback=60 (DEFAULT_LOOKBACK=60)
    - ✅ clamp(-3, 3) → [0, 1] 선형 변환 (CLAMP_MIN=-3, CLAMP_MAX=3)
    - ✅ IQR=0인 피처는 0.5 (CENTER=0.5)
    - 새 38봉 구조에서 정규화 정상 동작 확인 (입력 차원 변경 없음, 202 유지)
  - `src/vectors/vectorizer.ts` — 190 + 12 = 202차원 조립:
    - candle-features(190) + strategy-features(12) 결합
    - 정규화 적용, Float32Array 출력
  - **기존 호환 re-export 제거**: M2에서 유지한 features.ts 호환 export 제거, 모든 소비자 import 경로 업데이트, 구 features.ts 삭제
  - `tests/vectors/normalizer.test.ts`
  - `tests/vectors/vectorizer.test.ts` — 통합 테스트
- Acceptance criteria:
  - 최종 벡터: 202차원, 모든 값 [0, 1] 범위
  - lookback=60봉 롤링 Median/IQR 정확
  - clamp(-3, 3) → [0, 1] 변환 정확
  - 기존 features.ts 삭제 완료, 모든 import 정리됨
  - `bun run typecheck` 통과 (깨진 import 없음)
- Validation:
  - `bun test -- --grep "normalizer|vectorizer"`
  - `bun run typecheck`

### M4 — KNN 로직: 가중 거리 + A급 분기 + 수수료 (PRD §7.8, §7.9, §7.16)
현재 A-grade 로직에 **3중 단절**이 있다:
1. `evidence-gate.ts`가 1H BB4 터치 기반 `aGrade` 계산 ✅
2. `pipeline.ts:747`이 `evidence.aGrade`를 `makeDecision()`에 **전달하지 않음** ❌
3. `makeDecision()`이 자체적으로 `signalType === "DOUBLE_B"`로 aGrade 결정 (PRD와 불일치) ❌
4. aGrade가 SKIP/PASS/FAIL 임계값에 **영향 없음** ❌

이 마일스톤에서 3중 단절을 모두 해소한다.

- Deliverables:
  - `src/knn/engine.ts` — 개별 피처 가중치 적용:
    - M1에서 결정한 방식 (pre-multiply: sqrt(weight) 곱해서 저장 / post-rerank: 앱 코드에서 가중 거리 재계산)
    - 피처별 가중치 매핑: 인덱스 → 가중치
  - `src/knn/decision.ts` — **makeDecision() 시그니처 변경**:
    - **현재**: `makeDecision(neighbors, signalType, safetyPassed, config?)`
    - **변경**: `makeDecision(neighbors, isAGrade, config?)`
    - `isAGrade` 파라미터는 evidence gate에서 결정된 값을 그대로 수신 (내부 결정 로직 제거)
    - `signalType`/`safetyPassed` 파라미터 제거 — aGrade 결정은 evidence gate 책임
  - `src/knn/decision.ts` — **KnnDecisionConfig 확장**:
    - `aGradeMinSamples: number` 필드 추가 (기본값 20)
    - 기존 `aGradeWinrateThreshold` 유지 (기본값 0.50)
  - `src/knn/decision.ts` — A급 분기 로직:
    - `isAGrade=true`일 때: `minSamples=config.aGradeMinSamples(20)`, `winrateThreshold=config.aGradeWinrateThreshold(0.50)` 적용
    - `isAGrade=false`일 때: `minSamples=config.minSamples(30)`, `winrateThreshold=config.winrateThreshold(0.55)` 유지
  - `src/knn/decision.ts` — **loadKnnDecisionConfig() 확장**:
    - `KNN/a_grade_min_samples` CommonCode 로드 추가 (기본값 20)
  - `src/daemon/pipeline.ts:747` — **호출부 수정**:
    - **현재**: `deps.makeDecision(weightedNeighbors, evidence.signalType, safetyResult.passed)`
    - **변경**: `deps.makeDecision(weightedNeighbors, evidence.aGrade)`
    - KNN 결정 설정에 `aGradeMinSamples` 포함하여 전달
  - `src/knn/decision.ts` — 수수료 차감:
    - 현재 코드: `FEE_RATE = 0.0008`, 1회 차감 (0.08% total)
    - PRD §7.9: "commission 0.08% deducted" → **운영자 확인 후 결정** (Decision log 참조)
    - 수수료율을 CommonCode `KNN / commission_pct`에서 로드 (하드코딩 제거)
  - `src/config/seed.ts`:
    - `KNN / commission_pct` 시드 추가
    - `KNN / a_grade_min_samples: 20` 시드 추가
  - Tests 업데이트:
    - `makeDecision()` 호출부 전체 갱신 (시그니처 변경)
    - A-grade 분기 테스트: `isAGrade=true` → 완화된 임계값 적용 검증
    - A-grade 분기 테스트: `isAGrade=false` → 기본 임계값 적용 검증
    - `pipeline.test.ts` — evidence.aGrade 전달 검증
- Acceptance criteria:
  - KNN 거리 계산이 피처 가중치 반영
  - `makeDecision()` 시그니처가 `(neighbors, isAGrade, config?)` 형태
  - `isAGrade=true`일 때 `min_winrate=0.50`, `min_samples=20` 적용
  - `isAGrade=false`일 때 기존 기준 유지 (`min_winrate=0.55`, `min_samples=30`)
  - `pipeline.ts`에서 `evidence.aGrade`가 `makeDecision()`에 전달됨
  - `makeDecision()` 내부에 aGrade 자체 결정 로직(DOUBLE_B 체크) 없음
  - commission_pct, a_grade_min_samples가 CommonCode에서 로드
  - 수수료 차감 공식이 Decision log의 결정과 일치
- Validation:
  - `bun test -- --grep "knn|pipeline"`
  - `bun run typecheck`

### M5 — 벡터 무효화 + 재생성 + 백테스트 검증
- Deliverables:
  - DB 마이그레이션: vectors 테이블 truncate 또는 is_valid 플래그
  - `scripts/regenerate-vectors.ts` — 캔들 히스토리에서 벡터 재생성:
    - 벡터 임베딩 + **라벨(WIN/LOSS/TIME_EXIT) 복원** (Ticket.closed_at + symbol + exchange + timeframe 조인)
    - 매칭되는 Ticket이 없는 벡터(KNN SKIP 등): unlabeled로 표기, KNN 학습에서 제외
    - 배치 처리 (1000벡터/batch) + 진행률 표시
    - 예상 시간 측정: ~315K 벡터, 목표 < 30분
  - 백테스트 실행 검증: `bun run backtest` 스모크 테스트
  - **운영 절차 문서** (`scripts/README.md` 또는 inline 주석):
    1. 재생성 전: `execution_mode`를 `analysis`로 강제 전환 (재생성 중 KNN SKIP 방지)
    2. vectors 테이블 백업 (pg_dump --table=vectors)
    3. truncate + 재생성 스크립트 실행
    4. 재생성 완료 후 `bun run backtest` 검증
    5. expectancy > 0 확인 후 execution_mode 복원
- Acceptance criteria:
  - 기존(구조 불일치) 벡터가 KNN 검색에 사용되지 않음
  - 재생성 벡터에 라벨이 Ticket 기반으로 복원됨
  - 매칭 Ticket 없는 벡터는 unlabeled 처리됨
  - 재생성 스크립트가 시작 전 execution_mode 검증 (analysis 아니면 경고)
  - `bun run backtest` 정상 실행 + expectancy > 0
- Validation:
  - `bun run backtest`
  - `bun run typecheck && bun run lint`

### M6 — 신호 검증 + 이체 수익 기반 전환 (PRD §7.7, §7.16, §7.20)
두 독립 워크스트림을 포함 (6a/6b). 파일 교차 없어 병렬 실행 가능.

**6a — 신호 파이프라인 수정**
- Deliverables:
  - `src/signals/safety-gate.ts` — 1M 노이즈 필터 수정 (PRD §7.7):
    - 현재: 1M 캔들의 close vs **1M SMA20**으로 방향 판단 (`safety-gate.ts:207-218`)
    - PRD: **5M MA20 방향** ≠ 일봉 방향이면 PASS
    - 수정: `checkNoise1M()`이 5M MA20 기울기/위치를 참조하도록 변경
    - 5M 지표 데이터를 safety-gate에 전달하는 인터페이스 추가 필요
  - `src/daemon/pipeline.ts` — 5M/1M 동시 신호 억제 로직 **신규 구현** (PRD §7.16):
    - 동일 심볼에서 5M/1M 동시 신호 발생 시 1M 우선 실행, 5M 신호 억제
    - 구현: 파이프라인에서 timeframe 우선순위 비교 로직 추가
    - 참고: `backtest/engine.ts`에 이미 `TIMEFRAME_PRIORITY` 존재 → 코드 경로 동일성 위해 공통 모듈화 고려
  - `src/signals/evidence-gate.ts` — A급 플래그 **검증**:
    - ✅ 1H BB4 터치 감지 → `aGrade=true` 설정 (`evidence-gate.ts:140-148`) — 이미 정상 구현
    - ⚠️ 단, evidence gate의 aGrade가 KNN까지 전달되는지는 **M4에서 수정** (pipeline→makeDecision 호출부)
  - 관련 테스트 추가/수정
- Acceptance criteria:
  - 1M 진입 전 **5M MA20 방향** 검증 존재 (1M SMA20 아님)
  - `checkNoise1M()`이 5M 지표를 입력으로 받음
  - 5M/1M 동시 신호 시 1M만 실행, 5M 억제됨
  - evidence-gate의 `aGrade` 계산이 PRD §7.16 "1H BB4 터치" 조건과 일치 (검증 완료)

**6b — 이체 수익 기반 전환**
- Deliverables:
  - `src/transfer/balance.ts` — `calculateTransferable()` 수익 기반 재작성:
    - amount = max(0, dailyProfit) × transferPct / 100
    - amount < min_transfer_usdt → skip
    - balance - amount < margin + reserve → skip (안전장치)
    - reserve = max(balance × riskPct × reserveMultiplier, 50 USDT)
    - `TransferableParams` 타입 변경: `dailyProfit` 필드 추가 (breaking change)
  - `src/transfer/scheduler.ts` — `getDailyProfit()` **신규 함수** 구현:
    - `SUM(ticket.pnl) WHERE closed_at >= today UTC 00:00 AND exchange = ?`
    - getDailyProfit()을 calculateTransferable()에 연동
  - `src/transfer/executor.ts` — EventLog data에 `daily_profit` 필드 추가
  - `src/config/seed.ts` — TRANSFER 그룹 시드 정리
  - `tests/transfer/balance.test.ts` 전면 재작성 + `tests/transfer/scheduler.test.ts` 수정
  - `scripts/transfer-now.ts` — dry-run에 dailyProfit 표시
- Acceptance criteria:
  - 이체 = max(0, dailyProfit) × transferPct / 100
  - 안전장치: 이체 후 잔고 < margin + reserve → skip
  - 손실/무거래 날 → 이체 없음
  - EventLog에 daily_profit 기록
  - 모든 계산 Decimal.js

- Validation (combined):
  - `bun test -- --grep "noise-filter|simultaneous|signal-priority|calculateTransferable|transfer|getDailyProfit"`
  - `bun run typecheck && bun run lint`

### M7 — UI 성과 요약 + 정합성 마무리 (PRD §7.23)
- Deliverables:
  - `src/api/routes/stats.ts` — StatsResult에 `expectancy`, `max_consecutive_losses` 필드 추가
  - `src/web/` — 성과 요약 7개 카드:
    - 총 수익, 총 거래, 승률, **expectancy**, 평균 손익비, MDD, **최대 연속 손실**
    - expectancy는 수수료 차감 후 값 (M4의 commission_pct 사용)
  - `tests/core/types.test.ts` — CommonCodeGroup 수정:
    - `TRANSFER` 값 추가 (기존 테스트 버그 수정)
    - count assertion 12 → 13
  - `docs/decisions/ADR-004-economic-calendar-source.md` 작성:
    - 선택지: Investing.com API / 스크래핑 / 수동 입력 / 대안 API
    - 결정과 근거, fail-closed 정책 명시
  - `docs/PRODUCT.md` Open questions 해당 항목 업데이트
- Acceptance criteria:
  - API `/api/stats`가 `expectancy`, `max_consecutive_losses` 필드 반환
  - 거래 내역 페이지에 7개 성과 카드 표시
  - expectancy는 수수료 차감 후 값
  - CommonCodeGroup 테스트 13개 그룹 통과
  - ADR 작성 완료
- Validation:
  - `bun test -- --grep "trade-history|stats|CommonCodeGroup"`
  - `bun run build`
  - ADR 수동 검증

## Task candidates (16)
- T-15-001: VECTOR_SPEC.md 검증 + 전략 피처 수식 감사 4건 해소 + pgvector 가중 거리 결정 (M1)
- T-15-002: FEATURE_WEIGHT 시드 (upperWick/lowerWick 신규 추가) + ANCHOR 정규화 확인 + 스키마 갱신 (M1)
- T-15-003: 38봉×5 캔들 피처 추출기 + 기존 features.ts 호환 re-export (M2)
- T-15-004: 12 전략 피처 추출기 — 감사된 수식 기반 구현 (M2)
- T-15-005: normalizer.ts PRD 일치 검증 + 새 38봉 구조 대응 확인 (M3)
- T-15-006: 202차원 벡터 조립기 + 기존 features.ts 삭제 + import 정리 (M3)
- T-15-007: KNN 가중 거리 개별 피처 가중치 적용 (M4)
- T-15-008: makeDecision() 시그니처 변경 (isAGrade 파라미터) + A급 분기 임계값 + pipeline.ts 호출부 수정 (M4)
- T-15-008b: KNN 수수료 차감 CommonCode화 (commission_pct, a_grade_min_samples 시드) (M4)
- T-15-009: 벡터 무효화 마이그레이션 + 재생성 스크립트 (라벨 복원, 배치 처리, 운영 절차) (M5)
- T-15-010: 백테스트 벡터 파이프라인 통합 검증 + expectancy 확인 (M5)
- T-15-011: 1M 노이즈 필터 수정 (5M MA20 방향) + 동시 신호 억제 로직 구현 (M6a)
- T-15-012: calculateTransferable() 수익 기반 재작성 + getDailyProfit() 신규 구현 (M6b)
- T-15-013: 이체 E2E 테스트 재작성 + TRANSFER seed 정리 + dry-run 갱신 (M6b)
- T-15-014: 성과 API (expectancy, max_consecutive_losses) + UI 7개 카드 (M7)
- T-15-015: CommonCodeGroup 테스트 수정 + ADR-004 경제지표 소스 결정 (M7)

## Risks (13)
1. **기존 벡터 전량 무효화**: 6카테고리→38봉 구조 변경으로 ~315K 벡터 재사용 불가. **완화**: 재생성 스크립트(배치 1000, 목표 <30분), 시간 측정.
2. **38봉 warmup 기간**: 벡터 생성에 최소 38개 닫힌 캔들 필요. **완화**: 캔들 부족 시 0.0 패딩, 20% 이상 패딩 벡터는 KNN 학습 제외.
3. **정규화 윈도우 전환**: WFO in-sample → lookback=60 롤링으로 변경 시 정규화 통계 변동. **완화**: 백테스트 비교. (단, normalizer.ts는 이미 PRD 일치 — lookback=60, clamp(-3,3)→[0,1])
4. **전략 피처 수식 충돌 4건**: VECTOR_SPEC.md와 현재 코드의 수식이 다름. **완화**: M1에서 PRD 원문 기준 감사, 운영자 확인 후 확정.
5. **기존 KNN 테스트 깨짐**: A급 분기, 수수료 변경, makeDecision() 시그니처 변경 시 assertion 실패. **완화**: PRD 기준으로 assertion 전면 업데이트. makeDecision 호출부 전수 검색 후 갱신.
6. **이체 테스트 대량 변경**: EP-14 balance.test.ts 잉여 잔고 기반 → 수익 기반 전면 재작성. **완화**: M6b에서 전면 재작성.
7. **당일 PnL UTC 경계**: Ticket.closed_at 기준 UTC 날짜 경계 실수 가능. **완화**: UTC 00:00 기준 명확 정의 + 타임존 테스트.
8. **pgvector HNSW 가중 거리 비호환**: pgvector의 native `<=>` / `<->` 연산자가 피처별 가중치 미지원. **완화**: M1에서 pre-multiply(sqrt(weight) 곱해서 저장 → L2 in stored space = weighted L2 in feature space) vs post-rerank 결정. pre-multiply 시 가중치 변경 = 전체 벡터 재생성 필요.
9. **벡터 재생성 시 라벨 누락**: 임베딩만 재생성하면 KNN 라벨 없이 동작 불가. **완화**: 재생성 스크립트가 Ticket 데이터에서 label 조인 복원. 매칭 Ticket 없는 벡터(SKIP 등)는 unlabeled 처리, KNN 학습 제외.
10. **import 그래프 일시 깨짐**: features.ts 교체 시 FEATURE_NAMES, VECTOR_DIM 등을 소비하는 전체 codebase import 실패. **완화**: M2에서 호환 re-export 유지 → M3에서 정리하는 2단계 전환.
11. **재생성 중 KNN 무응답**: 벡터 truncate 후 재생성 완료 전 데몬이 벡터 쿼리하면 모든 신호 SKIP. **완화**: 재생성 전 execution_mode=analysis 강제 전환, 재생성 스크립트 시작 시 현재 mode 검증. 완료 후 백테스트 통과 확인 후 mode 복원.
12. **새 벡터 구조에서 기존 라벨 유의미성**: 6카테고리 파생 피처→38봉 원시 피처 구조 변경 후, 과거 라벨(WIN/LOSS)이 새 벡터 공간에서 동일한 KNN 유사도 의미를 가지는지 불확실. **완화**: 재생성 후 백테스트로 expectancy > 0 검증. 미달 시 WFO 재실행 필요 (EP-13 범위).
13. **A-grade 로직 다중 파일 변경**: evidence-gate→pipeline→decision 3개 파일에 걸친 데이터 흐름 수정. M4에서 makeDecision 시그니처를 변경하면 pipeline.ts 호출부, 테스트 파일, backtest 코드의 모든 호출 지점이 깨짐. **완화**: M4에서 makeDecision 호출부를 전수 검색(grep "makeDecision") 후 일괄 갱신. 시그니처 변경 + 호출부 수정을 하나의 태스크(T-15-008)로 묶어 원자적 변경.

## Decision log
- **舊 EP-15 + EP-17 통합 (2026-04-05)**: 두 에픽 모두 "PRD v2.0 vs 코드 갭"에서 발생. KNN 모듈이 양쪽에서 수정되므로 단일 에픽으로 통합하여 충돌 방지.
- **VECTOR_SPEC.md 상태**: 이미 PRD §7.8 기준 정렬됨(2026-04-05). M1은 "재작성"이 아닌 "검증 + 전략 피처 수식 감사".
- **PRD 원본 벡터 구조**: 6카테고리 파생 피처 구조를 폐기하고 PRD의 38봉×5 + 12전략 구조로 복원. PRD가 source of truth.
- **vectorize() 시그니처 유지**: `(candles, indicators, timeframe) => Float32Array` 서명 불변. 내부 구현만 변경하여 backtest 등 호출자 수정 최소화. 단, 호출자가 38개 이상 캔들을 전달하도록 보장해야 함.
- **정규화 이미 PRD 일치 확인 (2026-04-05 코드 검증)**: `normalizer.ts`가 이미 Median/IQR, lookback=60 (DEFAULT_LOOKBACK=60), clamp(-3,3)→[0,1] (CLAMP_MIN=-3, CLAMP_MAX=3), IQR=0→0.5 (CENTER=0.5) 구현됨. M3에서 추가 수정 불필요, 새 38봉 구조 대응 검증만 수행.
- **FEATURE_WEIGHT 개별화**: PRD §3.2 개별 피처 가중치 적용. 현재 FEATURE_WEIGHTS에는 `bb4_position:2.0, pivot_distance:1.5, daily_open_distance:1.5, session_box_position:1.5` 4개만 존재. `upperWick:1.5`, `lowerWick:1.5` **신규 추가** 필요 (기존에 wick_ratio 키 없음 — "분리"가 아닌 "추가").
- **pgvector 가중 거리**: M1에서 결정 (pre-multiply 유력). pre-multiply 시 벡터 저장 전 sqrt(weight) 곱함 → pgvector L2 distance = weighted L2 in original space. 장점: pgvector HNSW 인덱스 그대로 사용. 단점: 가중치 변경 시 전체 벡터 재생성.
- **[T-15-001 완료] D-001 atr_separation 수식 확정 (2026-04-05)**: `(bb20_upper − bb20_lower) / ATR14` 채택. features.ts의 `(bb4_upper - bb4_lower) / atr14`는 내부 밴드 참조로 의미론적 부정확. BB20이 전략 외곽 밴드이므로 BB20 폭을 ATR로 나누는 것이 피처 의도와 일치.
- **[T-15-001 완료] D-002 rsi_extreme_count 수식 확정 (2026-04-05)**: `count(RSI > 70 or RSI < 30) in recent 14 bars / 14` 채택. features.ts의 5봉 윈도우(0~5, 비정규화)는 RSI14 계산 기간과 불일치하고 정규화 범위도 다름. 14봉 윈도우가 RSI14와 일관성 있으며, /14 정규화로 [0,1] 범위 확보.
- **[T-15-001 완료] D-003 breakout_intensity 수식 확정 (2026-04-05)**: `|close − bb20_band| / (bb20_upper − bb20_lower), band 밖이면 양수` 채택. features.ts의 ATR 정규화 방식은 절대 변동성 단위. BB20 밴드 폭 정규화는 현재 밴드 상태 대비 상대적 돌파 강도를 측정하여 피처명의 의도("돌파 강도")와 일치.
- **[T-15-001 완료] D-004 disparity_divergence 수식 확정 (2026-04-05)**: `(close/MA20 − 1) − (RSI14/50 − 1)` 채택. features.ts의 `bb4_pct_b - bb20_pct_b`는 내외 밴드 위치 차이(band_divergence에 더 적합). 피처명 `disparity`(가격/MA 이격) + `divergence`(가격 이격 vs RSI 이격 차이)의 합성 의미와 일치하며, PRD "격(다이버전스)" 요소가 rsi 피처들과 함께 이 피처를 포함함.
- **[T-15-001 완료] D-005 pgvector 가중 거리 전략 확정 (2026-04-05)**: **Pre-multiply 채택**. `vectorize()` 출력 시 각 피처 값에 `sqrt(weight)` 곱한 후 저장. 수학적 근거: `||sqrt(w)·x − sqrt(w)·y||² = Σ w_i(x_i−y_i)²` (저장 공간의 L2 = 원본 공간의 가중 L2). HNSW 인덱스 완전 호환, 구현 단순. 트레이드오프: WFO 가중치 변경 시 전체 벡터 재생성 필요 (M5 재생성 스크립트로 처리).
- **2단계 import 전환**: M2에서 features.ts 호환 re-export 유지 → M3에서 모든 소비자 업데이트 후 구 파일 삭제.
- **commission_pct 해석 (미확정)**: PRD §7.9 "commission 0.08% deducted" — 현재 코드는 FEE_RATE=0.0008 1회 차감(0.08% total). 크립토 선물에서 0.08%/side (round-trip 0.16%)가 관례. **M4 구현 전 운영자에게 확인 필요**: (a) 0.08% total, (b) 0.08%/side × 2 = 0.16% total. CommonCode에 저장할 값도 해석에 따라 다름.
- **A-grade 로직 3중 단절 발견 (2026-04-05 코드 검증)**: evidence-gate.ts:140-148이 1H BB4 터치 기반 aGrade를 정상 계산하나, (1) pipeline.ts:747이 evidence.aGrade를 makeDecision에 전달하지 않음, (2) makeDecision이 자체적으로 `signalType === "DOUBLE_B"`로 aGrade 결정 (PRD는 1H BB4 터치), (3) aGrade가 SKIP/PASS/FAIL 임계값에 영향 없음. M4에서 3중 단절 모두 해소: makeDecision 시그니처 변경 + pipeline 호출부 수정 + 분기 임계값 적용.
- **A급 min_samples 분기**: 현재 코드에 단일 minSamples(30), a_grade_winrate_threshold(0.50)는 이미 CommonCode 로드됨. A급 시 별도 분기: `a_grade_min_samples=20` CommonCode 추가 + loadKnnDecisionConfig() 확장.
- **검증 우선, 구현은 필요 시만**: M6a의 1H BB4 A급 플래그는 evidence-gate에서 이미 구현됨 (검증 완료). 단, 1M 노이즈 필터(5M MA20 방향)와 동시 신호 억제는 신규 구현 확인됨.
- **이체 수익 기반 전환**: 잉여 잔고 → dailyProfit 기반 (PRD §7.20). getDailyProfit() 신규 구현 필요. TransferableParams 타입 breaking change.
- **MIN_RESERVE_USDT = 50 상수화**: 안전 하한선 변경 불가 정책.

## PRD 요구사항 커버리지 검증

| PRD 절 | 요구사항 | 마일스톤 | 상태 |
|--------|---------|---------|------|
| §7.8 | 38봉×5 + 12전략 = 202차원 벡터 | M1-M3 | ✅ M1 감사 완료 (T-15-001): 수식 4건 확정(D-001~D-004), pgvector 전략 결정(D-005). vectorizer.ts 전면 교체는 M2-M3 |
| §3.1 | Median/IQR, lookback=60, clamp(-3,3)→[0,1] | M3 | ✅ normalizer.ts 이미 PRD 일치 (코드 검증 완료), 새 구조 대응 확인만 |
| §3.2 | 개별 FEATURE_WEIGHT (bb4_pos×2.0, upperWick×1.5 등) | M1 | upperWick/lowerWick 신규 추가 (기존에 없음) — T-15-002에서 구현 |
| §7.9 | A급: winrate→50%, samples→20, commission 0.08% | M4 | makeDecision 시그니처 변경 + pipeline 호출부 수정 + commission 해석 운영자 확인 필요 |
| §7.16 A급 | 1H BB4 터치 → A급 가중치 | M4+M6a | evidence-gate ✅ 구현됨, pipeline→KNN 전달 ❌ M4에서 수정 |
| §7.16 동시 | 5M/1M 동시 신호: 1M 우선 | M6a | 신규 구현 |
| §7.7 | 1M 노이즈 필터: 5M MA20 방향 ≠ daily → PASS | M6a | 현재 1M SMA20 사용 → 5M MA20으로 수정 |
| §7.20 | 이체: dailyProfit × transferPct / 100 | M6b | calculateTransferable() 재작성 + getDailyProfit() 신규 |
| §7.23 | 거래 내역 7개 성과 카드 | M7 | API 필드 2개 추가 + UI 카드 |

## Consensus Log
- Round 1: Planner drafted initial plan (EP-15 + EP-17 통합, 6 마일스톤)
- Round 2: Architect **REVISE** — M4/M5 과부하, 의존성 순서 미명시, pgvector 가중 거리 호환성·라벨 복원·import 깨짐 리스크 3건 추가 요청
- Round 3: Critic **REVISE** — VECTOR_SPEC 이미 정렬됨(M1 재프레이밍), 전략 피처 수식 충돌 4건, commission 해석 모호, 1M 노이즈 필터가 5M MA20 아닌 1M SMA20 사용, 동시 신호 억제 미구현, getDailyProfit() 미존재
- Round 4: Planner revised — Architect+Critic 피드백 전량 반영, 7 마일스톤으로 재구조화, PRD 커버리지 교차검증 테이블 추가
- Verdict: consensus reached (Round 4)
- **Round 5 (PRD 교차 검증 리뷰, 2026-04-05)**: 코드 실사 기반 리뷰 — 13건 수정 반영:
  - **(Critical)** A-grade 3중 단절 발견: evidence.aGrade→pipeline→makeDecision 연결 없음. M4 전면 재구조화 (makeDecision 시그니처 변경 + pipeline 호출부 수정)
  - **(High)** M1 wick_ratio "분리" → "신규 추가" 정정 (FEATURE_WEIGHTS에 wick_ratio 부재 확인)
  - **(High)** M6b calculateTransfer() → calculateTransferable() 함수명 정정
  - **(Medium)** normalizer.ts 이미 PRD 일치 확인 (clamp [-5,+5]→[-3,+3] Decision log 오류 정정)
  - **(Medium)** M5 운영 절차 추가 (execution_mode 강제, 백업, 검증)
  - **(Medium)** Risk 3건 추가 (R11: 재생성 중 KNN 무응답, R12: 라벨 유의미성, R13: A-grade 다중 파일 변경)
  - M1 validation 강화 (4건 감사 결과 검증 기준)
  - M6a "검증만" → evidence-gate ✅ + pipeline→KNN 전달은 M4에서 수정 명시
  - M6a→M4 의존성 추가 (Milestone Dependency Graph 갱신)
  - Task candidates T-15-008 상세화 + T-15-008b 분리 (16개)
  - PRD 커버리지 테이블 §7.16 A급/동시 분리, §3.1 ✅ 상태 갱신
- **Verdict**: Round 5 리뷰 반영 완료

## Progress notes
- 2026-04-05: 舊 EP-15(벡터 정렬) + 舊 EP-17(코드 정합성) 통합 에픽 작성. 3라운드 consensus (Architect + Critic) 완료.
- 2026-04-05: PRD v2.0 교차 검증 리뷰 (Round 5). 코드 실사 기반으로 13건 수정 반영. 주요 발견: A-grade 3중 단절 (evidence→pipeline→decision), normalizer 이미 PRD 일치, wick_ratio/calculateTransfer 문서 오류. M4 전면 재구조화, Risk 3건 추가, Task 1건 추가 (16개).
- 2026-04-05: **T-15-001 완료** (VECTOR_SPEC 감사). 전략 피처 수식 충돌 4건 PRD 의도 기준 확정: D-001 atr_separation(BB20 폭/ATR), D-002 rsi_extreme_count(14봉/14), D-003 breakout_intensity(밴드 폭 정규화), D-004 disparity_divergence(가격 이격 vs RSI 이격). D-005 pgvector pre-multiply 채택. VECTOR_SPEC.md Formula Audit Notes 섹션 + pgvector Weighted Distance Strategy 섹션 추가.
- 2026-04-05: 태스크 생성 완료. `docs/tasks/backlog/`에 15개 태스크 파일 생성 (T-15-001 ~ T-15-015). 16개 후보 중 T-15-008b를 T-15-009에 흡수 (commission + a_grade_min_samples 시드를 하나로). EP-15→task 매핑:
  - M1: T-15-001 (VECTOR_SPEC 감사), T-15-002 (seed/schema)
  - M2: T-15-003 (candle features), T-15-004 (strategy features)
  - M3: T-15-005 (normalizer verify), T-15-006 (vectorizer assembly)
  - M4: T-15-007 (weighted distance), T-15-008 (A-grade pipeline), T-15-009 (commission)
  - M5: T-15-010 (vector regeneration), T-15-011 (backtest verify)
  - M6a: T-15-012 (noise filter + simultaneous)
  - M6b: T-15-013 (transfer profit-based)
  - M7: T-15-014 (stats API + UI), T-15-015 (CommonCode test + ADR)
- 2026-04-05: **T-15-011 완료** (백테스트 벡터 파이프라인 검증 — 정적 검증 모드).
  - `bun run typecheck` PASS — null-safe 타입 수정 2건 (`candle-features.ts`, `strategy-features.ts`)
  - `bun run lint` PASS — biome auto-fix 28파일 + 수동 수정 2건 (candle-features null-guard, PerformanceSummary biome-ignore)
  - `bun test` PASS — 2776/2776 (7개 실패 수정: KNN seed count 2→4, FEATURE_WEIGHT seed count 2→7, candle-schema Date→ISO string)
  - `bun run backtest` 명령 존재 확인 (`package.json`: `bun src/backtest/cli.ts`)
  - **실제 실행 및 expectancy > 0 판정**: PENDING — 프로덕션 DB에서 `scripts/regenerate-vectors.ts` 실행 후 수행 필요. WFO 재실행 필요 여부는 이후 판단.

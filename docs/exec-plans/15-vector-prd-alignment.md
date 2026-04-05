# 15-vector-prd-alignment

## Objective
VECTOR_SPEC.md와 벡터 파이프라인 코드를 PRD v2.0 §7.8 사양에 정렬한다. 현재 6카테고리 파생 피처 구조(price_position 40 + momentum 30 + volatility 30 + trend 40 + time_series 50 + time_session 12)를 PRD 원본 구조(38봉×5 캔들 190차원 + 12 전략 차원)로 재구성한다. 정규화 파라미터와 FEATURE_WEIGHT 체계도 PRD에 맞춘다.

## Scope
- `docs/VECTOR_SPEC.md` — PRD §7.8 기준 전면 재작성
- `src/vectors/` — 피처 추출, 정규화, 벡터 조립 코드 재작성
- `src/config/seed.ts` — FEATURE_WEIGHT 시드 (카테고리→개별 피처), ANCHOR normalization 값 확인
- `src/config/schema.ts` — FEATURE_WEIGHT 스키마 수정
- `src/knn/` — 가중 거리 계산에서 개별 피처 가중치 적용
- `tests/vectors/` — 벡터 관련 테스트 전면 수정
- `tests/knn/` — KNN 가중치 테스트 수정

## Non-goals
- KNN 알고리즘 자체 변경 (cosine/L2, top_k, threshold 등)
- pgvector 인덱스 구조 변경 (차원 수 202 유지)
- 백테스트 실행기 변경 (벡터 생성만 변경, 파이프라인 구조 유지)
- WFO 튜닝 로직 변경

## Prerequisites
- EP-13 (backtest) 완료 ✅
- EP-14 (transfer)와 독립 — transfer는 벡터와 무관

## Milestones

### M1 — VECTOR_SPEC.md 재작성 & 설정 시드 정렬
- Deliverables:
  - `docs/VECTOR_SPEC.md` PRD §7.8 기준 전면 재작성:
    - 캔들 190차원: 38봉 × 5피처 (body, upperWick×1.5, lowerWick×1.5, range, ret)
    - 전략 12차원: bb20_pos, bb4_pos(×2.0), ma_ordering, ma20_slope, atr_separation, pivot_distance(×1.5), rsi_normalized, rsi_extreme_count, breakout_intensity, disparity_divergence, daily_open_distance(×1.5), session_box_position(×1.5)
    - 정규화: Median/IQR, lookback=60봉, clamp(-3,3) → [0,1]
  - `src/config/seed.ts` — FEATURE_WEIGHT 시드를 개별 피처 단위로 변경:
    - `bb4_position: 2.0`, `upperWick: 1.5`, `lowerWick: 1.5`
    - `daily_open_distance: 1.5`, `session_box_position: 1.5`, `pivot_distance: 1.5`
    - `default: 1.0`
  - `src/config/schema.ts` — FEATURE_WEIGHT 스키마 수정
  - ANCHOR `normalization` 값: `{ method: "median_iqr", lookback: 60 }` 확인
- Acceptance criteria:
  - VECTOR_SPEC.md가 PRD §7.8과 1:1 대응
  - FEATURE_WEIGHT 시드가 PRD §3.2와 일치
  - ANCHOR normalization이 PRD §3.1과 일치
  - `bun run typecheck` 통과
- Validation:
  - `bun run typecheck`
  - PRD §7.8 / §3.1 / §3.2와 수동 대조

### M2 — 캔들 190차원 피처 추출기
- Deliverables:
  - `src/vectors/candle-features.ts` — 38봉 × 5피처 추출기 (기존 features.ts 대체):
    - 입력: 최근 38개 닫힌 캔들 배열
    - 5피처/봉: body, upperWick, lowerWick, range, ret (수익률)
    - upperWick, lowerWick에 ×1.5 가중치 적용 (PRD §7.8)
    - Decimal.js 사용
  - `tests/vectors/candle-features.test.ts` — 단위 테스트:
    - 38봉 정상 입력 → 190차원 출력 검증
    - 캔들 부족 시 (warmup) 0.0 패딩
    - 가중치(1.5×) 적용 검증
    - edge case: 도지 캔들(body=0), 마루보즈(wick=0)
- Acceptance criteria:
  - 38봉 × 5피처 = 190차원 Float32Array 출력
  - upperWick/lowerWick에 1.5× 가중치 정확 적용
  - 모든 값 Decimal.js 계산 후 toNumber() 변환
- Validation:
  - `bun test -- --grep "candle-features"`

### M3 — 전략 12차원 피처 추출기
- Deliverables:
  - `src/vectors/strategy-features.ts` — 12 전략 피처 추출기:
    - bb20_pos: BB20 내 위치 (0~1)
    - bb4_pos: BB4 내 위치 (×2.0 가중치)
    - ma_ordering: MA20/60/120 정렬 상태 (-1/0/1)
    - ma20_slope: MA20 기울기
    - atr_separation: ATR 기반 밴드 이격도
    - pivot_distance: 피봇 거리 (×1.5)
    - rsi_normalized: RSI14 정규화
    - rsi_extreme_count: RSI 극값 카운트
    - breakout_intensity: 돌파 강도
    - disparity_divergence: 이격 다이버전스
    - daily_open_distance: 일봉 시가 거리 (×1.5)
    - session_box_position: 세션 박스 위치 (×1.5)
  - `tests/vectors/strategy-features.test.ts` — 단위 테스트
- Acceptance criteria:
  - 12차원 Float32Array 출력
  - 가중치 적용: bb4_pos(×2.0), pivot_distance(×1.5), daily_open_distance(×1.5), session_box_position(×1.5)
  - AllIndicators 입력에서 모든 값 계산 가능
- Validation:
  - `bun test -- --grep "strategy-features"`

### M4 — 정규화 & 벡터 조립
- Deliverables:
  - `src/vectors/normalizer.ts` — PRD 정규화 사양:
    - Median/IQR 방식
    - lookback=60봉 롤링 윈도우
    - clamp(-3, 3) 후 → [0, 1] 선형 변환
    - IQR=0인 피처는 0.5 (중앙값)
  - `src/vectors/vectorizer.ts` — 190 + 12 = 202차원 조립:
    - candle-features(190) + strategy-features(12) 결합
    - 정규화 적용
    - Float32Array 출력
  - `tests/vectors/normalizer.test.ts` — 정규화 테스트
  - `tests/vectors/vectorizer.test.ts` — 통합 테스트
- Acceptance criteria:
  - 최종 벡터: 202차원, 모든 값 [0, 1] 범위
  - lookback=60봉 롤링 윈도우로 median/IQR 계산
  - clamp(-3, 3) → [0, 1] 변환 정확
  - 기존 벡터 관련 import 경로가 정리됨
- Validation:
  - `bun test -- --grep "normalizer|vectorizer"`
  - `bun run typecheck`

### M5 — KNN 가중 거리 & 기존 벡터 무효화
- Deliverables:
  - `src/knn/` — 가중 거리 계산 수정:
    - 개별 피처 가중치(FEATURE_WEIGHT)를 거리 계산에 적용
    - 피처별 가중치 매핑: 인덱스 → 가중치
  - 기존 벡터 데이터 무효화 전략:
    - DB 마이그레이션: vectors 테이블 truncate 또는 is_valid 플래그
    - 벡터 재생성: 캔들 히스토리에서 재계산 스크립트
  - 백테스트 검증: 새 벡터 구조로 백테스트 실행 확인
- Acceptance criteria:
  - KNN 거리 계산이 개별 피처 가중치를 반영
  - 기존(구조 불일치) 벡터가 KNN 검색에 사용되지 않음
  - `bun run backtest` 정상 실행
- Validation:
  - `bun test -- --grep "knn"`
  - `bun run backtest` (스모크 테스트)
  - `bun run typecheck && bun run lint`

## Task candidates
- T-15-001: VECTOR_SPEC.md 재작성 + FEATURE_WEIGHT/ANCHOR 시드 정렬 (M1)
- T-15-002: 38봉×5 캔들 피처 추출기 구현 (M2)
- T-15-003: 12 전략 피처 추출기 구현 (M3)
- T-15-004: Median/IQR 정규화 (lookback=60, clamp→[0,1]) (M4)
- T-15-005: 202차원 벡터 조립기 (M4)
- T-15-006: KNN 가중 거리 개별 피처 가중치 적용 (M5)
- T-15-007: 기존 벡터 무효화 마이그레이션 + 재생성 스크립트 (M5)
- T-15-008: 백테스트 벡터 파이프라인 통합 검증 (M5)

## Risks
- **기존 벡터 데이터 전량 무효화**: 구조가 근본적으로 다르므로 기존 202차원 벡터를 재사용할 수 없음. **완화**: 캔들 히스토리에서 벡터를 재생성하는 스크립트 제공. 3년치 5M 데이터 ~315K 벡터 재생성 시간 측정 필요.
- **38봉 warmup 기간**: 벡터 생성에 최소 38개 닫힌 캔들 필요. **완화**: 캔들 부족 시 0.0 패딩, 20% 이상 패딩 벡터는 KNN 학습 제외 (기존 정책 유지).
- **정규화 윈도우 전환**: WFO in-sample → lookback=60 롤링으로 변경 시 정규화 통계가 달라짐. **완화**: 백테스트로 성능 비교 후 확정.
- **전략 12차원 구체 정의 부재**: PRD가 피처명만 나열하고 수식을 제공하지 않음 (예: `breakout_intensity`, `disparity_divergence`). **완화**: M3에서 김직선 매매법 맥락에 맞게 수식 정의 후 PRD 작성자(병화)와 확인.

## Decision log
- **PRD 원본 구조 복원**: 6카테고리 파생 피처 구조를 폐기하고 PRD의 38봉×5 + 12전략 구조로 복원. 이유: PRD가 source of truth이며, 김직선 매매법의 캔들 패턴 인식에 원시 캔들 데이터가 더 직접적.
- **정규화 PRD 값 적용**: clamp 범위 [-5,+5] → [-3,+3], [0,1] 변환 추가, lookback WFO→60봉 롤링. PRD ANCHOR 값 준수.
- **FEATURE_WEIGHT 개별화**: 카테고리별 가중치를 폐기하고 PRD §3.2의 개별 피처 가중치로 복원.

## Consensus Log
- (계획 단계)

## Progress notes
- 2026-04-05: 에픽 계획 작성. PRD vs docs 차이 분석 결과 벡터 구조가 가장 큰 괴리로 확인.

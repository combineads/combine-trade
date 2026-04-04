# 12-strategy-verification-fix

## Objective
2026-04-04 전략 검증(PRD vs 코드, 155개 항목)에서 발견된 잔여 불일치(⚠️ 9건)와 미구현(❌ 17건) 중 EP-10에서 완료되지 않은 핵심 항목을 수정한다. 백테스트/WFO(EP-13) 이전에 전략 정합성을 100% 달성하는 것이 목표이다.

## Scope
- `src/signals/safety-gate.ts` — 역추세 조건 누락 수정, 금지3 avg_range_5 공식 교정
- `src/signals/evidence-gate.ts` — SL 버퍼 공식 교정 (ATR×0.5 → 꼬리길이×15%)
- `src/daemon/pipeline.ts` — 1H BB4 지표 주입 (A급 신호 활성화)
- `src/vectors/vectorizer.ts` — 전략 피처 12개 extraction 구현 (indices 190-201)
- `src/exits/checker.ts` — TP2 청산 비율 교정 (remaining/3 → remaining/2)
- `src/knn/decision.ts` — min_samples 기본값 교정 (20 → 30)
- `src/daemon/crash-recovery.ts` — WatchSession 명시적 복원

## Non-goals
- 백테스트/WFO 실행 코드 (EP-13)
- 웹 UI / API 엔드포인트 (EP-11)
- 새로운 전략 피처 추가 (기존 PRD 명세 이행만)
- 캔들 피처 구조 변경 (카테고리형 분산 → 38봉×5 행렬 전환 불필요 — 개별 공식은 이미 정확)

## Prerequisites
- EP-01~EP-11 전체 완료 ✅
- EP-10 (strategy-alignment) 완료 — 이 에픽은 EP-10에서 미처리된 잔여 항목

## Background
EP-10 완료 후 전략 검증을 재실행한 결과, 155개 항목 중 129개 ✅(83%), 9개 ⚠️(6%), 17개 ❌(11%)로 집계되었다.

❌ 17건 중 12건은 전략 피처 벡터화(T-10-006 후속), 4건은 EP-13(백테스트/WFO) 범위, 1건은 1H BB4 A급 신호이다.
⚠️ 9건은 Safety Gate 역추세 조건(2), SL 공식(1), TP2 비율(1), min_samples(1), WatchSession 복구(1), 캔들 구조(1), WFO 파라미터(2)이다.

이 에픽에서 처리하는 항목 (라이브 매매에 직접 영향):
- ❌ 전략 피처 12개 벡터화 (12건)
- ❌ 1H BB4 A급 신호 (1건)
- ⚠️ Safety Gate 역추세 조건 (2건)
- ⚠️ SL 버퍼 공식 (1건)
- ⚠️ TP2 청산 비율 (1건)
- ⚠️ KNN min_samples (1건)
- ⚠️ WatchSession 크래시 복구 (1건)

EP-13(백테스트/WFO) 범위로 이관: ❌ 4건, ⚠️ 2건

## Milestones

### M1 — 신호 파이프라인 수정
Safety Gate와 Evidence Gate의 PRD 불일치를 교정한다.

- Deliverables:
  - `src/signals/safety-gate.ts`:
    - 금지1 (wick ratio): direction 파라미터 추가, 역추세일 때만 차단 / 순추세는 bypass
    - 금지3 (큰 캔들): ATR14 → 최근 5봉 평균 range(`avg_range_5`) 교정 + 역추세 조건 추가
  - `src/signals/evidence-gate.ts`:
    - `calcSlPrice()` 교정: ATR×0.5 → 꼬리 바깥 + 꼬리길이×15% 버퍼
    - LONG: SL = low - (min(open,close) - low) × 0.15
    - SHORT: SL = high + (high - max(open,close)) × 0.15
  - `src/daemon/pipeline.ts`:
    - 5M/1M processEntry() 시 1H BB4 지표 계산 → `indicators.bb4_1h`에 주입
    - A급 신호(a_grade)가 실제 1H BB4 터치 반영
- Acceptance criteria:
  - Safety Gate 금지1: 순추세 캔들은 wick ratio와 무관하게 통과
  - Safety Gate 금지3: avg_range_5 × 2.0 기준, 역추세만 차단
  - SL = 꼬리 바깥 + 꼬리길이 × 15% 버퍼
  - 1H BB4 터치 시 a_grade=true 설정
- Validation:
  - `bun test -- tests/signals/ tests/daemon/`
  - `bun run typecheck && bun run lint`

### M2 — 전략 피처 벡터화
features.ts에 정의된 12개 전략 피처의 extraction 로직을 vectorizer.ts에 구현한다.

- Deliverables:
  - `src/vectors/vectorizer.ts` — extractStrategyFeatures() 함수 추가:
    - bb20_position: (close-BB20_lower)/BB20_width, weight 1.0
    - bb4_position: (open-BB4_lower)/BB4_width, weight 2.0
    - ma_ordering: (MA20>MA60?1:0 + MA60>MA120?1:0)/2, weight 1.0
    - ma20_slope: (MA20[현재]-MA20[3봉전])/MA20[3봉전], weight 1.0
    - atr_separation: abs(close-MA20)/ATR14, weight 1.0
    - pivot_distance: (close-nearest high/low 20봉)/ATR14, weight 1.5
    - rsi_normalized: (RSI14-50)/50, weight 1.0
    - rsi_extreme_count: 20봉 중 RSI<30 or >70 수/20, weight 1.0
    - breakout_intensity: (close-highest(H,20))/close 또는 하방, weight 1.0
    - disparity_divergence: price_slope(10봉)-disp_slope(10봉), weight 1.0
    - daily_open_distance: (close-daily_open)/daily_open, weight 1.5
    - session_box_position: (close-session_low)/(session_high-session_low), weight 1.5
  - indices 190-201이 실제 값으로 채워짐 (기존 0/빈 상태 해소)
  - 정규화 파이프라인 통과 확인 (Median/IQR, lookback=60, clamp, [0,1])
- Acceptance criteria:
  - 202차원 벡터에서 indices 190-201이 유의미한 값 반환
  - 각 피처의 가중치가 PRD 명세와 일치
  - NaN/Infinity → 0.5, 분모 0 방어 처리
  - 미래 참조 없음 (현재 봉 + 과거 봉만 사용)
- Validation:
  - `bun test -- tests/vectors/`
  - `bun run typecheck && bun run lint`

### M3 — 포지션 관리 & 안전장치 교정

- Deliverables:
  - `src/exits/checker.ts`:
    - TP2_CLOSE_DIVISOR: 3 → 2 (잔여의 50% = 총량의 25% 청산)
  - `src/knn/decision.ts`:
    - DEFAULT_MIN_SAMPLES: 20 → 30
  - `src/daemon/crash-recovery.ts`:
    - recoverFromCrash()에 WatchSession 복원 로직 추가
    - 활성 WatchSession 조회 → 유효성 검증 → 무효 시 invalidate
- Acceptance criteria:
  - TP2 도달 시 잔여의 50% 청산, 나머지 50% 트레일링
  - KNN 최소 샘플 수 30개
  - 크래시 복구 시 WatchSession 상태가 명시적으로 검증됨
  - EventLog에 WatchSession 복원/무효화 기록
- Validation:
  - `bun test -- tests/exits/ tests/knn/ tests/daemon/`
  - `bun run typecheck && bun run lint`

## Task candidates
- T-12-001: safety-gate.ts — 금지1 역추세 조건 추가 (direction 기반 bypass) [M1]
- T-12-002: safety-gate.ts — 금지3 avg_range_5 교정 + 역추세 조건 [M1]
- T-12-003: evidence-gate.ts — SL 버퍼 공식 교정 (꼬리길이×15%) [M1]
- T-12-004: pipeline.ts — 1H BB4 지표 주입 → A급 신호 활성화 [M1]
- T-12-005: vectorizer.ts — 전략 피처 12개 extraction 구현 (Part 1: bb20/bb4/ma) [M2]
- T-12-006: vectorizer.ts — 전략 피처 12개 extraction 구현 (Part 2: rsi/pivot/breakout) [M2]
- T-12-007: vectorizer.ts — 전략 피처 12개 extraction 구현 (Part 3: disparity/daily/session) [M2]
- T-12-008: checker.ts — TP2 청산 비율 교정 (DIVISOR 3→2) [M3]
- T-12-009: decision.ts — min_samples 기본값 30으로 변경 [M3]
- T-12-010: crash-recovery.ts — WatchSession 명시적 복원 + EventLog [M3]
- T-12-011: 전략 검증 재실행 E2E (155개 항목 재검증) [E2E]

## Risks
- **벡터 하위 호환성**: 전략 피처 추가로 기존 벡터 무효화. **완화**: EP-10에서 이미 TRUNCATE 결정. 운영 전이므로 영향 없음.
- **SL 공식 변경 영향**: ATR 기반 → 꼬리 기반으로 SL 폭 변화. **완화**: analysis 모드에서 관찰 후 live 전환.
- **Safety Gate 완화 영향**: 순추세 bypass로 진입 빈도 증가 가능. **완화**: 이미 KNN에서 2차 필터링.
- **TP2 비율 변경**: 잔여/3 → 잔여/2로 더 많이 청산. **완화**: 트레일링 잔량 감소하지만 수익 확정 증가.
- **1H BB4 계산 오버헤드**: 5M/1M 진입마다 1H 지표 계산 추가. **완화**: 1H 캔들은 이미 캐싱되어 있으므로 I/O 증가 미미.

## Decision log
- EP-10 잔여 항목을 별도 에픽으로 분리 — EP-10은 이미 완료(아카이빙됨) 상태이므로 재오픈하지 않음
- 전략 피처 벡터화는 3개 태스크로 분할 (4+4+4) — 단일 태스크로 12개 피처 구현은 범위 초과
- 캔들 피처 구조(38봉×5 vs 카테고리 분산)는 변경하지 않음 — 개별 공식이 정확하므로 구조 변경은 불필요한 리스크
- TP2 비율은 PRD 명세(잔여의 50% = 총량 25%)를 따름 — "잔여의 절반"이 명시적

## Consensus Log
- (계획 단계 — 전략 검증 결과 기반 후속 에픽)

## Progress notes
- 2026-04-04: 전략 검증 155개 항목 실행 → 129✅ / 9⚠️ / 17❌ 확인
- 2026-04-04: EP-12 신규 생성, 기존 EP-12(backtest-wfo)→EP-13, EP-13(auto-transfer)→EP-14로 번호 이동

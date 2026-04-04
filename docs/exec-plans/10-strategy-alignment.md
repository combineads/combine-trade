# 10-strategy-alignment

## Objective
전략 검증(PRD vs 코드)에서 발견된 불일치와 에픽 사각지대를 보완한다. EP-05/09 범위에 포함되지만 세부 스펙이 부족한 항목과, 어떤 에픽에도 배정되지 않은 항목을 이 에픽에서 일괄 처리한다.

## Scope
- 신호/벡터/KNN 파라미터 교정 (EP-05 스펙 보충)
- 안전장치 누락 항목 보완 (FSM 가드, Slack 연결, FOR UPDATE)
- 리스크 관리 사각지대 (수수료, 계좌 합산, spread 사전 체크)

## Non-goals
- 백테스트/WFO 실행 코드 (EP-13)
- ANCHOR 수정 금지 API (EP-11)
- 웹 UI / API 엔드포인트 (EP-11)

## Prerequisites
- EP-01~EP-09 전체 완료 ✅
  - EP-05: signals, vectors, knn (교정 대상 코드)
  - EP-06~EP-08: positions, orders, limits, reconciliation, notifications (보완 대상 코드)
  - EP-09: daemon pipeline (daily_bias 교차 검증 위치)

## Background
2026-04-04 전략 검증 결과, 155개 항목 중 34개 ⚠️(불일치) + 27개 ❌(미구현)이 발견되었다.
대부분은 기존 에픽에서 보완되지만, 아래 항목들은 에픽 사각지대이거나 세부 스펙이 부족하여 별도 에픽으로 관리한다.

## Milestones

### M1 — 신호 파이프라인 교정
기존 코드의 파라미터/공식을 PRD와 일치시킨다. 새 기능 추가 없이 기존 코드 수정만.

- Deliverables:
  - `src/core/constants.ts` — BB4 source `"close"` → `"open"` 변경
  - `src/indicators/bollinger.ts` — source 파라미터 지원 (`open` | `close`)
  - `src/filters/daily-direction.ts` — 등호 허용 (`>` → `>=`, `<` → `<=`)
  - `src/signals/evidence-gate.ts` — ONE_B 시 해당 TF MA20 방향 일치 검증 추가 + A급 신호(a_grade) 1H BB4 터치 연동
  - `src/signals/safety-gate.ts`:
    - wick_ratio 임계값 TF별 분리 (5M=0.1, 1M=1.0)
    - 박스권 기준 MA20 midpoint + range_20×0.15로 변경
    - 비정상 캔들 배수 3.0x → 2.0x
  - `src/signals/watching.ts`:
    - 스퀴즈 돌파(A) wick_ratio < 0.5 체크 추가
    - S/R 겹침(B) ATR14×0.3 거리 기반 검증
    - NEUTRAL 전환 해제 조건 명시
    - tp1/tp2 1H close마다 갱신 로직
- Acceptance criteria:
  - BB4 source=open 기반으로 Evidence Gate 동작
  - 일봉 필터에서 slope=0 시 기존 방향 유지
  - ONE_B + MA20 방향 불일치 → PASS 반환
  - Safety Gate 임계값이 PRD 수치와 일치
  - WatchSession A/B/C 조건이 PRD와 일치
  - a_grade가 1H BB4 터치 상태 반영
- Validation:
  - `bun test -- tests/signals/ tests/filters/ tests/indicators/`
  - `bun run typecheck && bun run lint`

### M2 — 벡터/KNN 교정
벡터 피처 공식과 KNN 파라미터를 PRD와 일치시킨다.

- Deliverables:
  - `docs/specs/VECTOR_SPEC.md` + `src/vectors/features.ts` — PRD 기반 전략 피처 12개 교체:
    - bb20_position, bb4_position, ma_ordering, ma20_slope,
      atr_separation, pivot_distance, rsi_normalized, rsi_extreme_count,
      breakout_intensity, disparity_divergence, daily_open_distance, session_box_position
    - 각 피처 가중치: PRD 명세 (bb4_position 2.0, pivot/daily_open/session_box 1.5, 나머지 1.0)
  - `src/vectors/vectorizer.ts` — 캔들 피처 분모 교정:
    - body: /close → /open
    - upperWick: /atr14 → /H, 가중치 1.5
    - lowerWick: /atr14 → /H, 가중치 1.5
    - range: /close → /L
  - `src/vectors/normalizer.ts`:
    - lookback=60봉 윈도우 적용
    - clamp(-3, 3) 추가
    - [0,1] 출력 스케일링
    - NaN/Infinity → 0.5 (기존 0.0에서 변경)
    - BB width=0 → 0.5
  - `src/knn/decision.ts`:
    - net_expectancy에 수수료 0.08% 차감 반영
    - A급 신호 임계값: min_winrate 65% → 50%, min_samples → 20
  - `src/knn/time-decay.ts`:
    - 지수 감쇠 → 3단계 이산 감쇠 (1개월 1.0, 1~3개월 0.7, 3개월+ 0.2)
- Acceptance criteria:
  - 202차원 벡터: 190 캔들(38봉×5) + 12 전략 피처
  - 정규화: Median/IQR, lookback=60, clamp(-3,3), [0,1]
  - KNN expectancy에 수수료 반영
  - Time Decay 3단계 이산값 적용
  - VECTOR_SPEC.md에 모든 피처 공식/가중치 문서화
- Validation:
  - `bun test -- tests/vectors/ tests/knn/`
  - `bun run typecheck && bun run lint`

### M3 — 안전장치 & 리스크 보완
에픽 사각지대에 있던 안전장치/리스크 항목을 구현한다.

- Deliverables:
  - `src/positions/fsm.ts` — SymbolState FSM 전이 가드 추가:
    - SYMBOL_STATE_TRANSITION_MAP 정의
    - validateSymbolStateTransition() 순수 함수
    - IDLE → HAS_POSITION 직접 전이 차단
  - `src/orders/executor.ts` — spread 사전 체크 (주문 **전** bid/ask 스프레드 검증):
    - 주문 전 spread > max_spread_pct → ABORT
    - EventLog SLIPPAGE_ABORT 기록
    - **참고**: 기존 `checkSlippage()`는 주문 **후** 체결가 vs 기대가 검증 — 다른 시점의 체크
  - `src/limits/loss-limit.ts` — 계좌 수준 일일 손실 합산:
    - checkAccountDailyLimit(): 전 심볼×거래소 losses_today SUM 쿼리
    - balance × max_daily_loss_pct 초과 시 전체 중단
  - `src/reconciliation/worker.ts` — FOR UPDATE 잠금 + Panic Close Slack 연결:
    - SymbolState 조회 시 SELECT ... FOR UPDATE 적용
    - Panic Close 시 sendSlackAlert() 호출 연결
  - `src/daemon/pipeline.ts` — daily_bias 교차 검증:
    - KNN PASS 후 결과 방향이 daily_bias와 불일치 시 SKIP
    - **참고**: L9(daemon)에서 수행 — L4(knn)에서 L5(positions) 접근은 레이어 규칙 위반이므로
- Acceptance criteria:
  - SymbolState FSM 전이가 앱 레벨에서 검증됨
  - Spread 사전 체크 후 ABORT 시 EventLog 기록
  - 계좌 전체 일일 손실 합산으로 중단 판단
  - Reconciliation에서 FOR UPDATE 잠금 사용
  - Panic Close 시 Slack 알림 실제 발송
  - KNN 방향 ≠ daily_bias → pipeline에서 SKIP
- Validation:
  - `bun test -- tests/positions/ tests/orders/ tests/limits/ tests/reconciliation/ tests/daemon/`
  - `bun run typecheck && bun run lint`

## Task candidates → Generated tasks mapping
- T-10-001: constants.ts + bollinger.ts — BB4 source=open 지원 [M1]
- T-10-002: daily-direction.ts — 등호 허용 (>= / <=) [M1]
- T-10-003: evidence-gate.ts — ONE_B MA20 방향 검증 + A급 신호 연동 [M1]
- T-10-004: safety-gate.ts — 임계값 교정 (wick_ratio TF분리, 박스권 MA20, 배수 2.0) [M1]
- T-10-005: watching.ts — 스퀴즈 wick_ratio, S/R ATR거리, NEUTRAL 해제, tp1/tp2 갱신 [M1]
- T-10-006: features.ts + VECTOR_SPEC.md — 전략 피처 12개 교체 + 공식 문서화 [M2]
- T-10-007: vectorizer.ts — 캔들 피처 분모 교정 [M2]
- T-10-008: normalizer.ts — lookback/clamp/[0,1]/NaN 기본값 교정 [M2]
- T-10-009: decision.ts — 수수료 차감, A급 임계값 50%/20 [M2]
- T-10-010: time-decay.ts — 3단계 이산 감쇠 (1.0/0.7/0.2) [M2]
- T-10-011: fsm.ts — SymbolState FSM 전이 가드 [M3]
- T-10-012: executor.ts — spread 사전 체크 (주문 전 bid/ask) + EventLog [M3]
- T-10-013: loss-limit.ts — 계좌 수준 일일 손실 합산 쿼리 [M3]
- T-10-014: reconciliation/worker.ts — FOR UPDATE 잠금 + Panic Close Slack 연결 [M3]
- T-10-015: 전략 교정 통합 테스트 (E2E 검증) [E2E]

## Risks
- **벡터 하위 호환성**: 피처 공식 변경 시 기존 벡터 DB와 호환 불가. **완화**: 운영 전이므로 기존 벡터 TRUNCATE (빈 DB). 프로덕션 전환 후에는 벡터 버전 관리 또는 label=null 리셋.
- **KNN 성능 변화**: Time Decay와 임계값 변경으로 기존 대비 진입 빈도 변화. **완화**: 변경 전후 백테스트 비교 (EP-13 완료 후).
- **Safety Gate 임계값 변경 영향**: 필터가 더 엄격/느슨해져 진입 패턴 변화. **완화**: analysis 모드에서 충분히 관찰 후 live 전환.
- **BB4 source=open 영향**: 기존 close 기반 BB4와 다른 밴드 산출. **완화**: 변경 후 1H/5M/1M 각 TF 비교 확인.

## Decision log
- 이 에픽은 새 기능 추가가 아닌 **PRD 정합성 교정** — 기존 코드를 PRD 명세에 맞춤
- EP-05 VECTOR_SPEC.md가 부실했던 것이 근본 원인 — M2에서 문서부터 확정 후 코드 교정
- 벡터 피처 변경은 기존 DB 데이터 무효화를 수반하므로, EP-13(백테스트) 이전에 완료 필수. 현재 운영 전이므로 TRUNCATE로 충분
- SymbolState FSM은 Ticket FSM과 동일한 패턴(TRANSITION_MAP + 순수 함수)으로 구현
- 계좌 수준 일일 한도는 단일 SUM 쿼리로 구현 (복잡한 집계 불필요)
- daily_bias 교차 검증은 knn/decision.ts(L4)가 아닌 daemon/pipeline.ts(L9)에서 수행 — L4→L5 레이어 위반 방지
- T-10-006 VECTOR_SPEC.md 문서를 T-10-006 features.ts에 흡수 — 코드+문서 동시 작성이 자연스러움
- spread 사전 체크(T-10-012)는 주문 **전** bid/ask 검증, 기존 checkSlippage()는 주문 **후** 체결가 검증 — 별개 로직

## Consensus Log
- (계획 단계 — 전략 검증 결과 기반 신규 에픽)

## Progress notes
- 2026-04-04: 에픽 리뷰 완료. Critical 3건 수정: (1) 16→15 태스크 (VECTOR_SPEC.md를 features.ts에 흡수), (2) daily_bias 검증을 knn(L4)→pipeline(L9)으로 이동 (레이어 규칙), (3) 벡터 무효화 방안 명시 (운영 전 TRUNCATE). Important 5건 수정: Prerequisites/Non-goals 갱신(EP-09 완료), spread vs slippage 구분 명시, evidence-gate 중복 제거, validation 구체화, FOR UPDATE+Slack 표기.
- 2026-04-04: 태스크 생성 완료 (15개). 의존성: M1(T-10-001~005) 대부분 독립, T-10-003→T-10-001. M2(T-10-006~010) T-10-007→T-10-006. M3(T-10-011~014) 전부 독립. E2E(T-10-015) 전체 의존. Wave 1에 독립 태스크 12개 → WIP=2로 6 사이클.

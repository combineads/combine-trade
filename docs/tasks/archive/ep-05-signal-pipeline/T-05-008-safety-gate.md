# T-05-008 Safety Gate — 윅 비율, 박스 범위, 비정상 캔들, 1M 노이즈 필터

## Goal
`src/signals/safety-gate.ts`에 Evidence Gate를 통과한 시그널에 대해 안전성 필터를 적용하고, Signal.safety_passed와 SignalDetail에 결과를 기록하는 로직을 구현한다.

## Why
모든 BB4 터치가 유효한 진입은 아니다. 윅이 과도한 캔들, 세션 박스 중심에서 벗어난 위치, 비정상적 크기의 캔들은 위험 시그널이다. Safety Gate가 이를 필터링하여 품질 높은 시그널만 KNN으로 전달한다.

## Inputs
- `docs/PRODUCT.md` — Safety Gate 규칙 (윅 비율, 박스 범위 중심, 비정상 캔들, 1M 노이즈)
- `src/signals/evidence-gate.ts` — EvidenceResult (T-05-007에서 생성)
- `src/core/types.ts` — Signal, SignalDetail, DailyBias
- `src/db/schema.ts` — signalTable, signalDetailTable

## Dependencies
- T-05-007 (Evidence Gate — Signal 레코드 생성 후 Safety Gate 적용)

## Expected Outputs
- `src/signals/safety-gate.ts` exports:
  - `checkSafety(candle, indicators, signal, symbolState) → SafetyResult`
  - SafetyResult: { passed: boolean; reasons: string[] }
  - `updateSignalSafety(db, signalId, safetyResult) → void`

## Deliverables
- `src/signals/safety-gate.ts`

## Constraints
- Safety Gate 필터 조건 (모두 통과해야 safety_passed=true):
  1. **윅 비율**: 캔들 전체 범위 대비 윅 비율 ≤ 임계값 (LONG: 하방윅/전체범위, SHORT: 상방윅/전체범위)
  2. **박스 범위 중심**: 진입가가 세션 박스(session_box_high/low) 중심 부근인지 확인
  3. **비정상 캔들**: 캔들 크기가 최근 N봉 평균의 3배 초과 → 필터
  4. **1M 노이즈 필터** (1M 타임프레임 전용): 5M MA20 방향이 일봉 방향과 불일치 시 → PASS (PRD 7.7 — 노이즈라 판단하여 통과시키지 않음)
- 실패 사유를 reasons 배열에 수집하고 SignalDetail에 safety_reject_reason으로 기록
- safety_passed=false여도 Signal 레코드는 유지 (기록/분석용)
- 임계값은 CommonCode에서 조회 (하드코딩 금지). 초기값: 윅비율 0.6, 박스범위 0.3, 비정상배수 3.0
- Decimal.js로 모든 계산

## Steps
1. PRODUCT.md에서 Safety Gate 규칙 확인
2. 각 필터 조건의 순수 판정 함수 작성
3. checkSafety 통합 함수 (모든 조건 평가, 실패 사유 수집)
4. updateSignalSafety DB 업데이트 함수 (Signal.safety_passed + SignalDetail 기록)
5. 1M 노이즈 필터 조건 추가
6. signals/index.ts barrel export 업데이트
7. 단위 테스트 (각 필터 조건 독립 테스트)
8. DB 통합 테스트

## Acceptance Criteria
- 윅 비율 초과 시 → safety_passed=false, reason 포함
- 박스 범위 벗어남 시 → safety_passed=false
- 비정상 캔들 시 → safety_passed=false
- 1M 타임프레임 + 5M MA20≠일봉 방향 → safety_passed=false (노이즈)
- 모든 조건 통과 시 → safety_passed=true, reasons=[]
- SignalDetail에 safety_reject_reason 기록
- CommonCode에서 임계값 조회 (fail-safe: 기본값 사용)

## Test Scenarios
- checkSafety() with 윅 비율 0.7 (임계값 0.6 초과) → passed=false, reason 포함 'wick_ratio_exceeded'
- checkSafety() with 윅 비율 0.3 → 이 조건은 통과
- checkSafety() with 진입가가 세션 박스 범위 밖 → passed=false, reason 포함 'outside_box_range'
- checkSafety() with 캔들 크기가 평균의 4배 → passed=false, reason 포함 'abnormal_candle'
- checkSafety() with 1M + 5M MA20↓ + daily_bias=LONG_ONLY → passed=false, reason 포함 'noise_1m'
- checkSafety() with 5M 타임프레임 → 1M 노이즈 필터 스킵
- checkSafety() with 모든 조건 통과 → passed=true, reasons=[]
- [DB] updateSignalSafety(passed=false) → Signal.safety_passed=false, SignalDetail에 reason 기록
- [DB] updateSignalSafety(passed=true) → Signal.safety_passed=true

## Validation
```bash
bun test -- --grep "safety-gate"
bun run typecheck
bun run lint
```

## Out of Scope
- KNN 결정 (T-05-013)
- 벡터 생성 (T-05-009)
- CommonCode 시드 데이터 — EP-01에서 처리. Safety Gate 임계값은 이미 SLIPPAGE/SYMBOL_CONFIG 그룹에 매핑 가능. 없을 시 하드코딩 기본값 사용.

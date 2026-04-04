# T-05-007 Evidence Gate — BB4 터치 감지 + Double-B/One-B 분류 + Signal 생성

## Goal
`src/signals/evidence-gate.ts`에 5M/1M 캔들에서 BB4 터치를 감지하고, Double-B vs One-B를 분류하며, Signal + SignalDetail 레코드를 DB에 생성하는 로직을 구현한다.

## Why
Evidence Gate는 시그널 파이프라인의 핵심 판단 지점. WATCHING 상태에서 5M/1M 타임프레임의 BB4 터치가 발생하면 잠재적 진입 시그널을 생성한다. Double-B(BB4+BB20 동시 터치)는 One-B보다 높은 확신도를 가진다.

## Inputs
- `docs/PRODUCT.md` — Evidence Gate 규칙 (BB4 터치, Double-B/One-B, 5M/1M 우선순위)
- `docs/DATA_MODEL.md` — Signal, SignalDetail 엔티티
- `src/db/schema.ts` — signalTable, signalDetailTable (T-05-002에서 생성)
- `src/signals/watching.ts` — getActiveWatchSession (T-05-006에서 생성)
- `src/indicators/` — calcBB4, calcBB20
- `src/core/types.ts` — Signal, SignalDetail, SignalType, Direction

## Dependencies
- T-05-002 (Signal, SignalDetail 테이블)
- T-05-006 (WATCHING 감지기 — getActiveWatchSession API)

## Expected Outputs
- `src/signals/evidence-gate.ts` exports:
  - `checkEvidence(candle, indicators, watchSession) → EvidenceResult | null`
  - `createSignal(db, evidence, watchSession) → Signal` (Signal + SignalDetail DB 생성)
- EvidenceResult 타입: { signalType, direction, entryPrice, slPrice, details: Record<string, Decimal|string> }

## Deliverables
- `src/signals/evidence-gate.ts`

## Constraints
- BB4 터치 감지:
  - LONG: candle.low <= BB4 lower (현재 봉의 저가가 BB4 하단 이하)
  - SHORT: candle.high >= BB4 upper (현재 봉의 고가가 BB4 상단 이상)
- Double-B 분류:
  - BB4 + BB20 **동시** 터치 (같은 캔들에서 두 밴드 모두 터치)
  - 2연속 캔들이 아닌 **같은 캔들**에서 동시 발생
- WATCHING 상태에서만 시그널 생성: watchSession이 null이면 → null 반환
- direction은 watchSession.direction과 일치해야 함
- entry_price = candle.close (현재 캔들 마감가)
- sl_price:
  - LONG: candle.low - ATR × 0.5 (또는 BB4 lower에서 스프레드 만큼)
  - SHORT: candle.high + ATR × 0.5
- Signal 생성 시 knn_decision = null, a_grade = false (KNN 단계에서 업데이트)
- SignalDetail에 관측값 기록: bb4_touch_price, daily_bias, detection_type 등
- 5M/1M 동시 시그널 시 1M 우선 (PRD 7.16) — 이 로직은 데몬 오케스트레이션이나, Evidence Gate는 개별 시그널 생성만 담당
- Decimal.js로 모든 가격 비교/계산
- DB 통합 테스트: Signal + SignalDetail 생성/조회 검증

## Steps
1. PRODUCT.md에서 Evidence Gate 규칙 상세 확인
2. BB4 터치 감지 순수 함수 작성
3. Double-B vs One-B 분류 로직 작성
4. SL 가격 계산 로직 작성
5. createSignal DB 생성 함수 작성 (Signal + SignalDetail 트랜잭션)
6. signals/index.ts barrel export 업데이트
7. 단위 테스트 (BB4 터치, Double-B/One-B 분류)
8. DB 통합 테스트 (Signal + SignalDetail 생성)

## Acceptance Criteria
- BB4 터치 감지 정확 (LONG: low ≤ lower, SHORT: high ≥ upper)
- Double-B: 같은 캔들에서 BB4 + BB20 동시 터치 → DOUBLE_B
- 한쪽 밴드만 터치 → ONE_B
- watchSession 없으면 → null
- Signal 생성 시 knn_decision = null, a_grade = false
- SignalDetail에 관측값 기록됨
- Decimal.js 정밀도 유지
- DB 통합 테스트 통과

## Test Scenarios
- checkEvidence() with LONG + low ≤ BB4 lower only → ONE_B, LONG
- checkEvidence() with LONG + low ≤ BB4 lower AND low ≤ BB20 lower → DOUBLE_B, LONG
- checkEvidence() with SHORT + high ≥ BB4 upper only → ONE_B, SHORT
- checkEvidence() with SHORT + high ≥ BB4 upper AND high ≥ BB20 upper → DOUBLE_B, SHORT
- checkEvidence() with no BB4 touch → null
- checkEvidence() with no watchSession → null
- checkEvidence() with watchSession.direction mismatch → null
- [DB] createSignal() → Signal 레코드 생성, knn_decision=null, a_grade=false
- [DB] createSignal() → SignalDetail에 bb4_touch_price, daily_bias 등 기록됨
- [DB] createSignal() → Signal.watch_session_id가 올바르게 설정됨

## Validation
```bash
bun test -- --grep "evidence-gate"
bun run typecheck
bun run lint
```

## Out of Scope
- Safety Gate (T-05-008)
- KNN 결정 (T-05-013)
- 5M/1M 우선순위 처리 (데몬 오케스트레이션 — EP-09)

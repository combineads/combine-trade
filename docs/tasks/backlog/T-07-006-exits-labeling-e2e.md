# T-07-006 청산 → 라벨링 E2E 통합 테스트

## Goal
청산 조건 검사 → 부분 청산 실행 → 트레일링 → 라벨링까지 전체 플로우를 E2E 통합 테스트로 검증한다.

## Why
개별 모듈 단위 테스트로는 모듈 간 통합 정합성을 보장할 수 없다. EP-05/06 E2E 패턴을 따라 실제 DB + mock exchange adapter로 전체 흐름을 검증한다.

## Inputs
- `src/exits/checker.ts` (T-07-001)
- `src/exits/trailing.ts` (T-07-002)
- `src/exits/manager.ts` (T-07-003)
- `src/labeling/engine.ts` (T-07-005)
- `src/positions/ticket-manager.ts` (EP-06)
- `src/orders/executor.ts` (EP-06)
- `tests/helpers/test-db.ts` — DB 테스트 인프라

## Dependencies
- T-07-003 (exit manager)
- T-07-005 (labeling engine)

## Expected Outputs
- `tests/exits/exits-labeling-e2e.test.ts` — 5+ E2E 시나리오

## Deliverables
- `tests/exits/exits-labeling-e2e.test.ts`

## Constraints
- 실제 PostgreSQL DB (mock DB 금지)
- ExchangeAdapter는 mock
- 각 시나리오 독립적 (테스트 간 상태 공유 없음)
- EP-06 E2E 패턴 따르기

## Steps
1. Mock ExchangeAdapter 생성
2. 테스트 데이터 시드: Symbol, SymbolState(HAS_POSITION), Ticket(INITIAL), Signal, Vector, CommonCode, WatchSession
3. 시나리오별 테스트 작성
4. DB 상태 검증

## Acceptance Criteria
- 5개 이상 E2E 시나리오 통과
- TP1 → TP2 → CLOSED 전체 라이프사이클 검증
- 라벨링 후 Vector.label/grade 정확
- 트레일링 SL 이동 검증
- TIME_EXIT 전량 청산 검증

## Test Scenarios
- TP1 → TP2 → trailing close 전체 플로우: Ticket INITIAL → TP1_HIT(50%청산+SL본절) → TP2_HIT(25%청산) → trailing stop hit → CLOSED(WIN) → Vector label=WIN, grade=A
- TIME_EXIT 플로우: Ticket INITIAL, 60시간 경과 → TIME_EXIT → CLOSED → Vector label=TIME_EXIT
- SL hit 플로우 (TP 미달성): Ticket INITIAL → SL 도달 → CLOSED(LOSS) → Vector label=LOSS, grade=B
- 트레일링 SL 유리 방향 이동: LONG TP1_HIT → 가격 상승 → trailing SL 상향 → 가격 하락 → trailing SL 유지 (하향 금지)
- 피라미딩 후 독립 청산: 1차 TP1_HIT → 2차 진입 → 1차/2차 각각 독립 청산 → 각각 라벨링
- TP 가격 동적 갱신: 1H close 시 tp1=MA20, tp2=BB20 갱신 확인
- MFE/MAE 정확성: 포지션 기간 중 max_favorable, max_adverse 올바르게 추적

## Validation
```bash
bun test -- --grep "exits-labeling-e2e"
bun run typecheck
bun run lint
```

## Out of Scope
- 실제 거래소 연동
- 데몬 오케스트레이션 (EP-09)
- 대조 (EP-08)

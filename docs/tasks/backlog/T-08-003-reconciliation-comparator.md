# T-08-003 대조 비교 순수 함수

## Goal
거래소 포지션과 DB 티켓을 비교하여 매칭/불일치/고아를 분류하는 순수 함수를 구현한다.

## Why
대조 로직은 백테스트에서도 재사용 가능해야 한다. 순수 함수로 구현하면 DB/exchange 없이 단위 테스트가 빠르고, 백테스트 시뮬레이션에서 동일 로직을 사용할 수 있다.

## Inputs
- `src/core/ports.ts` — ExchangePosition 타입 (symbol, exchange, side, size, entryPrice)
- `src/core/types.ts` — Direction, Exchange
- `src/core/decimal.ts` — Decimal.js
- `docs/ARCHITECTURE.md` — reconciliation L7, 대조 정책

## Dependencies
- 없음 (순수 함수, EP-01 core만 사용)

## Expected Outputs
- `src/reconciliation/comparator.ts` — comparePositions(), ReconciliationResult 타입
- worker(T-08-004)가 이 함수를 호출

## Deliverables
- `src/reconciliation/comparator.ts`
- `tests/reconciliation/comparator.test.ts`
- `src/reconciliation/index.ts` barrel export 업데이트

## Constraints
- **순수 함수 — DB import 절대 금지**
- ExchangePosition과 Ticket을 symbol+exchange로 매칭
- 불일치(거래소有 DB無): 패닉 클로즈 대상
- 고아(DB有 거래소無): IDLE 마킹 대상
- **안전장치 1**: pendingSymbols 목록에 있는 심볼은 불일치 판정에서 제외
- **안전장치 2**: snapshotTime 이후 생성된 Ticket은 불일치 판정에서 제외

## Steps
1. ReconciliationResult, MatchedPair, UnmatchedPosition, OrphanedTicket 타입 정의
2. `comparePositions(exchangePositions, activeTickets, pendingSymbols, snapshotTime) → ReconciliationResult` 구현
   - symbol+exchange 키로 매칭
   - 매칭: 양쪽 모두 존재
   - 불일치: 거래소에만 존재 (pendingSymbols 제외, 최근 Ticket 제외)
   - 고아: DB에만 존재
3. `isRecentTicket(ticket, snapshotTime) → boolean` 헬퍼
4. 테스트 작성 후 구현 (TDD)

## Acceptance Criteria
- 매칭: 동일 symbol+exchange에 거래소 포지션과 DB 티켓 모두 존재 → matched[]
- 불일치: 거래소에 포지션이 있으나 DB에 활성 티켓 없음 → unmatched[]
- 고아: DB에 활성 티켓이 있으나 거래소에 포지션 없음 → orphaned[]
- 안전장치: pendingSymbols에 포함된 심볼 → unmatched에서 제외 (excluded[])
- 안전장치: snapshotTime 이후 created_at인 Ticket → unmatched 판정에서 무시
- 빈 입력 → 모두 빈 배열

## Test Scenarios
- comparePositions() all matched → matched=[pair], unmatched=[], orphaned=[]
- comparePositions() exchange has position, no DB ticket → unmatched=[position]
- comparePositions() DB has ticket, no exchange position → orphaned=[ticket]
- comparePositions() mixed: 1 matched, 1 unmatched, 1 orphaned → correct classification
- comparePositions() pendingSymbol in unmatched → excluded, not unmatched
- comparePositions() recent ticket (after snapshotTime) → not counted as unmatched
- comparePositions() multiple exchanges same symbol → matched by (symbol, exchange) pair
- comparePositions() empty exchange positions + empty tickets → all empty arrays
- comparePositions() direction mismatch (exchange LONG, DB SHORT same symbol) → treated as unmatched + orphaned
- isRecentTicket() created before snapshot → false
- isRecentTicket() created after snapshot → true

## Validation
```bash
bun test -- --grep "comparator"
bun run typecheck
bun run lint
```

## Out of Scope
- 실제 거래소 호출 (T-08-004 worker)
- 패닉 클로즈 실행 (T-08-004 → emergencyClose)
- EventLog 기록 (T-08-004)
- DB 조회 (worker가 담당)

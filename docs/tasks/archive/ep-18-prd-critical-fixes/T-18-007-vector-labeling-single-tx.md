# T-18-007 Vector 라벨링 closeTicket 단일 TX 연결

## Metadata
- modules: [positions, labeling]
- primary: positions

## Goal
`closeTicket()` 내에서 `finalizeLabel()`을 호출하여 Ticket CLOSED와 Vector label/grade 갱신을 단일 트랜잭션으로 처리한다.

## Why
현재 `finalizeLabel()`은 구현되어 있지만 아무 곳에서도 호출되지 않음 (grep 확인: labeling/ 모듈 내부에서만 참조). Ticket이 CLOSED되어도 Vector에 label/grade가 기록되지 않아 KNN 학습 데이터에 라벨이 없음. PRD §7.19: "Vector.label/grade 동시 갱신 (단일 트랜잭션)".

## Inputs
- PRD §7.19 L381-383
- `src/positions/ticket-manager.ts:250-340` — closeTicket()
- `src/labeling/engine.ts:112-198` — finalizeLabel()

## Dependencies
- 없음

## Expected Outputs
- 수정된 `src/positions/ticket-manager.ts`
- 테스트

## Deliverables
- `closeTicket()` 트랜잭션 내에서 `finalizeLabel()` 로직 인라인 또는 호출
- 두 가지 접근 중 택 1:
  - (A) `finalizeLabel()` 로직을 closeTicket TX 안에 인라인 (별도 TX 제거)
  - (B) `finalizeLabel()`에 외부 TX(tx)를 주입받는 오버로드 추가
- vectorId가 null인 경�� (벡터 없는 Panic Close 등) → label 스킵
- ���벨링 실패 시 전체 TX 롤백 (Ticket close도 롤백) — PRD 원칙 "단일 트랜잭션"

## Constraints
- 레이어 규칙: positions(L5) → labeling(L6) 직접 임포트 불가
  - 해결: `closeTicket`의 deps 패턴으로 라벨링 함수를 주입받거나, labeling 로직을 TX 내에 인��인
  - 또는: daemon(L9)에서 closeTicket 후 finalizeLabel 호출하되, 같은 tx 안에서 실행
- Decimal.js 사용 유지
- Lock order: SymbolState → Ticket → Vector (ARCHITECTURE.md)

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `closeTicket()`의 파라미터에 `vectorId: string | null` + labeling deps 추가
4. 트랜잭션 내 step 7과 8 사이에 finalizeLabel 로직 삽���
5. vectorId null → 라벨링 스킵
6. classifyResult + classifyGrade → Vector UPDATE (같은 tx)
7. Run tests — confirm all pass (GREEN phase)
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] closeTicket(vectorId="abc") → Vector.label + Vector.grade 갱신됨 (DB 확인)
- [x] closeTicket(vectorId=null) → Vector 갱신 스킵, Ticket만 CLOSED
- [x] Ticket CLOSED + Vector UPDATE = 단일 트랜잭션 (하나 실패 시 둘 다 롤백)
- [x] label: WIN/LOSS/TIME_EXIT 정확히 분류
- [x] grade: A(DOUBLE_B+safety+winrate≥0.65) / B(DOUBLE_B) / C(ONE_B)
- [x] Lock order: SymbolState → Ticket → Vector 순서 유지

## Test Scenarios
- closeTicket() with vectorId → Vector.label set to WIN when pnl > 0
- closeTicket() with vectorId → Vector.label set to LOSS when pnl <= 0
- closeTicket() with vectorId and closeReason=TIME_EXIT → Vector.label set to TIME_EXIT
- closeTicket() with vectorId=null → no Vector update, ticket still CLOSED
- closeTicket() with DOUBLE_B signal + safety_passed + knn_winrate=0.70 → grade=A
- closeTicket() with ONE_B signal → grade=C
- closeTicket() transaction rolls back both ticket and vector on error
- closeTicket() acquires locks in order: SymbolState → Ticket → Vector

## Validation
```bash
bun test src/positions/ticket-manager.test.ts
bun test src/labeling/engine.test.ts
bun run typecheck
```

## Out of Scope
- 기존 미라벨링 Vector 데이터 백필 (별도)
- classifyResult/classifyGrade 로직 변경 없음

## Implementation Notes
- Approach: DI injection pattern (Option C from task constraints)
  - Added `LabelingDeps` type to `CloseTicketParams` carrying `classifyResult` + `classifyGrade` callbacks
  - This respects L5→L6 layer boundary: positions does not import labeling
  - Callers (L9 daemon, L8 backtest) pass the pure functions from labeling/engine.ts
- Labeling logic is inlined in closeTicket()'s transaction (step 8 after SymbolState update)
- Lock order maintained: SymbolState → Ticket (step 2-3) → Vector (step 8d)
- vectorId=null OR labelingDeps=undefined → labeling skipped (safe for PANIC_CLOSE etc.)
- knn_winrate absent → defaults to "0" (DOUBLE_B without KNN data → grade B)
- Files modified:
  - src/positions/ticket-manager.ts: LabelingDeps type, CloseTicketParams.vectorId/labelingDeps, closeTicket step 8
  - src/positions/index.ts: export LabelingDeps
  - src/positions/ticket-manager.test.ts: new file, 24 tests (all pass)

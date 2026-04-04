# T-07-005 라벨링 엔진 — 거래 결과 분류 + Vector label/grade 확정

## Goal
거래 결과(WIN/LOSS/TIME_EXIT)와 등급(A/B/C)을 분류하는 순수 함수와, Ticket+Vector를 단일 트랜잭션으로 확정하는 DB 함수를 구현한다.

## Why
라벨링은 KNN의 학습 데이터를 생성하는 피드백 루프이다. 정확한 WIN/LOSS/grade 분류가 KNN 정확도를 결정한다. Ticket+Vector 원자적 갱신으로 데이터 일관성을 보장한다.

## Inputs
- `src/db/schema.ts` — ticketTable, vectorTable, signalTable
- `src/core/decimal.ts` — Decimal.js 래퍼
- `src/core/types.ts` — TradeResult, VectorGrade, SignalType
- `docs/DATA_MODEL.md` — Vector.label, Vector.grade, Vector.labeled_at
- `docs/PRODUCT.md` — A-grade: DOUBLE_B + safety_passed + winrate ≥ 0.65

## Dependencies
- 없음 (EP-05/06 테이블 이미 존재, 독립 구현 가능)

## Expected Outputs
- `src/labeling/engine.ts` — `classifyResult()` 순수, `classifyGrade()` 순수, `finalizeLabel()` DB
- daemon이 closeTicket() 후 finalizeLabel() 호출

## Deliverables
- `src/labeling/engine.ts`
- `tests/labeling/engine.test.ts`
- `src/labeling/index.ts` barrel export 업데이트

## Constraints
- `classifyResult()`, `classifyGrade()` 는 순수 함수 — DB import 금지
- `finalizeLabel()` 는 Ticket + Vector 단일 트랜잭션
- 잠금 순서: Ticket → Vector (ARCHITECTURE.md)
- grade 분류: A = DOUBLE_B + safety_passed + knn winrate ≥ 0.65, B = DOUBLE_B (A 미달), C = ONE_B
- 모든 PnL 비교 Decimal.js
- Vector.labeled_at 타임스탬프 설정

## Steps
1. LabelResult, GradeInput 타입 정의
2. `classifyResult(pnl, closeReason) → TradeResult` (순수)
   - close_reason = TIME_EXIT → TIME_EXIT
   - pnl > 0 → WIN
   - pnl <= 0 → LOSS
3. `classifyGrade(signalType, safetyPassed, knnWinrate) → VectorGrade` (순수)
   - DOUBLE_B + safety + winrate ≥ 0.65 → A
   - DOUBLE_B (나머지) → B
   - ONE_B → C
4. `finalizeLabel(db, ticketId, vectorId) → void` (DB)
   - 트랜잭션: Ticket FOR UPDATE → Signal 조회 → classifyResult + classifyGrade → Vector UPDATE (label, grade, labeled_at)
5. 테스트 작성 후 구현 (TDD)

## Acceptance Criteria
- classifyResult: pnl > 0 → WIN, pnl < 0 → LOSS, pnl = 0 → LOSS, TIME_EXIT → TIME_EXIT
- classifyGrade: DOUBLE_B + safety + winrate 0.65 → A
- classifyGrade: DOUBLE_B + safety + winrate 0.60 → B (A 미달)
- classifyGrade: DOUBLE_B + safety_failed → B
- classifyGrade: ONE_B → C (무조건)
- finalizeLabel: Ticket + Vector 단일 트랜잭션
- finalizeLabel: Vector.labeled_at 설정
- finalizeLabel: vectorId가 없으면(null) Vector 갱신 스킵 (Ticket만 result 확정)

## Test Scenarios
- classifyResult() pnl > 0 → WIN
- classifyResult() pnl < 0 → LOSS
- classifyResult() pnl = 0 → LOSS (수익 없음 = 손실)
- classifyResult() closeReason=TIME_EXIT, pnl > 0 → TIME_EXIT (closeReason 우선)
- classifyResult() closeReason=TIME_EXIT, pnl < 0 → TIME_EXIT
- classifyGrade() DOUBLE_B, safety=true, winrate=0.70 → A
- classifyGrade() DOUBLE_B, safety=true, winrate=0.65 → A (경계값)
- classifyGrade() DOUBLE_B, safety=true, winrate=0.60 → B
- classifyGrade() DOUBLE_B, safety=false → B
- classifyGrade() ONE_B, any safety, any winrate → C
- finalizeLabel() DB: Vector.label=WIN, grade=A, labeled_at set
- finalizeLabel() DB: vectorId=null → Vector skip, Ticket only
- finalizeLabel() rollback on error → neither Ticket nor Vector changed

## Validation
```bash
bun test -- --grep "labeling"
bun run typecheck
bun run lint
```

## Out of Scope
- Ticket 종료 (EP-06 closeTicket)
- 청산 조건 판단 (T-07-001)
- 청산 실행 (T-07-003)
- KNN 재학습 트리거 (향후)

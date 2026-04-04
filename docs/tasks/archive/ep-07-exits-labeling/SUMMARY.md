# EP-07 Exits & Labeling — Archive Summary

- **Completed**: 2026-04-04
- **Tasks**: 6 (T-07-001 ~ T-07-006)
- **Tests added**: 125 (1,491 → 1,616)
- **Source LOC**: ~1,500
- **Waves**: 3 (4 batches, WIP=2)
- **QA failures**: 0
- **Review rejections**: 0

## Key decisions
- 순수 함수/DB 분리: checker, trailing, classifyResult/Grade, canPyramid 순수 / manager, finalizeLabel DB
- manager.ts에 TP1/TP2/TIME_EXIT/TP갱신/MFE갱신 통합 (파일 소유권 충돌 방지)
- pyramid.ts에서 executeEntry 콜백 DI (L5→L6 레이어 규칙 준수)
- 트레일링 SL 라쳇: 유리 방향으로만 이동, shouldUpdateTrailingSl로 검증
- labeling: daemon이 closeTicket 후 finalizeLabel 호출, Ticket+Vector 단일 트랜잭션

## Patterns discovered
- DI callback 패턴: pyramid(L5)가 executor(L6)를 콜백으로 받아 레이어 규칙 준수

## Outputs produced
- `src/exits/checker.ts` — 청산 조건 검사 순수 함수
- `src/exits/trailing.ts` — 트레일링 스탑 순수 함수
- `src/exits/manager.ts` — 청산 실행 매니저 (DB+exchange)
- `src/positions/pyramid.ts` — 피라미딩 조건 검사 + DI 실행
- `src/labeling/engine.ts` — 결과 분류(순수) + Vector label 확정(DB)
- `tests/exits/exits-labeling-e2e.test.ts` — 7 E2E 시나리오

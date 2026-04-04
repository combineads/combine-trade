# EP-06 Position Management — Archive Summary

- **Completed**: 2026-04-04
- **Tasks**: 9 (T-06-001 ~ T-06-009)
- **Tests added**: 249 (1,246 → 1,491)
- **Source LOC**: ~1,784
- **Waves**: 4 (7 batches, WIP=2)
- **QA failures**: 0
- **Review rejections**: 0

## Key decisions
- 순수 함수/DB 분리 패턴 5개 모듈에 적용 (fsm, sizer, slippage, checkLossLimit, shouldReset*)
- limits(L5)는 positions(L5) import 없이 db/schema.ts(L1) 직접 접근으로 레이어 규칙 준수
- executor.ts에 SL 실패 복구, bracket/타임아웃, 모드 가드 통합 (파일 소유권 충돌 방지)
- Bracket order 우선 시도 → 미지원 시 2-step fallback

## Patterns discovered
- Same-layer import avoidance via L1 schema direct access (limits → symbolStateTable)

## Outputs produced
- `src/positions/fsm.ts` — Ticket FSM 순수 함수
- `src/positions/sizer.ts` — 리스크 역산 사이저 순수 함수
- `src/positions/ticket-manager.ts` — 티켓 CRUD + SymbolState 연동
- `src/orders/executor.ts` — 주문 실행기 (bracket, SL 복구, 모드 가드)
- `src/orders/slippage.ts` — 슬리피지 체크 순수 함수
- `src/limits/loss-limit.ts` — 3단계 손실 제한 + 카운터 리셋
- `drizzle/0005_faithful_tattoo.sql` — Ticket, Order 마이그레이션
- `tests/positions/position-entry-e2e.test.ts` — 7 E2E 시나리오

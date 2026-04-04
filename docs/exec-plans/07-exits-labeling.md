# 07-exits-labeling

## Objective
3단계 청산, 피라미딩, 라벨링을 구현한다. EP-06(포지션 기반)의 후속 에픽.

## Scope
- `src/exits/` (L6): 청산 조건 검사(순수), 트레일링 스탑(순수), 청산 실행 매니저(DB+exchange)
- `src/positions/pyramid.ts` (L5): 피라미딩 조건 검사, 2차 진입
- `src/labeling/` (L6): 거래 결과 분류(순수), Vector 라벨 확정(DB 트랜잭션)

## Non-goals
- 포지션 FSM/사이징/주문 실행 (EP-06)
- 대조 (EP-08)
- 데몬 오케스트레이션 (EP-09)

## Prerequisites
- EP-02 (indicators — MA, BB, ATR) 완료 ✅ — 아카이빙: `docs/tasks/archive/ep-02-indicators/`
- EP-05 (signal pipeline — Vector, Signal) 완료 ✅ — 아카이빙: `docs/tasks/archive/ep-05-signal-pipeline/`
- EP-06 (position management — FSM, sizer, executor, loss-limit) 완료 ✅ — 아카이빙: `docs/tasks/archive/ep-06-position-management/`
- **참고:** 신규 마이그레이션 불필요 — Ticket, Order, Vector 테이블 모두 EP-05/06에서 생성 완료
- **참고:** EP-06 DB 테스트 인프라 + mock ExchangeAdapter 패턴 활용

## Milestones

### M1 — 3단계 청산 & 트레일링
- Deliverables:
  - `src/exits/checker.ts` — 청산 조건 검사 **순수 함수** (DB import 금지)
    - `checkExit(ticket, candle, indicators) → ExitAction | null`
    - TP1: close >= tp1_price → TP1_HIT 판정 (50% 청산 + 본절 이동 + 트레일링 시작)
    - TP2: close >= tp2_price (TP1_HIT 상태에서) → TP2_HIT 판정 (25% 청산)
    - TIME_EXIT: hold_duration > 60시간 → CLOSE 판정 (전량 청산)
    - MFE/MAE 계산: `calcMfeMae(ticket, currentPrice, direction) → { maxFavorable, maxAdverse }`
  - `src/exits/trailing.ts` — 트레일링 스탑 **순수 함수** (DB import 금지)
    - `calculateTrailingSl(entryPrice, maxProfit, direction, trailingRatio) → Decimal`
    - LONG: new_sl = entry + max_profit × 0.50 (SL 상향)
    - SHORT: new_sl = entry - max_profit × 0.50 (SL 하향)
    - SL은 유리한 방향으로만 이동 (불리한 방향 이동 금지)
  - `src/exits/manager.ts` — 청산 실행 매니저 (DB + exchange)
    - `executeExit(db, adapter, ticket, action) → ExitResult`
    - 부분 청산 주문 생성 (reduceOnly)
    - SL 본절 이동 (adapter.editOrder 또는 cancel+create)
    - Ticket 상태 전이 (transitionTicket)
    - MFE/MAE DB 갱신 (매 캔들 체크 시)
    - TP 가격 동적 갱신: 매 1H close 시 TP1=MA20_1H, TP2=반대편BB20_1H
- Acceptance criteria:
  - 3단계 청산 순서 정확 (TP1 → TP2 → trailing/TIME_EXIT)
  - TP1 후 SL이 반드시 본절(entry_price)로 이동
  - LONG 트레일링: entry + max_profit × 0.50 (상향만)
  - SHORT 트레일링: entry - max_profit × 0.50 (하향만)
  - 60시간 최대 보유 초과 시 전량 청산 (TIME_EXIT)
  - 매 1H close 시 TP1/TP2 가격이 현재 1H 지표값으로 갱신
  - 매 캔들 체크 시 max_favorable, max_adverse 갱신
  - 부분 청산 사이즈 정확 (Decimal.js): TP1=size×0.50, TP2=remaining×(25/75)
  - 부분 청산은 reduceOnly 주문
  - checker/trailing은 순수 함수 — 백테스트에서 DB 없이 재사용
- Validation:
  - `bun test -- --grep "exit-checker|trailing|exit-manager"`
  - `bun run typecheck`
  - `bun run lint`

### M2 — 피라미딩
- Deliverables:
  - `src/positions/pyramid.ts` — 피라미딩 조건 검사(순수) + 2차 진입 실행(DB)
    - `canPyramid(ticket, config) → boolean` (순수): TP1 달성 + SL 본절 확인
    - `executePyramid(db, adapter, ticket, signal, sizeResult) → Ticket` (DB): 2차 티켓 생성
  - parent_ticket_id 연결
  - 최대 2회 피라미딩 제한
- Acceptance criteria:
  - 피라미딩은 1차 TP1 달성 + SL 본절(무위험 확정) 상태에서만 허용
  - canPyramid: state === TP1_HIT && current_sl_price >= entry_price (LONG) 또는 <= (SHORT)
  - 2차 티켓이 parent_ticket_id로 1차 참조
  - 최대 pyramid_count 2 하드캡 (CommonCode POSITION.max_pyramid_count)
  - 2차 진입도 동일 risk_pct 적용 (EP-06 sizer 재사용)
- Validation:
  - `bun test -- --grep "pyramid"`
  - `bun run typecheck`
  - `bun run lint`

### M3 — 라벨링
- Deliverables:
  - `src/labeling/engine.ts` — 거래 결과 분류(순수) + Vector label/grade 확정(DB)
    - `classifyResult(ticket) → { result, grade }` (순수): WIN/LOSS/TIME_EXIT + A/B/C
    - `finalizeLabel(db, ticketId, vectorId) → void` (DB): Ticket result 확정 + Vector label/grade 갱신, 단일 트랜잭션
    - A-grade: DOUBLE_B + safety_passed + winrate ≥ 0.65
    - B-grade: DOUBLE_B (A 미달)
    - C-grade: ONE_B
- Acceptance criteria:
  - 라벨 확정 시 Ticket + Vector 단일 트랜잭션
  - WIN/LOSS/TIME_EXIT 분류: pnl > 0 → WIN, pnl < 0 → LOSS, close_reason=TIME_EXIT → TIME_EXIT
  - grade (A/B/C) 분류 기준 정확
  - 모든 PnL 계산 Decimal.js
  - Vector.labeled_at 타임스탬프 기록
- Validation:
  - `bun test -- --grep "labeling"`
  - `bun run typecheck`
  - `bun run lint`

## Task candidates → Generated tasks mapping
- T-07-001: exits/checker.ts — 청산 조건 검사 순수 함수 (TP1/TP2/TIME_EXIT + MFE/MAE 계산)
- T-07-002: exits/trailing.ts — 트레일링 스탑 순수 함수 (LONG/SHORT 방향별 SL 계산)
- T-07-003: exits/manager.ts — 청산 실행 매니저 (부분 청산 주문 + SL 이동 + 전이 + TP 갱신 + MFE/MAE 갱신)
- T-07-004: positions/pyramid.ts — 피라미딩 조건 검사(순수) + 2차 진입(DB)
- T-07-005: labeling/engine.ts — 거래 결과 분류(순수) + Vector label/grade 확정(DB 트랜잭션)
- T-07-006: 청산 → 라벨링 E2E 통합 테스트

### Dependency graph
```
Wave 1 (no EP-07 deps):  T-07-001, T-07-002, T-07-004, T-07-005
Wave 2:                   T-07-003 (→001,002)
Wave 3:                   T-07-006 (→003,005)
```

## Risks
- **부분 청산 API 차이**: 거래소별 partial close 동작 다름. Binance 우선 검증 후 추상화. ExchangeAdapter.createOrder의 reduceOnly 플래그 활용.
- **트랜잭션 데드락**: SymbolState FOR UPDATE + Vector label 확정이 동시 발생 가능. 잠금 순서: SymbolState → Ticket → Vector → Order.
- **트레일링 스탑 비율**: max_profit × 0.50 고정 (PRD 7.13). 향후 비율 조정 필요 시 CommonCode에서 관리.
- **MFE/MAE 경합**: exit manager가 MFE/MAE를 갱신하는 중에 closeTicket이 호출될 수 있음. 단일 트랜잭션으로 보호.

## Decision log
- EP-06에서 분리한 이유: 진입+SL+손실 제한이 완성되면 EP-08/EP-09 통합을 조기에 시작 가능
- 부분 청산은 reduceOnly 주문으로 구현
- **트레일링 스탑 방향별 공식**: LONG: new_sl = entry + max_profit × 0.50, SHORT: new_sl = entry - max_profit × 0.50. 유리한 방향으로만 이동 (PRD 7.13)
- **라벨링 트리거**: daemon이 closeTicket() 호출 후 labeling.finalizeLabel() 호출. 두 호출이 동일 트랜잭션 내에서 실행되어 Ticket+Vector 원자적 갱신 보장
- **MFE/MAE 추적**: exit manager가 매 캔들 체크 시 max_favorable, max_adverse를 계산(순수)하고 DB에 갱신. closeTicket 시점에 최종값이 이미 Ticket에 반영되어 있음
- **순수 함수/DB 분리 패턴 적용** (EP-05/06 패턴 계승): checker(순수), trailing(순수), classifyResult(순수) vs manager(DB), finalizeLabel(DB)
- **exits → indicators 접근**: exits(L6)는 indicators(L2) import 가능하나, 데몬이 지표값을 파라미터로 전달하는 방식 사용 (백테스트 재사용)
- **manager.ts 단일 소유**: TP1/TP2/TIME_EXIT/TP갱신/MFE갱신을 하나의 manager 태스크(T-07-003)에 통합. 파일 소유권 충돌 방지 (EP-05/06 리뷰 패턴)
- **labeling engine 통합**: result/grade 분류(순수) + Vector label 확정(DB)을 하나의 태스크(T-07-005)에 통합. 순수/DB 분리는 함수 레벨로 적용

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- 2026-04-04: 에픽 리뷰 수행. Critical 2건(manager.ts 4건 충돌, engine.ts 2건 충돌), Important 7건(전제조건, 검증, 순수함수 패턴, 방향별 SL, MFE/MAE, labeling 트리거, indicators 접근), Minor 2건 수정 완료.
- 2026-04-04: 태스크 후보 9개→6개로 통합. manager.ts 소유 태스크 4개→1개, labeling 태스크 2개→1개. 3 Waves 의존성 그래프.
- 2026-04-04: 태스크 생성 완료 (6개). 의존성: Wave1(001,002,004,005) → Wave2(003→001+002) → Wave3(006→003+005). 3 Waves.

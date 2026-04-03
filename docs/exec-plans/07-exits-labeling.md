# 07-exits-labeling

## Objective
3단계 청산, 피라미딩, 라벨링을 구현한다. EP-06(포지션 기반)의 후속 에픽.

## Scope
- `src/exits/` (L6): 3단계 청산 관리자, 트레일링 스탑
- `src/positions/pyramid.ts` (L5): 피라미딩 조건 검사, 2차 진입
- `src/labeling/` (L6): 거래 결과 기록, Vector 라벨 확정

## Non-goals
- 포지션 FSM/사이징/주문 실행 (EP-06)
- 대조 (EP-08)
- 데몬 오케스트레이션 (EP-09)

## Prerequisites
- EP-06 M1-M2 (FSM, 주문 실행) 완료
- EP-02 (indicators — ATR, 트레일링에 필요) 완료
- EP-05 M4 (vectors — 라벨링에 필요) 진행 중 이상

## Milestones

### M1 — 3단계 청산 & 트레일링
- Deliverables:
  - `src/exits/manager.ts` — ExitManager
    - TP1: 50% 청산 + SL → 본절 이동 + 트레일링 시작
    - TP2: 25% 청산
    - 잔여: 트레일링 스탑 계속
    - TIME_EXIT: 보유 시간 > max_hold_bars_1h(60) × 1시간 → 전량 청산 (PRD 7.13)
  - `src/exits/trailing.ts` — 트레일링 스탑 로직 (매 1H close: new_sl = entry + max_profit × 0.50)
  - 매 1H close 시 TP 가격 동적 갱신: TP1 = MA20_1H, TP2 = 반대편 BB20_1H (PRD 7.13)
- Acceptance criteria:
  - 3단계 청산 순서 정확
  - TP1 후 SL이 반드시 본절로 이동
  - 트레일링 가격은 유리한 방향으로만 이동 (불리한 방향 금지)
  - 60시간 최대 보유 초과 시 전량 청산 (TIME_EXIT)
  - 매 1H close 시 TP1/TP2 가격이 현재 1H 지표값으로 갱신
  - 부분 청산 사이즈 정확 (Decimal.js)
  - 부분 청산은 reduceOnly 주문
- Validation:
  - `bun test -- --grep "exits|trailing"`

### M2 — 피라미딩
- Deliverables:
  - `src/positions/pyramid.ts` — 피라미딩 조건 검사, 2차 진입 로직
  - parent_ticket_id 연결
  - 최대 2회 피라미딩 제한
- Acceptance criteria:
  - 피라미딩은 1차 TP1 달성 + SL 본절(무위험 확정) 상태에서만 허용
  - 2차 티켓이 parent_ticket_id로 1차 참조
  - 최대 pyramid_count 2 하드캡
- Validation:
  - `bun test -- --grep "pyramid"`

### M3 — 라벨링
- Deliverables:
  - `src/labeling/engine.ts` — 거래 결과 확정 (WIN/LOSS/TIME_EXIT)
  - Vector.label/grade 확정 (단일 트랜잭션)
  - Ticket CLOSED 시 MFE, MAE, hold_duration_sec 계산
- Acceptance criteria:
  - 라벨 확정 시 Ticket + Vector 단일 트랜잭션
  - WIN/LOSS/TIME_EXIT 분류 정확
  - grade (A/B/C) 분류 기준 구현
  - 모든 PnL 계산 Decimal.js
- Validation:
  - `bun test -- --grep "labeling"`

## Task candidates
- T-07-001: exits/manager.ts — TP1 50% 청산 + 본절 이동
- T-07-002: exits/manager.ts — TP2 25% 청산
- T-07-003: exits/trailing.ts — 트레일링 스탑 (매 1H close, max_profit × 0.50)
- T-07-004: exits/manager.ts — TIME_EXIT (60시간 최대 보유 초과 → 전량 청산)
- T-07-005: exits/manager.ts — 매 1H close 시 TP1(MA20_1H)/TP2(BB20_1H) 동적 갱신
- T-07-006: positions/pyramid.ts — 피라미딩 조건 검사 & 2차 진입
- T-07-007: labeling/engine.ts — 거래 결과 확정 (WIN/LOSS/TIME_EXIT)
- T-07-008: labeling/engine.ts — Vector label/grade 확정 (단일 트랜잭션)
- T-07-009: 청산 → 라벨링 E2E 통합 테스트

## Risks
- **부분 청산 API 차이**: 거래소별 partial close 동작 다름. Binance 우선 검증 후 추상화.
- **트랜잭션 데드락**: SymbolState FOR UPDATE + Vector label 확정이 동시 발생 가능. 잠금 순서: SymbolState → Ticket → Vector → Order.
- **트레일링 스탑 비율**: max_profit × 0.50 고정 (PRD 7.13). 향후 비율 조정 필요 시 CommonCode에서 관리.

## Decision log
- EP-06에서 분리한 이유: 진입+SL+손실 제한이 완성되면 EP-08/EP-09 통합을 조기에 시작 가능
- 부분 청산은 reduceOnly 주문으로 구현
- 트레일링 스탑은 매 1H close 시 new_sl = entry + max_profit × 0.50 (PRD 7.13 준수)
- 라벨링은 Ticket CLOSED 시점에 동기적으로 수행

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- (작업 전)

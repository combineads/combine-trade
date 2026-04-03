# 06-position-management

## Objective
포지션 생명주기의 기반을 구축한다. FSM, 포지션 사이징, 주문 실행, 손실 제한을 포함한다. 3단계 청산, 피라미딩, 라벨링은 EP-07에서 다룬다.

## Scope
- `src/positions/` (L5): FSM, 티켓 관리자, 포지션 사이저
- `src/limits/` (L5): 일간/세션/시간 손실 제한
- `src/orders/` (L6): 주문 실행기, 어댑터 디스패치, 슬리피지 체크

## Non-goals
- 시그널 생성 (EP-05)
- 거래소 어댑터 구현 (EP-03)
- 대조(reconciliation) (EP-08)
- 3단계 청산, 피라미딩, 라벨링 (EP-07)

## Prerequisites
- EP-01 (core, db, config) 완료
- EP-03 M1 (exchanges — Binance 어댑터) 완료
- EP-05 M3 (signals — Signal 레코드 생성) 진행 중 이상

## Milestones

### M1 — 포지션 FSM & 티켓 관리
- Deliverables:
  - `db/migrations/004` — Ticket, Order 테이블 마이그레이션
  - `src/positions/fsm.ts` — Ticket FSM (INITIAL → TP1_HIT → TP2_HIT → CLOSED)
  - `src/positions/ticket-manager.ts` — 티켓 CRUD, 상태 전이, 활성 티켓 조회
  - SymbolState.fsm_state 연동 (IDLE ↔ WATCHING ↔ HAS_POSITION)
- Acceptance criteria:
  - 유효하지 않은 상태 전이 시 예외 발생
  - 심볼×거래소당 활성 티켓 1개 제약 (피라미딩 제외)
  - SymbolState 변경은 단일 트랜잭션
- Validation:
  - `bun test -- --grep "position-fsm|ticket"`

### M2 — 포지션 사이징 & 주문 실행
- Deliverables:
  - `src/positions/sizer.ts` — **리스크 역산 사이저**
    - 1회 최대 손실 = 잔고 × `POSITION.risk_pct` (시드 규모별 티어: 300K KRW → 3%, 30M KRW → 1%)
    - 포지션 크기 = risk_amount ÷ SL_distance (SL 폭 기반 역산)
    - 레버리지 = 포지션 크기에서 역산 (max 38x 하드캡 — 초과 시 포지션 축소)
    - **고정 계약 수/고정 금액 진입 절대 금지** — 김직선 전략 핵심 원칙
    - CommonCode: `POSITION.risk_pct` (시드 티어별), `POSITION.max_leverage` (38x)
  - `src/orders/executor.ts` — 주문 실행기 (진입 → SL 등록 → 확인)
  - `src/orders/slippage.ts` — 슬리피지 체크 (임계치 초과 시 ABORT)
  - 실행 모드 가드 (analysis 모드에서만 주문 실행 차단 — alert/live는 실제 주문 실행)
- Acceptance criteria:
  - Decimal.js로 모든 사이징 계산
  - 1회 손실 = 잔고 × risk_pct로 고정 — SL 폭이 달라도 손실 금액은 항상 동일
  - 피라미딩 2차 진입도 동일한 risk_pct 적용 (잔고 기준 재계산)
  - 역산된 레버리지가 max_leverage(38x) 초과 시 포지션 크기 축소 (레버리지 캡 우선)
  - SL이 진입 주문 체결 후 즉시 등록 (다른 어떤 동작보다 선행)
  - SL 등록 실패 시 3회 재시도 → 실패 시 즉시 청산
  - 슬리피지 초과 시 즉시 ABORT + 청산
  - **SL 경쟁 조건 완화**: Binance bracket order(진입+SL 동시) 가능 여부 확인 → 불가 시 진입 체결 확인 후 SL 등록까지 최대 3초, 초과 시 강제 청산
  - analysis 모드에서 주문 실행 시도 시 하드 에러 (alert/live는 허용 — PRD 7.20)
- Validation:
  - `bun test -- --grep "sizer|executor"`

### M3 — 손실 제한
- Deliverables:
  - `src/limits/loss-limit.ts` — LossLimitManager
    - 일간 손실 10% 한도
    - 세션 손절 3회 한도
    - 시간당 5M 2회 / 1M 1회 한도
- Acceptance criteria:
  - 3단계 손실 제한 모두 동작
  - 손실 카운터 리셋 규칙 (UTC 00:00, 세션 시작, 매 정시)
  - SymbolState.losses_* 정확 갱신
  - 한도 초과 시 진입 차단 + Slack 알림 (EP-08 이후 연동)
- Validation:
  - `bun test -- --grep "loss-limit"`

## Task candidates
- T-06-001: db/migrations/004 — Ticket, Order 테이블 마이그레이션
- T-06-002: positions/fsm.ts — Ticket FSM 상태 전이
- T-06-003: positions/ticket-manager.ts — 티켓 CRUD
- T-06-004: positions/sizer.ts — 리스크 역산 사이저 (risk_pct × 잔고 → SL 폭 기반 포지션/레버리지 역산)
- T-06-005: orders/executor.ts — 주문 실행기 기본 (진입 + SL)
- T-06-006: orders/executor.ts — SL 등록 실패 복구 (재시도 → 강제 청산)
- T-06-007: orders/executor.ts — SL 경쟁 조건 완화 (bracket order spike + 타임아웃 가드)
- T-06-008: orders/slippage.ts — 슬리피지 체크 & ABORT
- T-06-009: orders/executor.ts — 실행 모드 가드 (analysis만 차단)
- T-06-010: limits/loss-limit.ts — 3단계 손실 제한
- T-06-011: 포지션 진입 E2E 통합 테스트

## Risks
- **SL 등록 경쟁 조건**: 진입 체결과 SL 등록 사이에 가격 급변 가능. **완화**: Binance bracket order spike (M2에서 검증), 불가 시 3초 타임아웃 + 강제 청산.
- **트랜잭션 데드락**: SymbolState FOR UPDATE가 다른 트랜잭션과 충돌 가능. 잠금 순서 규칙: SymbolState → Ticket → Order 순서.
- **부분 청산 API 차이**: EP-07에서 다루되, 이 에픽에서 ExchangeAdapter 인터페이스에 reduceOnly 플래그 포함.

## Decision log
- **포지션 사이징은 리스크 역산** — 1회 최대 손실 = 잔고 × risk_pct로 고정하고, SL 폭에 따라 포지션 크기와 레버리지를 역산한다. 고정 계약 수/고정 금액 진입은 절대 금지 (김직선 전략 핵심 원칙). 이유: 고정 금액은 SL 폭에 따라 손실 금액이 달라져 오히려 "큰 손실 한 번에 시드 훼손"을 유발한다. 리스크 역산은 SL이 타이트할 때 포지션이 커져도 손실 금액이 항상 동일하므로 원천적으로 과대 손실이 불가능하다.
- 레버리지는 사이징에서 역산 — 포지션 크기 확정 후 필요 레버리지를 계산하며, max 38x 하드캡 초과 시 포지션 크기를 축소
- risk_pct 티어: 소액(~300K KRW) 3%, 대액(~30M KRW) 1% — 시드 규모에 따라 위험 노출 비율을 조절
- SL 등록은 진입 체결 후 최우선 동작 (AGENTS.md 핵심 규칙)
- 실행 모드 가드는 orders 모듈에서 실행 (daemon이 아닌)
- 3단계 청산/피라미딩/라벨링을 EP-07로 분리 — 이 에픽(EP-06)은 "진입 + SL + 손실 제한"에 집중하여, EP-08/EP-09의 최소 통합을 조기에 시작 가능
- Transaction 테이블(Ticket, Order)은 이 에픽 마이그레이션에서 생성

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- (작업 전)

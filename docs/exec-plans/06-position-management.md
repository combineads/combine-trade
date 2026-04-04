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
- EP-01 (core, db, config) 완료 ✅ — 아카이빙: `docs/tasks/archive/ep-01-foundation/`
- EP-03 (exchanges — Binance 어댑터, WS 매니저) 완료 ✅ — 아카이빙: `docs/tasks/archive/ep-03-exchanges/`
- EP-04 (market data — 캔들 수집, DB 테스트 인프라) 완료 ✅ — 아카이빙: `docs/tasks/archive/ep-04-market-data/`
- EP-05 (signal pipeline — 전체 파이프라인) 완료 ✅ — 아카이빙: `docs/tasks/archive/ep-05-signal-pipeline/`
- **참고:** Ticket, Order 테이블은 EP-01~05 마이그레이션에 미포함. 이 에픽 마이그레이션(0005)에서 생성
- **참고:** EP-04에서 구축한 DB 테스트 인프라(docker-compose + test-db 헬퍼) 활용

## Milestones

### M1 — 포지션 FSM & 티켓 관리
- Deliverables:
  - `db/migrations/0005` — Ticket, Order 테이블 마이그레이션 (0004는 EP-05 Vector+HNSW)
  - `src/positions/fsm.ts` — Ticket FSM (INITIAL → TP1_HIT → TP2_HIT → CLOSED)
  - `src/positions/ticket-manager.ts` — 티켓 CRUD, 상태 전이, 활성 티켓 조회
  - SymbolState.fsm_state 연동 (WATCHING → HAS_POSITION, HAS_POSITION → IDLE). IDLE → WATCHING은 EP-05 watching.ts 관할
- Acceptance criteria:
  - 유효하지 않은 상태 전이 시 예외 발생
  - 심볼×거래소당 활성 티켓 1개 제약 (피라미딩 제외)
  - SymbolState 변경은 단일 트랜잭션
  - Order 생성 시 Order.exchange === Ticket.exchange 검증 (애플리케이션 레벨)
- Validation:
  - `bun test -- --grep "position-fsm|ticket"`
  - `bun run typecheck`
  - `bun run lint`

### M2 — 포지션 사이징 & 주문 실행
- Deliverables:
  - `src/positions/sizer.ts` — **리스크 역산 사이저** (순수 함수 — DB import 금지, EP-05 패턴 계승)
    - `calculateSize(balance, riskPct, slDistance, maxLeverage, exchangeInfo) → SizeResult` (순수)
    - 1회 최대 손실 = 잔고 × `POSITION.risk_pct` (시드 규모별 티어: 300K KRW → 3%, 30M KRW → 1%)
    - 포지션 크기 = risk_amount ÷ SL_distance (SL 폭 기반 역산)
    - 레버리지 = 포지션 크기에서 역산 (max 38x 하드캡 — 초과 시 포지션 축소)
    - **고정 계약 수/고정 금액 진입 절대 금지** — 김직선 전략 핵심 원칙
    - CommonCode: `POSITION.risk_pct` (시드 티어별), `POSITION.max_leverage` (38x)
  - `src/orders/executor.ts` — 주문 실행기 (진입 + SL 등록 + SL 실패 복구 + bracket/타임아웃 + 모드 가드)
  - `src/orders/slippage.ts` — 슬리피지 체크 (임계치 초과 시 ABORT)
- Acceptance criteria:
  - Decimal.js로 모든 사이징 계산
  - 사이저는 순수 함수 — 백테스트에서 DB 없이 동일 로직 재사용 가능
  - 1회 손실 = 잔고 × risk_pct로 고정 — SL 폭이 달라도 손실 금액은 항상 동일
  - 피라미딩 2차 진입도 동일한 risk_pct 적용 (잔고 기준 재계산)
  - 역산된 레버리지가 max_leverage(38x) 초과 시 포지션 크기 축소 (레버리지 캡 우선)
  - SL이 진입 주문 체결 후 즉시 등록 (다른 어떤 동작보다 선행)
  - SL 등록 실패 시 3회 재시도 → 실패 시 즉시 청산
  - 슬리피지 초과 시 즉시 ABORT + 청산
  - **SL 경쟁 조건 완화**: ExchangeAdapter.createOrder의 stopLoss 파라미터로 bracket order 시도 → 미지원 거래소는 진입 체결 후 SL 등록까지 최대 3초, 초과 시 강제 청산
  - analysis 모드에서 주문 실행 시도 시 하드 에러 (alert/live는 허용 — PRD 7.20)
- Validation:
  - `bun test -- --grep "sizer|executor|slippage"`
  - `bun run typecheck`
  - `bun run lint`

### M3 — 손실 제한
- Deliverables:
  - `src/limits/loss-limit.ts` — 손실 제한 (순수 판정 + DB 갱신 분리)
    - `checkLossLimit(symbolState, config) → LossLimitResult` (순수 함수)
    - `recordLoss(db, symbolId, lossAmount) → void` (DB 사이드이펙트)
    - 일간 손실 10% 한도
    - 세션 손절 3회 한도
    - 시간당 5M 2회 / 1M 1회 한도
- Acceptance criteria:
  - 3단계 손실 제한 모두 동작
  - 모든 손실 계산 Decimal.js 사용
  - 손실 카운터 리셋 규칙 (UTC 00:00, 세션 시작, 매 정시)
  - SymbolState.losses_* 정확 갱신 (db/schema.ts symbolStateTable 직접 접근 — positions 모듈 import 없음)
  - 한도 초과 시 진입 차단 + Slack 알림 (EP-08 이후 연동)
- Validation:
  - `bun test -- --grep "loss-limit"`
  - `bun run typecheck`
  - `bun run lint`

## Task candidates → Generated tasks mapping
- T-06-001: db/schema.ts — Ticket, Order 테이블 Drizzle 스키마 & 마이그레이션(0005)
- T-06-002: positions/fsm.ts — Ticket FSM 상태 전이 (순수 함수 — 유효 전이 검증)
- T-06-003: positions/ticket-manager.ts — 티켓 CRUD + SymbolState.fsm_state 연동 (단일 트랜잭션)
- T-06-004: positions/sizer.ts — 리스크 역산 사이저 (순수 함수 — DB import 금지, Decimal.js)
- T-06-005: orders/executor.ts — 주문 실행기 (진입 + SL 등록 + SL 실패 3회 재시도/강제 청산 + 모드 가드 + bracket order/3초 타임아웃)
- T-06-006: orders/slippage.ts — 슬리피지 체크 & ABORT (순수 판정 + 강제 청산 연동)
- T-06-007: limits/loss-limit.ts — 일간/세션/시간 3단계 손실 제한 (순수 판정 + DB 갱신 분리)
- T-06-008: limits/loss-limit.ts — 손실 카운터 리셋 로직 (UTC 00:00, 세션 시작, 매 정시)
- T-06-009: 포지션 진입 E2E 통합 테스트 (Signal → Sizer → Executor → Ticket 전체 플로우)

### Dependency graph
```
Wave 1 (no EP-06 deps):  T-06-001, T-06-002, T-06-004, T-06-006, T-06-007
Wave 2:                   T-06-003 (→001,002), T-06-008 (→007)
Wave 3:                   T-06-005 (→001,003,006)
Wave 4:                   T-06-009 (→003,004,005,007,008)
```

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
- Transaction 테이블(Ticket, Order)은 이 에픽 마이그레이션(0005)에서 생성
- **순수 함수/DB 분리 패턴 적용** (EP-05 패턴 계승) — sizer.calculateSize()(순수), ticket-manager.createTicket()(DB), loss-limit.checkLossLimit()(순수)/recordLoss()(DB). 백테스트에서 DB 없이 동일 로직 재사용
- **limits → positions 의존성 해결** — limits(L5)는 positions(L5) 모듈을 import하지 않음. SymbolState.losses_* 읽기/쓰기는 db/schema.ts(L1) symbolStateTable 직접 접근으로 레이어 규칙 준수
- **Bracket order 대응** — ExchangeAdapter.createOrder의 stopLoss 파라미터로 bracket order 시도. 미지원 거래소는 2-step fallback (진입 체결 확인 → SL 등록, 3초 타임아웃)
- **executor.ts 단일 소유** — SL 실패 복구, bracket/타임아웃, 모드 가드를 하나의 executor 태스크(T-06-005)에 통합. 파일 소유권 충돌 방지 (EP-05 리뷰 패턴)

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- 2026-04-04: EP-05 리뷰 패턴으로 에픽 리뷰 수행. Critical 2건(마이그레이션 번호 충돌, executor.ts 파일 소유권 4건 충돌), Important 5건(전제조건 갱신, 검증 명령 보완, 레이어 의존성 해결, 순수함수 패턴 적용, exchange 정합성 검증), Minor 4건 수정 완료.
- 2026-04-04: 태스크 후보 11개→9개로 통합. executor.ts 소유 태스크 4개를 1개로 병합. loss-limit 리셋 로직 별도 태스크 분리.
- 2026-04-04: 태스크 생성 완료 (9개). 의존성: Wave1(001,002,004,006,007) → Wave2(003→001+002, 008→007) → Wave3(005→001+003+006) → Wave4(009→all). 4 Waves.

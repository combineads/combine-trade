# 11-financial-arithmetic

## Objective
무기한 선물 거래의 수수료(maker/taker fee), 펀딩비(funding rate), 소수점 정밀도를 정확히 처리하여 PnL 계산과 의사결정의 재무적 정확성을 보장한다. JavaScript 부동소수점 오류를 근본적으로 제거하고, 거래소별 precision 규칙을 준수한다.

## Scope
- `packages/shared/decimal/` — 소수점 정밀도 유틸리티 (Decimal.js 래퍼)
- `packages/core/fee/` — 수수료/펀딩비 계산 엔진
- `packages/exchange/` — 거래소별 precision 규칙 (tick size, lot size, min notional)
- 기존 모듈 PnL 계산 수정: label, backtest, risk, execution

## Non-goals
- 세금 계산
- 회계 보고서 생성
- 과거 펀딩비 수익 최적화 전략

## Prerequisites (milestone-level)
- M1 (Decimal layer): EP00-M2 only (can start in Phase 2a, parallel with EP01/EP02)
- M2 (Fee engine): EP00-M3, EP01-M1
- M3 (Funding rate): EP01-M1 (exchange adapter for funding rate API)
- M4 (PnL integration): EP11-M1, EP11-M2, EP04-M3

<!-- Context notes: `00-project-bootstrap` M2 (모노레포), M3 (DB) / `01-candle-collection` M1 — 거래소 어댑터 (펀딩비 조회 추가) -->

## Milestones

### M1 — Decimal precision layer
- Deliverables:
  - `packages/shared/decimal/` — Decimal.js 기반 정밀 산술 래퍼
  - 모든 금융 계산에 사용할 표준 함수: add, sub, mul, div, round
  - 거래소별 precision 메타데이터 캐시:
    - price precision (tick size): 예) BTCUSDT = 0.10
    - quantity precision (lot size): 예) BTCUSDT = 0.001
    - min notional value: 예) BTCUSDT = 5 USDT
  - 주문 수량/가격 자동 반올림: 거래소 규칙 준수
  - precision 메타데이터 주기적 갱신: Precision metadata is populated by candle-collector worker (EP01) calling fetchMarkets() through packages/exchange/. packages/shared/decimal/ reads cached metadata from the exchange_metadata table — never calls exchange APIs directly.
- Acceptance criteria:
  - `0.1 + 0.2 === 0.3` 정밀도 보장 (IEEE 754 오류 없음)
  - 거래소 tick size/lot size 위반 시 주문 전 에러
  - 모든 PnL 계산이 Decimal 기반
  - precision 캐시 갱신 정상 작동
  - Rounding mode for order quantities: ROUND_DOWN (truncate) — ROUND_UP would exceed available balance
  - Rounding mode for display/reporting: ROUND_HALF_UP (standard financial rounding)
  - Exchange-specific precision: exchange_metadata cache populated by EP01 candle-collector via fetchMarkets(), refreshed every 24 hours; packages/shared/decimal/ reads from cache only
- Validation:
  ```bash
  bun test -- --filter "decimal|precision"
  ```

### M2 — Fee calculation engine
- Deliverables:
  - `packages/core/fee/calculator.ts` — 수수료 계산기
  - 거래소별 수수료율 관리:
    - Binance: maker 0.02%, taker 0.04% (기본, VIP별 차등)
    - OKX: maker 0.02%, taker 0.05% (기본)
  - 주문별 수수료 계산: `fee = quantity × price × fee_rate`
  - 수수료 포함 실효 진입/이탈 가격 계산
  - 수수료 후 순 PnL 계산
  - 수수료율 DB 저장 + 수동 업데이트 (VIP 등급 변경 시)
- Acceptance criteria:
  - Market(taker) 주문 시 taker fee 적용
  - Limit(maker) 주문 시 maker fee 적용
  - 수수료 반영 PnL이 거래소 실제 결과와 일치
  - 왕복(진입+이탈) 수수료 정확히 계산
- Validation:
  ```bash
  bun test -- --filter "fee"
  ```

### M3 — Funding rate tracking
- Deliverables:
  - 펀딩비 데이터 수집: 거래소 API로 8시간마다 펀딩비 조회
  - `funding_rates` 테이블: exchange, symbol, funding_rate, funding_time
  - 포지션 보유 중 누적 펀딩비 계산
  - 백테스트 시 과거 펀딩비 반영 옵션
  - 실시간 펀딩비 모니터링: 극단적 펀딩비 시 경고
- Acceptance criteria:
  - 8시간마다 펀딩비 자동 수집 및 저장
  - 포지션 보유 기간 동안 누적 펀딩비 정확히 계산
  - 백테스트에서 펀딩비 반영 시 PnL 차이 확인 가능
  - 펀딩비 ≥ 0.1% 시 WARNING 로그
- Validation:
  ```bash
  bun test -- --filter "funding"
  ```

### M4 — PnL pipeline integration
- Deliverables:
  - 라벨링 엔진 수정: pnl_pct에 수수료 반영 옵션
  - 백테스트 리포트에 수수료/펀딩비 영향 분리 표시:
    - gross PnL (수수료 전)
    - net PnL (수수료 후)
    - total fees paid
    - total funding received/paid
  - 의사결정 엔진: net expectancy 기준 판단 옵션
  - 포지션 사이징: 수수료 고려한 실효 리스크 계산
- Acceptance criteria:
  - gross vs net PnL 차이가 수수료+펀딩비와 정확히 일치
  - 백테스트 리포트에 수수료 impact 표시
  - 의사결정이 net expectancy 기준으로 동작 가능
- Validation:
  ```bash
  bun test -- --filter "pnl-integration|fee-impact"
  ```

### Boundary rule compliance
packages/shared/decimal/ must not call exchange APIs directly. Precision metadata (tick sizes, lot sizes) is fetched by packages/exchange/ or workers, then cached in DB. packages/shared/decimal/ reads from the cache only.

## Task candidates
- T-11-001: Implement Decimal.js wrapper with standard financial arithmetic functions
- T-11-002: Implement exchange precision validator (tick size, lot size, min notional)
- T-11-003: Implement fee calculator with maker/taker rates per exchange
- T-11-004: Implement funding rate calculator (pure arithmetic)
- T-11-005: Financial arithmetic integration test
- T-11-006: Implement funding rate collector service (collect + persist)
- T-11-007: Funding rate collector service (with accumulation and warning)
- T-11-008: PnL integration with fees and funding

## Risks
- Decimal.js 성능 오버헤드: 대량 백테스트 시 네이티브 float 대비 10-50배 느릴 수 있음
  - 완화: 핫 경로에서는 정밀도 영향 분석 후 선택적 적용, 벡터 검색은 float 유지
- 거래소 VIP 등급별 수수료율이 시간에 따라 변동
  - 완화: 수수료율 DB 저장 + 수동 갱신 UI
- 과거 펀딩비 데이터의 가용성 (일부 거래소 제한적)
  - 완화: 사용 가능한 범위만 적용, 미가용 시 0% 가정 + 경고

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Decimal.js 선택 (BigInt 아님) | 소수점 연산 지원, 금융 표준, 커뮤니티 검증 |
| 2026-03-21 | 수수료를 PnL 파이프라인에 옵션으로 통합 | 기존 gross PnL 기반 로직 호환 유지 |
| 2026-03-21 | 펀딩비는 수집하되 의사결정에는 참고용 | 8시간 주기 특성상 단기 매매 의사결정에 직접 영향 제한적 |
| 2026-03-21 | Decimal.js 적용 경계: 지표=float, PnL=Decimal | 기술지표 계산은 float 성능이 필수(대량 백테스트), PnL/수수료/잔고는 정확성이 필수. 경계: strategy sandbox 출력(features)은 float, fee/PnL 계산부터 Decimal |

## Progress notes
- 2026-03-22: Tasks generated — T-11-001 (decimal wrapper), T-11-002 (precision validator), T-11-003 (fee calculator), T-11-004 (funding rate), T-11-005 (integration test).
- 2026-03-22: M1 (decimal precision) and M2 (fee engine) core logic completed. M3 (funding rate collection) and M4 (PnL pipeline integration) deferred (require DB/exchange). 542 tests passing.
- 2026-03-25: Task files migrated from T-NNN to T-11-NNN naming. T-11-006 (funding collector, EP11 M3), T-11-007 (funding collector with accumulation), T-11-008 (PnL integration, EP11 M4) added from backlog.

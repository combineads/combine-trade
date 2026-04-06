# EP-22: 운영 버그픽스 — 기존 구현 누락 및 결함 수정

## Objective

신규 기능 개발 전에 기존 구현의 스텁, 미연결, 결함을 체계적으로 수정한다.
이 에픽은 **상시 운영용**으로, 발견되는 버그를 태스크로 등록하여 추적한다.

## Scope

- 백테스트 CLI 스텁 해소 (캔들 로딩, MockAdapter, 전략 콜백)
- 기존 모듈 간 미연결 배선 수정
- 런타임 결함 및 데이터 흐름 버그
- 테스트 누락으로 인한 사각지대 보완

## Non-goals

- 신규 기능 추가 (별도 에픽으로 관리)
- 대규모 리팩터링 또는 아키텍처 변경
- 성능 최적화 (명확한 버그가 아닌 한)

## Prerequisites

- 없음 (상시 운영 에픽)

## Milestones

### M1 — 백테스트 캔들 파이프라인 연결

- **Deliverables:**
  - `cli.ts`의 `loadCandles` 스텁을 실제 DB 조회로 교체
  - 백테스트 실행 시 캔들이 DB에 없으면 `syncCandles()`로 자동 다운로드
  - MockExchangeAdapter에 로딩된 캔들 전달
- **Acceptance criteria:**
  - `bun run backtest -- --symbol BTCUSDT --start 2023-01-01 --end 2023-07-01` 실행 시 캔들이 로딩되고 totalCandles > 0
- **Validation:**
  ```bash
  bun test
  bun run typecheck
  bun run backtest -- --symbol BTCUSDT --start 2023-01-01 --end 2023-03-01
  # totalCandles > 0 확인
  ```

### M2 — 백테스트 전략 콜백 연결

- **Deliverables:**
  - no-op 전략 콜백을 실제 시그널 파이프라인으로 교체
  - `detectWatching` → `checkEvidence` → `checkSafety` → 주문 실행 흐름 연결
  - 인디케이터 계산(`calcAllIndicators`) 통합
- **Acceptance criteria:**
  - 백테스트 실행 시 총 거래 > 0 (유효한 시그널이 있는 기간 기준)
  - WFO 모드에서 valid windows > 0
- **Validation:**
  ```bash
  bun test
  bun run typecheck
  bun run backtest -- --symbol BTCUSDT --start 2023-01-01 --end 2023-07-01
  # 총 거래 > 0 확인
  bun run backtest -- --mode wfo --symbol BTCUSDT --start 2023-01-01 --end 2024-01-01
  # valid windows > 0 확인
  ```

### M3 — 추가 버그픽스 (상시)

- **Deliverables:** 발견되는 버그를 태스크로 등록하여 순차 처리
- **Acceptance criteria:** 각 태스크별 개별 AC 충족
- **Validation:** 태스크별 개별 검증

## Task candidates

| ID | 제목 | 설명 |
|----|------|------|
| T-22-001 | backtest-candle-loading | cli.ts loadCandles 스텁을 syncCandles + getCandles로 교체 |
| T-22-002 | backtest-mock-adapter-wiring | MockExchangeAdapter에 로딩된 캔들 전달 |
| T-22-003 | backtest-strategy-callback | no-op 전략 콜백을 시그널 파이프라인으로 교체 |
| T-22-004 | backtest-wfo-integration | WFO 모드에서 동일한 캔들 로딩 + 전략 연결 적용 |
| T-22-005+ | (상시 등록) | 운영 중 발견되는 버그를 여기에 추가 |

## Risks

| 리스크 | 완화 |
|--------|------|
| 캔들 다운로드 시간이 길어 백테스트 첫 실행이 느림 | 진행률 로그 출력, 이미 DB에 있는 캔들은 스킵 |
| 전략 연결 후 시그널이 여전히 0건 | 인디케이터 값 디버그 로그로 중간 검증 |
| MockAdapter 시간순 제약 위반 (lookahead bias) | 기존 temporal ordering 로직 유지, 테스트로 검증 |

## Decision log

| 날짜 | 결정 | 이유 |
|------|------|------|
| 2025-04-06 | 운영 에픽으로 통합 관리 | 산발적 버그를 개별 에픽으로 만들면 관리 비용이 높음 |
| 2025-04-06 | M1/M2를 백테스트에 집중 | 현재 가장 시급한 버그가 백테스트 CLI 스텁 |

## Progress notes

- 2025-04-06: EP-22 생성. 백테스트 CLI 스텁 3건 확인 (loadCandles, MockAdapter candles, strategy callback).

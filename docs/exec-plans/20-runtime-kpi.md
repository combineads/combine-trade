# EP-20: 런타임 KPI 모니터링

## Objective

PRD §9 런타임 KPI 경고 시스템을 구현한다. MDD 초과, 최대 연속 손실 갱신, expectancy 음수 전환, Reconciliation 일치율 저하를 실시간 감지하여 Slack으로 경고한다. `src/kpi/` (L7) 신규 모듈을 생성하고 데몬 파이프라인에 통합한다.

## Scope

- `src/kpi/` (신규 L7 모듈): KPI 계산기, 경고 임계치 판정, 중복 방지
- `src/notifications/slack.ts`: KPI 알림 템플릿 4종 추가
- `src/daemon/pipeline.ts` + `src/daemon.ts`: KPI 체크 포인트 연결
- `docs/ARCHITECTURE.md`: kpi 모듈 "미구현" 표기 제거, Public API 갱신

## Non-goals

- KPI 대시보드 웹 UI (Slack 알림이 주 채널, Dashboard TodayPerformance로 보조)
- KPI 기반 자동 매매 중단 (알림만, 판단은 운영자 — PRD §9 명시)
- 히스토리컬 KPI 분석/리포트
- backtest/metrics.ts 리팩터링 (기존 코드 유지, kpi 모듈은 별도 구현)

## Prerequisites

- EP-07 (exits-labeling) 완료 ✅ — Ticket CLOSED + result/pnl 확정
- EP-08 (safety-net) 완료 ✅ — Reconciliation worker + Slack 알림 + EventLog
- EP-18 (prd-critical-fixes) 완료 ✅ — Vector 라벨링 closeTicket 단일 TX 연결
- **참고:** backtest/metrics.ts에 maxDrawdown, maxConsecutiveLosses 계산 로직 존재하나, 이는 배치 백테스트용. KPI 모듈은 런타임 증분 계산이므로 별도 구현

## Milestones

### M1 — KPI 계산기 (순수 함수)

- Deliverables:
  - `src/kpi/calculator.ts` — 4개 KPI 계산기 (순수 함수, DB import 금지):
    - `calcMDD(balanceHistory: {date: string, balance: Decimal}[]) → Decimal`: 최고점 대비 최대 하락폭 %
    - `calcConsecutiveLosses(results: TicketResult[]) → {current: number, max: number}`: 현재 + 역대 최대
    - `calcRecentExpectancy(pnls: Decimal[], commissionPct: Decimal) → Decimal`: 최근 N건 평균 PnL (수수료 차감)
    - `calcReconciliationRate(matched: number, total: number) → Decimal`: 일치율 %
  - `src/kpi/thresholds.ts` — 경고 임계치 (CommonCode `KPI` 그룹에서 로드):
    - MDD > 10% → 경고
    - 연속 손실 역대 최대 갱신 → 경고
    - 최근 30건 expectancy < 0 → 경고
    - Reconciliation 일치율 < 99% → 경고
  - `src/kpi/types.ts` — KpiCheckResult, KpiThresholds 타입
- Acceptance criteria:
  - 4개 KPI 각각 정확히 계산 (단위 테스트)
  - MDD: balance 히스토리 기반, Decimal.js 사용
  - 연속 손실: 최근→과거 역순 스캔, current + max 동시 반환
  - expectancy: 수수료 차감 후 평균 (commissionPct 파라미터)
  - 임계치가 CommonCode에서 로드 가능 (하드코딩 기본값 + CommonCode 오버라이드)
- Validation:
  - `bun test -- --grep "kpi-calculator"`
  - `bun run typecheck`

### M2 — KPI 데이터 수집기 (DB 조회)

- Deliverables:
  - `src/kpi/collector.ts` — DB에서 KPI 입력 데이터 수집:
    - `getBalanceHistory(db, exchange, days) → BalanceEntry[]`: 일간 잔고 히스토리 (Ticket PnL 누적)
    - `getRecentTicketResults(db, n) → TicketResult[]`: 최근 N건 거래 결과
    - `getRecentPnls(db, n) → Decimal[]`: 최근 N건 PnL 배열
    - `getReconciliationStats(db, hours) → {matched, total}`: 최근 N시간 대조 통계
  - `src/kpi/state.ts` — 중복 경고 방지 상태:
    - `KpiAlertState`: 각 KPI별 마지막 경고 시점 + 해소 여부
    - MDD가 10% 미만 복귀 → 다음 초과 시 재경고 허용
    - 연속 손실은 매번 최대 갱신 시에만 (같은 값 반복 안 함)
- Acceptance criteria:
  - balance 히스토리가 Ticket.closed_at + pnl 기반 누적 (정확)
  - Reconciliation 통계가 EventLog RECONCILIATION 이벤트 기반
  - 중복 방지: 동일 조건 해소 전 재발송 안 됨
- Validation:
  - `bun test -- --grep "kpi-collector|kpi-state"`
  - `bun run typecheck`

### M3 — Slack 알림 + EventLog + 데몬 통합

- Deliverables:
  - `src/notifications/slack.ts` 확장 — KPI 알림 템플릿 4종:
    - `⚠️ MDD {pct}% — 10% 초과`
    - `⚠️ 전략 점검 필요: 연속 {n}회 손실 (역대 최대 갱신)`
    - `⚠️ 최근 30건 expectancy 음수 전환: {value}`
    - `⚠️ Reconciliation 일치율 {pct}% — 99% 미만`
  - EventLog 새 event_type 3종: `MDD_WARNING`, `CONSECUTIVE_LOSS_RECORD`, `EXPECTANCY_WARNING`
  - `src/kpi/index.ts` — `checkAllKpis(db, deps) → KpiCheckResult[]` 통합 API
  - `src/daemon/pipeline.ts` 수정 — Ticket CLOSED 이벤트에 KPI 체크 연결:
    - 연속 손실 + expectancy: Ticket CLOSED 시 즉시
    - MDD: 1시간 주기 (과도한 DB 부하 방지)
    - Reconciliation rate: reconciliation worker 완료 시
  - `src/daemon.ts` 수정 — KPI 체커 시작/종료를 daemon lifecycle에 통합
  - `docs/ARCHITECTURE.md` 수정 — kpi 모듈 "미구현" 표기 제거
- Acceptance criteria:
  - 각 임계치 초과 시 Slack 알림 + EventLog 기록
  - Ticket CLOSED → 500ms 이내 연속 손실/expectancy 체크
  - MDD 체크 1시간 주기 정확 (setTimeout 체인)
  - daemon 시작 시 KPI 체크 포인트 등록, 셧다운 시 정리
  - ARCHITECTURE.md에서 "EP-16 미구현" 문구 제거
- Validation:
  - `bun test -- --grep "kpi"`
  - `bun run typecheck && bun run lint`
  - `bun run build`

## Task candidates

- T-20-001: kpi/types.ts + kpi/calculator.ts — 4개 KPI 순수 함수 (MDD, 연속손실, expectancy, reconciliation rate)
- T-20-002: kpi/thresholds.ts — CommonCode KPI 그룹 시드 + 경고 임계치 로더
- T-20-003: kpi/collector.ts — DB 조회 (balance history, recent tickets, reconciliation stats)
- T-20-004: kpi/state.ts — 중복 경고 방지 상태 관리 (해소 전 재발송 억제)
- T-20-005: notifications/slack.ts — KPI 알림 템플릿 4종 + EventLog event_type 3종
- T-20-006: kpi/index.ts — checkAllKpis() 통합 API
- T-20-007: daemon 통합 — Ticket CLOSED 이벤트 + 1시간 MDD + reconciliation 완료 연결
- T-20-008: ARCHITECTURE.md 갱신 — kpi 모듈 "미구현" 제거 + Public API 추가
- T-20-009: KPI E2E 통합 테스트 (mock 데이터로 알림 발송 경로 검증)

## Risks

- **DB 부하**: MDD 계산이 전체 Ticket 히스토리 스캔. **완화**: 1시간 주기 + 일간 집계 캐시.
- **중복 경고 폭주**: 임계치 근처에서 반복 경고. **완화**: KpiAlertState로 "해소" 상태까지 재발송 억제.
- **expectancy 미달 오경보**: 30건 미만에서 통계적 무의미 경고. **완화**: min_samples 30 이상일 때만 경고.
- **daemon 이벤트 루프 점유**: KPI DB 쿼리가 파이프라인을 지연. **완화**: 비동기 실행 + 쿼리 타임아웃 5초.

## Decision log

- **KPI는 알림만, 자동 중단 아님**: PRD §9 명시. 자동 매매 중단은 Loss Limit이 담당.
- **L7 모듈 배치**: kpi는 reconciliation/notifications과 같은 L7. core, db 의존.
- **backtest/metrics.ts와 별개**: metrics.ts는 배치 백테스트 후 전체 기간 집계. kpi는 런타임 증분 계산 (최근 N건, 최근 N시간). 코드 공유보다 독립 구현이 명확.
- **MDD 1시간 주기**: Ticket CLOSED마다 계산은 합리적이나, 미실현 PnL 기반 MDD는 가격 데이터 필요 → 과도. 1시간 주기로 제한.
- **CommonCode KPI 그룹 신설**: mdd_threshold(10), consecutive_loss_alert(true), expectancy_sample_count(30), reconciliation_rate_threshold(99)

## Progress notes

- 2026-04-06: 에픽 생성. PRD §9 기반 + 코드 갭 분석 결과.

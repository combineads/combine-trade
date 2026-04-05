# 16-runtime-kpi

## Objective
PRD §9 런타임 KPI 경고 기준과 §7.22 Slack 알람 중 누락된 항목을 구현한다. MDD 초과, 최대 연속 손실 갱신, expectancy 음수 전환, Reconciliation 일치율 저하를 실시간 감지하여 Slack으로 경고한다.

## Scope
- `src/kpi/` (신규 L7 모듈) — KPI 계산 & 경고 판정
- `src/notifications/` — 새 Slack 알림 템플릿 추가
- `src/daemon/` — KPI 체커를 Ticket CLOSED 이벤트에 연결
- `docs/RELIABILITY.md` — KPI 모니터링 섹션 추가
- `docs/PRODUCT.md` — 런타임 KPI 섹션 보강

## Non-goals
- KPI 대시보드 웹 UI (향후 에픽)
- KPI 기반 자동 매매 중단 (알림만, 판단은 운영자)
- 히스토리컬 KPI 분석/리포트

## Prerequisites
- EP-07 (exits-labeling) 완료 ✅ — Ticket CLOSED + result/pnl 확정
- EP-08 (safety-net) 완료 ✅ — Reconciliation + Slack 알림 인프라
- EP-11 (api-web) 완료 ✅ — 웹 UI 기본 인프라

## Milestones

### M1 — KPI 계산 엔진
- Deliverables:
  - `src/kpi/calculator.ts` — KPI 계산기:
    - `calcMDD()`: 최고점 대비 최대 하락폭 계산 (일간 기준)
    - `calcConsecutiveLosses()`: 현재 연속 손실 횟수 + 역대 최대
    - `calcRecentExpectancy(n)`: 최근 n건 expectancy (기본 30건)
    - `calcReconciliationRate()`: 최근 24시간 Reconciliation 일치율
  - `src/kpi/thresholds.ts` — 경고 임계치 (PRD §9):
    - MDD > 10% → 경고
    - 연속 손실 역대 최대 갱신 → 경고
    - 최근 30건 expectancy < 0 → 경고
    - Reconciliation 일치율 < 99% → 경고
  - `tests/kpi/calculator.test.ts` — 단위 테스트
- Acceptance criteria:
  - 4개 KPI 각각 정확히 계산
  - MDD: balance 히스토리 기반, 수수료 차감 후
  - 연속 손실: Ticket.result = 'LOSS' 연속 카운트
  - expectancy: 최근 30건 평균 pnl (수수료 0.08% 차감)
  - Reconciliation: EventLog RECONCILIATION 이벤트에서 matched/mismatched 집계
- Validation:
  - `bun test -- --grep "kpi-calculator"`

### M2 — Slack 알림 & EventLog 확장
- Deliverables:
  - `src/notifications/` — 새 알림 템플릿:
    - `⚠️ 전략 점검 필요: 연속 {n}회 손실 (역대 최대 갱신)`
    - `⚠️ MDD {pct}% — 10% 초과`
    - `⚠️ 최근 30건 expectancy 음수 전환: {value}`
    - `⚠️ Reconciliation 일치율 {pct}% — 99% 미만`
  - EventLog 새 event_type:
    - `CONSECUTIVE_LOSS_RECORD` — data: `{ count, previous_max, symbols }`
    - `MDD_WARNING` — data: `{ mdd_pct, peak_balance, current_balance }`
    - `EXPECTANCY_WARNING` — data: `{ expectancy, sample_count, recent_trades }`
  - `tests/notifications/kpi-alerts.test.ts`
- Acceptance criteria:
  - 각 임계치 초과 시 Slack 알림 발송 (1회/이벤트, 중복 방지)
  - EventLog에 경고 이력 기록
  - 중복 경고 방지: 동일 조건이 해소되기 전까지 재발송하지 않음
- Validation:
  - `bun test -- --grep "kpi-alerts"`

### M3 — 데몬 통합 & 문서화
- Deliverables:
  - `src/daemon/` — KPI 체크 포인트 연결:
    - Ticket CLOSED 시: 연속 손실 + expectancy 체크
    - 1시간 주기: MDD 체크
    - Reconciliation 완료 시: 일치율 체크
  - `docs/RELIABILITY.md` — "런타임 KPI 모니터링" 섹션 추가
  - `docs/PRODUCT.md` — "런타임 KPI" 섹션 보강 (PRD §9 내용 반영)
  - `docs/DATA_MODEL.md` — EventLog event_type 규약 업데이트
- Acceptance criteria:
  - KPI 체크가 데몬 생명주기에 포함 (시작/종료)
  - MDD 체크 주기: 1시간 (과도한 DB 부하 방지)
  - 연속 손실/expectancy 체크: Ticket CLOSED 이벤트 기반 (실시간)
  - 관련 문서 업데이트 완료
- Validation:
  - `bun test`
  - `bun run typecheck && bun run lint`
  - 문서 수동 검증

## Task candidates
- T-16-001: KPI 계산기 구현 (MDD, 연속 손실, expectancy, reconciliation rate) (M1)
- T-16-002: KPI 경고 임계치 & 중복 방지 로직 (M1)
- T-16-003: KPI Slack 알림 템플릿 + EventLog event_type 추가 (M2)
- T-16-004: 데몬 KPI 체크 포인트 통합 (M3)
- T-16-005: 문서 업데이트 (RELIABILITY.md, PRODUCT.md, DATA_MODEL.md) (M3)

## Risks
- **DB 부하**: MDD 계산이 전체 Ticket 히스토리를 스캔할 수 있음. **완화**: 일간 집계 캐시, 1시간 주기 제한.
- **중복 경고 폭주**: 임계치 근처에서 반복 경고. **완화**: 경고 발송 후 "해소" 상태까지 재발송 억제 (예: MDD가 10% 미만으로 복귀할 때까지).
- **expectancy 계산 시점**: 30건 미만일 때 의미 없는 경고 발생. **완화**: min_samples 30 이상일 때만 경고.

## Decision log
- **KPI는 알림만, 자동 중단 아님**: PRD가 "경고 기준"이라 명시. 자동 매매 중단은 Loss Limit이 담당. KPI는 운영자 판단 보조.
- **L7 모듈 배치**: kpi는 reconciliation/notifications과 같은 L7. db, config, exchanges(via ports) 의존.
- **MDD 1시간 주기**: 실시간 MDD 계산은 과도. Ticket CLOSED마다는 합리적이나, 미실현 PnL 기반 MDD는 1시간 주기로 제한.

## Consensus Log
- (계획 단계)

## Progress notes
- 2026-04-05: 에픽 계획 작성. PRD §9의 4개 KPI 경고 기준 + §7.22 연속 패배 알림 구현 범위 확정.

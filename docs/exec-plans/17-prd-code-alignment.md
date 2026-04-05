# 17-prd-code-alignment

## Objective
PRD v2.0과 docs/ 문서에 명시된 요구사항 중, 기존 코드에 누락되거나 불일치하는 항목을 검증하고 수정한다. EP-17(문서 보강)의 잔여 항목과 EP-20(이체 수익 기반 전환)을 흡수하여, PRD-코드 정합성을 단일 에픽에서 관리한다.

## Scope
검증/수정 대상 코드 영역:
- `src/signals/` — 1M 노이즈 필터, 5M/1M 동시 신호 처리
- `src/knn/` — A급 완화 조건, 수수료 0.08% 차감, net_expectancy
- `src/transfer/` — calculateTransfer() 수익 기반 이체 + 안전장치
- `src/web/` — 거래 내역 성과 요약 (expectancy, 최대 연속 손실)
- `src/config/seed.ts` — KNN commission_pct 시드
- `tests/core/types.test.ts` — CommonCodeGroup 테스트 정합성 (TRANSFER 누락)
- `docs/decisions/` — Investing.com API 접근 방식 ADR (EP-17 M3 흡수)

## Non-goals
- 벡터 구조 변경 (EP-15 범위)
- 런타임 KPI 구현 (EP-16 범위)
- 보안 강화 (EP-19 범위)
- 이체 실행기(executor) 변경 — CCXT transfer() 호출 로직은 EP-14 그대로
- 이체 스케줄러 타이밍 변경 — UTC 00:30 유지

## Prerequisites
- EP-05 (signal-pipeline) 완료 ✅
- EP-06 (position-management) 완료 ✅
- EP-08 (safety-net) 완료 ✅
- EP-10 (strategy-alignment) 완료 ✅
- EP-14 (auto-transfer) 완료 ✅

## Milestones

### M1 — 1M 노이즈 필터 & 동시 신호 검증 (PRD §7.7, §7.16)
- Deliverables:
  - `src/signals/` 코드 검증:
    - 1M 진입 시 5M MA20 방향 ≠ 일봉 방향이면 PASS 처리 확인
    - 5M/1M 동시 신호 발생 시 1M 우선 로직 확인
    - 1H BB4 터치 시 A급 플래그 설정 확인
  - 누락 시 구현 + 테스트
- Acceptance criteria:
  - 1M 진입 전 5M MA20 방향 검증이 코드에 존재
  - 동시 신호 시 1M이 우선 실행됨
  - `Signal.a_grade = true` 조건이 PRD §7.16과 일치
- Validation:
  - `bun test -- --grep "noise-filter|simultaneous"`
  - `bun run typecheck`

### M2 — KNN A급 완화 & 수수료 차감 (PRD §7.9)
- Deliverables:
  - `src/knn/` 코드 검증:
    - A급 시 min_winrate → 50%, min_samples → 20 완화 적용 확인
    - net_expectancy 계산에 수수료 0.08% 차감 확인
    - 수수료율이 CommonCode `KNN / commission_pct`에서 읽히는지 확인
  - `src/config/seed.ts` — `KNN / commission_pct = 0.08` 시드 확인
  - 누락 시 구현 + 테스트
- Acceptance criteria:
  - `a_grade=true`일 때 KNN 판정 기준이 완화됨
  - expectancy = mean(pnl) - 2 × commission_pct (진입+청산)
  - commission_pct가 하드코딩이 아닌 CommonCode에서 로드
- Validation:
  - `bun test -- --grep "knn.*a.grade|knn.*commission|expectancy"`
  - `bun run typecheck`

### M3 — 이체 로직 수익 기반 전환 (PRD §7.20, 舊 EP-20 흡수)
EP-14에서 구현된 잉여 잔고 기반 이체를 **당일 실현 수익 기반**으로 전환한다.
핵심 변경: `available = walletBalance - margin - reserve` → `dailyProfit × transferPct / 100`

- Deliverables:
  - `src/transfer/balance.ts` — `calculateTransfer()` 수익 기반 재작성:
    - amount = max(0, dailyProfit) × transferPct / 100
    - amount < min_transfer_usdt → skip
    - balance - amount < margin + reserve → skip (안전장치)
    - reserve = max(balance × riskPct × reserveMultiplier, 50 USDT)
  - `src/transfer/scheduler.ts` — `getDailyProfit()` 연동:
    - SUM(ticket.pnl) WHERE closed_at >= today UTC 00:00 AND exchange = ?
  - `src/transfer/executor.ts` — EventLog data에 `daily_profit` 필드 추가
  - `src/config/seed.ts` — TRANSFER 그룹 시드 정리
  - `tests/transfer/` — balance.test.ts 전면 재작성, scheduler.test.ts 수정, E2E 수정
  - `scripts/transfer-now.ts` — dry-run에 dailyProfit 표시
- Acceptance criteria:
  - 이체 금액 = max(0, dailyProfit) × transferPct / 100
  - 안전장치: 이체 후 잔고 < margin + reserve → skip
  - 손실/무거래 날 → 이체 없음
  - EventLog에 daily_profit 기록
  - 모든 계산 Decimal.js
- Validation:
  - `bun test -- --grep "calculateTransfer|transfer-scheduler|transfer-e2e"`
  - `bun run typecheck && bun run lint`

### M4 — 거래 내역 성과 요약 UI (PRD §7.23)
- Deliverables:
  - `src/web/` 거래 내역 페이지 검증:
    - 성과 요약에 expectancy 카드 존재 확인
    - 성과 요약에 최대 연속 손실 카드 존재 확인
  - `src/api/` — 거래 내역 API에서 expectancy, 최대 연속 손실 반환 확인
  - 누락 시 구현
- Acceptance criteria:
  - 거래 내역 페이지 상단에 7개 성과 카드 (총 수익, 총 거래, 승률, expectancy, 평균 손익비, MDD, 최대 연속 손실)
  - expectancy는 수수료 0.08% 차감 후 값
- Validation:
  - `bun test -- --grep "trade-history|stats"`
  - `bun run build` (프론트엔드 빌드 성공)

### M5 — CommonCodeGroup 테스트 정합성 (types.test.ts)
- Deliverables:
  - `tests/core/types.test.ts` — CommonCodeGroup 테스트 수정:
    - `TRANSFER` 값 추가 (현재 누락)
    - count assertion 12 → 13 수정
  - 코드(types.ts)에는 NOTIFICATION + TRANSFER 모두 존재하나 테스트에 TRANSFER만 누락
- Acceptance criteria:
  - CommonCodeGroup 테스트가 실제 타입 정의와 일치 (13개 그룹)
  - `bun test -- --grep "CommonCodeGroup"` 통과
- Validation:
  - `bun test`
  - `bun run typecheck`

### M6 — Investing.com API 결정 문서화 (舊 EP-17 M3 흡수)
- Deliverables:
  - `docs/decisions/ADR-004-economic-calendar-source.md` 작성:
    - 선택지: Investing.com API / 스크래핑 / 수동 입력 / 대안 API
    - 결정과 근거
    - fail-closed 정책 명시 (API 실패 시 거래차단 활성화)
  - `docs/PRODUCT.md` Open questions에서 해당 항목 업데이트
- Acceptance criteria:
  - ADR이 선택지, 결정, 근거를 포함
  - 관련 문서의 "미확정" 상태가 해소됨
- Validation:
  - ADR 수동 검증

## Task candidates
- T-18-001: 1M 노이즈 필터 코드 검증/수정 (M1)
- T-18-002: 5M/1M 동시 신호 1M 우선 로직 검증/수정 (M1)
- T-18-003: KNN A급 완화 조건 검증/수정 (M2)
- T-18-004: KNN 수수료 차감 (commission_pct) 검증/수정 (M2)
- T-18-005: calculateTransfer() 수익 기반 재작성 + getDailyProfit() (M3)
- T-18-006: 스케줄러 dailyProfit 연동 + EventLog 필드 추가 (M3)
- T-18-007: 이체 E2E 테스트 수정 + CommonCode seed 정리 + dry-run (M3)
- T-18-008: 거래 내역 성과 요약 expectancy + 최대 연속 손실 카드 (M4)
- T-18-009: CommonCodeGroup 테스트에 TRANSFER 추가 + count 수정 (M5)
- T-18-010: ADR-004 경제지표 소스 결정 문서 (M6)

## Risks
- **기존 테스트 깨짐**: A급 완화나 수수료 차감 추가 시 기존 KNN 테스트가 실패할 수 있음. **완화**: 기존 테스트 assertion 값을 PRD 기준으로 업데이트.
- **이체 테스트 대량 변경**: EP-14에서 작성한 transfer 테스트가 잉여 잔고 기반. **완화**: M3에서 balance.test.ts 전면 재작성, E2E 검증.
- **당일 PnL 계산 정확성**: Ticket.closed_at 기준 UTC 날짜 경계. **완화**: UTC 00:00 기준 명확히 정의, 타임존 관련 테스트 추가.
- **프론트엔드 미구현**: EP-11(api-web)에서 기본 화면만 구현했다면 성과 요약 카드가 아직 없을 수 있음. **완화**: M4는 가장 마지막에 진행.
- **Investing.com API 결정 지연**: 실제 API 테스트 없이 결정이 어려울 수 있음. **완화**: ADR에 "spike 필요" 표기하고, fail-closed 정책은 선결정.

## Decision log
- **EP-17/EP-20 통합 (2026-04-05)**: EP-17은 M1/M2 완료·M4 void로 실질 폐쇄, M3만 이관. EP-20은 원래 EP-18 M3에서 분리된 것으로, 동일 테마(PRD-코드 정합성)이므로 재흡수. 6개 EP → 4개로 정리 (15, 16, 18, 19).
- **검증 우선, 구현은 필요 시만**: 이 EP는 코드 감사(audit) 성격. 이미 구현된 항목은 검증만, 누락된 항목만 구현.
- **commission_pct CommonCode 관리**: 하드코딩 대신 CommonCode KNN 그룹에 추가하여 WFO 튜닝 가능하게 함.
- **이체 수익 기반 전환**: EP-14의 잉여 잔고 방식이 원금을 깎을 수 있음. PRD §7.20은 "당일 수익의 50%"이므로 dailyProfit 기반으로 변경.
- **MIN_RESERVE_USDT = 50 상수화**: CommonCode에 넣지 않음 (안전 하한선은 변경 불가 정책).

## Consensus Log
- (계획 단계)

## Progress notes
- 2026-04-05: 에픽 계획 작성. PRD v2.0 vs docs/ 대조에서 발견된 갭의 코드 반영 상태를 검증하는 에픽.
- 2026-04-05: EP-17(M3), EP-20 흡수 통합. 6 EP → 4 EP 정리.

# 14-auto-transfer

## Objective
봇이 쌓은 수익을 선물 계좌에서 현물 지갑으로 자동 이체하여 실질적인 수익을 확정한다. "출금하지 않으면 절대 내 돈이 아니다" — 수익을 선물 계좌에 방치하면 복리 효과보다 파산 확률이 높아진다.

## Scope
- `src/transfer/` (L7): 출금 스케줄러, 이체 실행기, 이체 이력 기록
- 지원: Binance 선물(USDT-M) → Binance 현물 지갑 내부 이체 (CCXT `transfer()`)
- 이체 대상: 미실현 수익이 아닌 **실현된 잉여 잔고** (가용 잔고 - 증거금 유지 버퍼)

## Non-goals
- 거래소 간 외부 송금 (출금·입금)
- 현물 자산 매매
- 세금 계산
- OKX/Bitget/MEXC 이체 (Phase 2 — 잉여 잔고 알림만 제공)

## Prerequisites
- EP-01 (core, db, config) 완료
- EP-03 M1 (exchanges — Binance 어댑터, `transfer()` 메서드) 완료
- EP-08 (notifications — Slack 알림) 완료

## Milestones

### M1 — 이체 규칙 설정 & 잔고 계산
- Deliverables:
  - CommonCode `TRANSFER` 그룹 시드 추가 (`config/seed.ts` 수정):
    - `transfer_enabled`: 자동 이체 활성화 여부 (기본 `false`)
    - `transfer_schedule`: `daily` | `weekly` (기본 `daily`)
    - `transfer_time_utc`: 이체 실행 시각 (기본 `"00:30"` — UTC 자정 직후)
    - `transfer_pct`: 가용 잉여 잔고의 몇 %를 이체할지 (기본 `50`)
    - `min_transfer_usdt`: 최소 이체 금액 (기본 `10` USDT — 미만 시 skip)
    - `reserve_multiplier`: reserve 배수 (기본 `10` — reserve = balance × risk_pct × 10)
  - `src/transfer/balance.ts` — 이체 가능 잔고 계산:
    - reserve = max(walletBalance × risk_pct × reserve_multiplier, 50)
    - 가용 잔고 = walletBalance - openPositionMargin - reserve
    - 이체액 = max(0, 가용 잔고) × transfer_pct / 100
    - 이체액 < min_transfer_usdt 이면 skip
  - reserve 동적 계산 예시:
    - risk_pct=3%, 시드 200 USDT → reserve = max(200×0.03×10, 50) = 60 USDT
    - risk_pct=3%, 시드 20,000 USDT → reserve = max(20000×0.03×10, 50) = 6,000 USDT
    - risk_pct=1%, 시드 20,000 USDT → reserve = max(20000×0.01×10, 50) = 2,000 USDT
- Acceptance criteria:
  - 오픈 포지션 증거금은 이체 대상에서 제외
  - reserve는 `balance × risk_pct × reserve_multiplier`로 동적 계산 (최소 하한 50 USDT)
  - risk_pct 변경 시 reserve 자동 조정 (3%→1% 전환 대응)
  - 모든 잔고 계산 Decimal.js
- Validation:
  - `bun test -- --grep "transfer-balance"`

### M2 — 이체 실행기
- Deliverables:
  - `src/transfer/executor.ts` — TransferExecutor
    - CCXT `transfer(currency, amount, fromAccount, toAccount)` 호출
    - fromAccount: `future`, toAccount: `spot`
    - 실패 시 3회 재시도 (지수 백오프)
    - 이체 결과 EventLog 저장 (별도 Transfer 테이블 불필요):
      - `event_type`: `TRANSFER_SUCCESS` | `TRANSFER_FAILED` | `TRANSFER_SKIP`
      - `data`: `{ exchange, currency, amount, from: "future", to: "spot", balance_before, balance_after, reserve, error_message? }`
- Acceptance criteria:
  - 이체 성공 시 EventLog에 `TRANSFER_SUCCESS` 기록
  - 이체 실패 시 EventLog에 `TRANSFER_FAILED` + error_message 기록, Slack 긴급 알림
  - 이체 중 포지션 개시 이벤트가 발생해도 이체는 계속 (비차단)
  - 이체 금액 최소 단위(소수점) 거래소 규칙 준수
- Validation:
  - `bun test -- --grep "transfer-executor"`

### M3 — 이체 스케줄러 & 알림
- Deliverables:
  - `src/transfer/scheduler.ts` — TransferScheduler
    - daemon 시작 시 등록, `transfer_schedule` + `transfer_time_utc` 기반 타이머
    - setTimeout 체인으로 다음 이체 시각 계산 (setInterval 미사용 — 드리프트 방지)
    - `transfer_enabled = false` 시 즉시 skip
  - Slack 알림 통합:
    - 이체 성공: "💸 자동 이체 완료: {amount} USDT → 현물 지갑"
    - 이체 skip: 잔고 부족 시 debug 로그만 (Slack 미발송)
    - 이체 실패: Slack 긴급 알림
    - 이체 미지원 거래소 잉여 잔고 감지: "📢 {exchange} 잉여 잔고 {amount} USDT — 수동 이체 필요" (OKX/Bitget/MEXC에 잉여 잔고 > min_transfer_usdt 시 발송)
- Acceptance criteria:
  - 스케줄러가 daemon 생명주기와 함께 시작/종료
  - 이체 시각이 UTC 기준 정확히 실행 (±1분 이내)
  - 수동 즉시 이체 트리거 가능 (`bun scripts/transfer-now.ts`)
  - 이체 미지원 거래소의 잉여 잔고 Slack 알림 정상 발송
- Validation:
  - `bun test -- --grep "transfer-scheduler"`
  - `bun scripts/transfer-now.ts --dry-run` (실제 이체 없이 금액 계산만 출력)

### M4 — API & 웹 UI 연동
- Deliverables:
  - `GET /api/transfers` — 이체 이력 조회 (EventLog에서 `TRANSFER_%` 필터, cursor 페이지네이션)
  - `POST /api/transfers/trigger` — 수동 즉시 이체 트리거 (웹 UI 버튼)
  - `PUT /api/config` 에 TRANSFER 그룹 편집 포함 (EP-11 설정 관리 확장)
  - 웹 대시보드 이체 이력 섹션 추가 (EP-11 확장)
- Acceptance criteria:
  - 이체 이력 테이블 표시 (금액, 시각, 상태)
  - 수동 즉시 이체 버튼 (확인 대화상자 포함)
  - TRANSFER CommonCode 편집 가능 (reserve_multiplier, transfer_pct 등)
- Validation:
  - `bun test -- --grep "api-transfers"`
  - 브라우저 수동 확인

## Task candidates
- T-14-001: config/seed.ts — TRANSFER CommonCode 그룹 시드 추가 (reserve_multiplier 포함)
- T-14-002: transfer/balance.ts — 이체 가능 잔고 계산 (동적 reserve, risk_pct 연동, 증거금 제외)
- T-14-003: transfer/executor.ts — CCXT transfer() 호출 & EventLog 기록
- T-14-004: transfer/scheduler.ts — 스케줄러 (daily/weekly, setTimeout 체인)
- T-14-005: scripts/transfer-now.ts — 수동 즉시 이체 CLI (--dry-run 포함)
- T-14-006: notifications/slack.ts — 이체 성공/실패 알림 + 미지원 거래소 잉여 잔고 알림 템플릿
- T-14-007: api/routes/ — 이체 이력 조회 (EventLog 필터) & 수동 트리거 엔드포인트
- T-14-008: web/ — 이체 이력 섹션 & 수동 이체 버튼
- T-14-009: 이체 E2E 통합 테스트 (dry-run + Binance 테스트넷)

## Risks
- **이체 중 마진콜**: 이체 직후 급격한 가격 변동으로 유지 증거금 부족. **완화**: reserve = balance × risk_pct × reserve_multiplier로 동적 버퍼 확보, 이체 전 미실현 손익 확인.
- **CCXT transfer() Binance 지원**: Binance USDT-M → 현물 이체가 CCXT로 지원되는지 EP-01 spike에서 미검증. **완화**: M2에서 테스트넷 사전 검증, 불가 시 Binance 내부 이체 REST API 직접 호출.
- **이체 타이밍 충돌**: 이체 실행 중 포지션 진입이 동시에 발생하여 증거금 부족. **완화**: 이체 가능 잔고 계산 시 현재 오픈 포지션 증거금 + 동적 reserve를 항상 차감.
- **소액 누적 미이체**: min_transfer_usdt 미만 잔고가 계속 쌓이는 경우. 허용 — 다음 스케줄에서 합산 이체.
- **멀티 거래소 잉여 잔고 방치**: OKX/Bitget/MEXC에 수익이 쌓여도 자동 이체 불가. **완화**: 잉여 잔고 감지 시 Slack 알림으로 수동 이체 유도.

## Decision log
- **고정 비율 출금** — 가용 잉여 잔고의 50% 이체 (기본값). 이유: 수익의 절반은 현물로 확정하고, 나머지는 시드로 재투입. 시드 크기 무관하게 동일 비율 적용. CommonCode로 사용자 설정 가능.
- **선물 → 현물 내부 이체만** — 외부 출금(거래소 밖)은 이 에픽 범위 밖. 자산 유지·보안상 내부 이체로 제한.
- **동적 reserve (reserve_usdt 폐기)** — 고정 200 USDT 대신 `balance × risk_pct × reserve_multiplier` 동적 계산. 이유: "1회 리스크 × 10회 연속 손실 방어" 공식 적용. 시드 크기에 비례하여 자동 조정되고, risk_pct 변경(3%→1%) 시에도 자동 연동. 최소 하한 50 USDT.
- **Transfer 테이블 폐기 → EventLog 통합** — 별도 마이그레이션(007) 불필요. event_type `TRANSFER_SUCCESS`/`TRANSFER_FAILED`/`TRANSFER_SKIP`으로 EventLog에 기록. 이력 조회는 EventLog WHERE 필터.
- **이체 실패는 비치명적** — 이체 실패가 트레이딩 파이프라인을 중단시키지 않음. Slack 알림 후 다음 스케줄에서 재시도.
- **멀티 거래소 잉여 잔고 알림** — Phase 1에서 이체 미지원 거래소(OKX/Bitget/MEXC)에 잉여 잔고 감지 시 Slack 알림 발송. 자동 이체는 Phase 2.

## Consensus Log
- (계획 단계)

## Progress notes
- (작업 전)

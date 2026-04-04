# 08-safety-net

## Objective
DB↔거래소 대조(reconciliation)와 Slack 알림 시스템을 구축하여 운영 안정성을 확보한다.

## Scope
- `src/reconciliation/` (L7): 대조 로직(순수), 60초 주기 워커(DB+exchange), 패닉 클로즈
- `src/notifications/` (L7): Slack 웹훅 알림
- EventLog DB 스키마 + 저장 헬퍼

## Non-goals
- 포지션 관리 로직 (EP-06)
- 크래시 복구 시퀀스 (EP-09 — daemon 레벨)
- 킬 스위치 (EP-09)
- 구조화 로거 구현 (EP-01 M4 — core/logger.ts에서 완료)

## Prerequisites
- EP-01 (core, db, config — 로거 포함) 완료 ✅
- EP-03 (exchanges ��� fetchPositions, Binance 어댑터) 완료 ✅
- EP-06 (position management — Ticket, SymbolState, executor, emergencyClose) 완료 ✅
- EP-07 (exits & labeling — closeTicket, labeling) 완료 ✅
- **참��:** EventLog 테이블은 �� 에픽 마이그레이션(0006)에서 생성 (0005�� EP-06 Ticket/Order)
- **참고:** EP-06의 `emergencyClose()` (orders/executor.ts) 재사용 — 별도 panic-close 미구현

## Milestones

### M1 — EventLog 스키마 + 저장 헬퍼
- Deliverables:
  - `db/migrations/0006` — EventLog 테이블 마이그레이션
  - `src/db/event-log.ts` — EventLog 저장/조회 헬퍼 (db 모듈 L1에 배치)
    - `insertEvent(db, params) → EventLogRow`
    - `queryEvents(db, filters) → EventLogRow[]`
    - 10개 event_type 규약 (DATA_MODEL.md 참조)
    - append-only, 삭제 없음
- Acceptance criteria:
  - EventLog 테이블 DATA_MODEL.md 준수 (7컬럼, 3인덱스, FK ��음)
  - insertEvent��� 모든 필드 정확 저장
  - queryEvents: event_type별, symbol별, ref_type+ref_id별 조회
  - append-only 보장 (DELETE 쿼리 없음)
- Validation:
  - `bun test -- --grep "event-log"`
  - `bun run typecheck`
  - `bun run lint`

### M2 — Reconciliation 워커
- Deliverables:
  - `src/reconciliation/comparator.ts` — 대조 비교 **순수 함수** (DB import 금지)
    - `comparePositions(exchangePositions, dbTickets, snapshotTime) → ReconciliationResult`
    - 매칭, 불일치(거래소有 DB無), 고아(DB有 거래소無) 분류
    - PENDING 주문 안전장치: pendingSymbols에 해당하는 불일치��� 제외
    - 스냅샷 이후 생성된 Ticket은 불일치 판정에서 제외
  - `src/reconciliation/worker.ts` — 대조 워커 (DB + exchange)
    - setTimeout 체인 기반 60초 간격 실행
    - comparePositions 호출 → 결과에 따라 실행:
    - 불일치 → emergencyClose (EP-06 재사용) + EventLog 기록
    - 고아 → SymbolState IDLE ���킹 + EventLog 기록
    - 매칭 → EventLog 기록 (��상)
- Acceptance criteria:
  - 60초 주기 (setTimeout 체인, 드리프트 방지)
  - 3가지 대조 결과 정확 ��리
  - emergencyClose 재사용 (orders/executor.ts) — 순환 의존 없음 (L7→L6 허용)
  - EventLog에 대조 결과 기록
  - PENDING 주문 안전장치 동작
  - 스냅샷 타임스탬프 안전장치 동작
  - 프로덕션 모드에�� 비활성화 불가
- Validation:
  - `bun test -- --grep "reconciliation|comparator"`
  - `bun run typecheck`
  - `bun run lint`

### M3 — Slack 알림
- Deliverables:
  - `src/notifications/slack.ts` — Slack 웹훅 클라이언트 + 이벤트별 메시지 템플릿
    - `sendSlackAlert(event, details) → void` (���차단, fire-and-forget)
    - 이벤트: 주문 체결, SL 등록, 대조 불일치, 손실 제한, 데몬 시작/종료, 크래시 복구
    - 웹훅 실패 시 로컬 로그만 (비차단)
- Acceptance criteria:
  - 메시지 포맷: 이벤트 유형, 심볼, 시각, 상세 필��� 구분
  - 웹훅 실패가 트레��딩 로직에 영향 없음
  - 웹훅 URL: `process.env.SLACK_WEBHOOK_URL` 우선, CommonCode NOTIFICATION 그룹 fallback
  - 각 이벤트 유형별 Slack Block Kit 메시지 템플릿
- Validation:
  - `bun test -- --grep "slack"`
  - `bun run typecheck`
  - `bun run lint`

## Task candidates → Generated tasks mapping
- T-08-001: db/schema.ts — EventLog 테이블 Drizzle 스키마 & 마이그레이션(0006)
- T-08-002: db/event-log.ts — EventLog 저장/조회 헬퍼 (insertEvent, queryEvents)
- T-08-003: reconciliation/comparator.ts — 대조 비교 순수 함수 (매칭/불일치/고아 + 안전장치)
- T-08-004: reconciliation/worker.ts — 대조 워커 (setTimeout 체인 + emergencyClose 연동 + EventLog 기록)
- T-08-005: notifications/slack.ts — Slack 웹훅 클라이언트 + 이벤트별 메시지 ���플릿
- T-08-006: 대조 워커 + 알림 E2E 통합 테스트

### Dependency graph
```
Wave 1 (no EP-08 deps):  T-08-001, T-08-003, T-08-005
Wave 2:                   T-08-002 (→001), T-08-004 (→001,003)
Wave 3:                   T-08-006 (→002,004,005)
```

## Risks
- **패닉 클로즈 실패**: 거래소 API 오류 시 청산 불가. **완화**: emergencyClose 3회 재시도 (EP-06 구현) + Slack 긴급 알림 + EventLog 기록.
- **대조 중 포지션 변경 오탐**: 대조 실행 중 새 주문 체결 시 정상 진입을 패닉 클로��할 수 있음. **완화**: PENDING 주문 체크 + 스냅샷 타임스탬프 기반 제외.
- **Slack 웹훅 URL 보안**: `process.env.SLACK_WEBHOOK_URL`을 우선 사용하여 DB 노출 방지. CommonCode는 fallback 전용.
- **EventLog 볼륨**: 60초 간격 대조 → 일 ~1,440건. 1년 보존 시 ~525K건. 인덱스 성능 모니터링 필요.

## Decision log
- 대조 워커는 setTimeout 체인으로 구현 (setInterval 드리프트 방지)
- **emergencyClose 재사용**: orders/executor.ts의 emergencyClose()를 reconciliation에서 직접 import. reconciliation(L7)→orders(L6)는 레이어 규칙 허용. 별도 panic-close.ts 불필요 — 코드 중복 방지.
- **Slack 웹훅 URL 소스**: process.env.SLACK_WEBHOOK_URL 우선, CommonCode NOTIFICATION.slack_webhook_url fallback. 환경변수가 보안상 우선.
- **EventLog 저장 위치**: `src/db/event-log.ts` (L1) — core/logger.ts(L0)에서 직접 DB import하면 레이어 위반. 대신 L1에 헬퍼를 ���고, 호출���(L7+)가 logger + eventLog 헬퍼를 동��� 호출.
- 구조화 로거는 EP-01 M4에서 완료 — 이 에픽은 EventLog DB 저장만 추가
- EventLog 테이블은 이 에픽 마이그레이션(0006)에서 생성
- **순수 함수/DB 분리 적용**: comparator.ts(순수 비교 로직) vs worker.ts(DB+exchange 실행). 백테스트에서 대조 로직 재사용 가능.
- **파일 소유권 정리**: worker.ts(1태스크), slack.ts(1태스크)로 ���합. EP-05/06/07 리뷰 패턴 적용.

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- 2026-04-04: 에픽 리뷰 수행. Critical 3��(마이그레이션 번호, worker.ts 2건 충돌, slack.ts 2건 충돌), Important 6건(전제조건, 검증, panic-close 중복, 순수함수 패턴, Slack URL 보안, EventLog 레이어) 수정 완료.
- 2026-04-04: 태스크 후보 8개→6��로 통합. worker.ts 2→1, slack.ts 2→1, panic-close 제거(emergencyClose 재사용). 3 Waves ���존성 그래프.
- 2026-04-04: 태스크 생성 완료 (6개). 의존성: Wave1(001,003,005) → Wave2(002→001, 004→001+003) → Wave3(006→002+004+005). 3 Waves.

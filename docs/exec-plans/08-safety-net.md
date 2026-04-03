# 08-safety-net

## Objective
DB↔거래소 대조(reconciliation)와 Slack 알림 시스템을 구축하여 운영 안정성을 확보한다.

## Scope
- `src/reconciliation/` (L7): 60초 주기 대조 워커, 패닉 클로즈
- `src/notifications/` (L7): Slack 웹훅 알림
- EventLog DB 저장 연동

## Non-goals
- 포지션 관리 로직 (EP-06)
- 크래시 복구 시퀀스 (EP-09 — daemon 레벨)
- 킬 스위치 (EP-09)
- 구조화 로거 구현 (EP-01 M4 — core/logger.ts에서 완료)

## Prerequisites
- EP-01 (core, db, config — 로거 포함) 완료
- EP-03 (exchanges — fetchPositions) 완료
- EP-06 M1-M2 (positions — Ticket, SymbolState, 주문 실행) 완료

## Milestones

### M1 — Reconciliation 워커
- Deliverables:
  - `db/migrations/005` — EventLog 테이블 마이그레이션
  - `src/reconciliation/worker.ts` — ReconciliationWorker
    - setTimeout 체인 기반 60초 간격 실행 (setInterval 대신)
    - 거래소 포지션 ↔ DB 티켓 대조
    - 매칭: 정상 확인
    - 불일치 (거래소 있음, DB 없음): 패닉 클로즈
    - 고아 (DB 있음, 거래소 없음): IDLE 마킹 + 이상 로깅
  - `src/reconciliation/panic-close.ts` — 강제 시장가 청산
- Acceptance criteria:
  - 60초 주기 정확히 실행 (setTimeout 체인으로 드리프트 방지)
  - 3가지 대조 결과 모두 정확히 처리
  - 패닉 클로즈 시 reduceOnly 시장가 + 3회 재시도
  - EventLog에 대조 결과 기록
  - 대조 워커는 프로덕션 모드에서 비활성화 불가
  - **안전장치: 대조 시점에 PENDING 상태 주문이 있는 심볼은 패닉 클로즈 대상에서 제외**
  - **안전장치: 대조 시작 시 스냅샷 타임스탬프 기록, 스냅샷 이후 생성된 Ticket은 불일치 판정에서 제외**
- Validation:
  - `bun test -- --grep "reconciliation"`

### M2 — Slack 알림
- Deliverables:
  - `src/notifications/slack.ts` — SlackNotifier
  - 알림 이벤트:
    - 주문 체결 (진입, 청산)
    - SL 등록 성공/실패
    - 대조 불일치
    - 손실 제한 트리거
    - 데몬 시작/종료
    - 크래시 복구 액션
  - 웹훅 실패 시 로컬 로그만 (비차단)
- Acceptance criteria:
  - Slack 메시지 포맷 깔끔 (필드 구분)
  - 웹훅 실패가 트레이딩 로직에 영향 없음
  - 각 이벤트 유형별 메시지 템플릿
  - Slack 웹훅 URL은 CommonCode NOTIFICATION 그룹에서 관리
- Validation:
  - `bun test -- --grep "slack"`
  - 테스트 웹훅으로 메시지 전송 확인

### M3 — EventLog DB 저장 & 조회
- Deliverables:
  - EventLog 저장 헬퍼 — core/logger.ts와 연동하여 크리티컬 이벤트를 DB에도 저장
  - EventLog 조회 API 기반 쿼리 (EP-10에서 API 노출)
  - event_type 규약 문서화 (DATA_MODEL.md 참조)
- Acceptance criteria:
  - 크리티컬 이벤트 (ARCHITECTURE.md 목록) DB 저장
  - (ref_type, ref_id)로 관련 엔티티 조회 가능
  - append-only, 삭제 없음
- Validation:
  - `bun test -- --grep "event-log"`

## Task candidates
- T-08-001: db/migrations/005 — EventLog 테이블 마이그레이션
- T-08-002: reconciliation/worker.ts — setTimeout 체인 기반 60초 주기 대조 워커
- T-08-003: reconciliation/worker.ts — 매칭/불일치/고아 처리 로직 + PENDING 주문 안전장치
- T-08-004: reconciliation/panic-close.ts — 패닉 클로즈 (reduceOnly, 3회 재시도)
- T-08-005: notifications/slack.ts — Slack 웹훅 클라이언트
- T-08-006: notifications/slack.ts — 이벤트별 메시지 템플릿
- T-08-007: EventLog DB 저장 헬퍼 & core/logger 연동
- T-08-008: 대조 워커 + 알림 E2E 통합 테스트

## Risks
- **패닉 클로즈 실패**: 거래소 API 오류 시 청산 불가. 대안: 3회 재시도 + Slack 긴급 알림 + EventLog 기록.
- **대조 중 포지션 변경 오탐**: 대조 실행 중 새 주문 체결 시 정상 진입을 패닉 클로즈할 수 있음. **완화**: PENDING 주문 체크 + 스냅샷 타임스탬프 기반 제외.
- **Slack 웹훅 URL 노출**: CommonCode에 저장 시 DB 접근으로 노출 가능. 환경변수와 병행 검토.

## Decision log
- 대조 워커는 setTimeout 체인으로 구현 (실행 시간 고려, setInterval 드리프트 방지)
- 패닉 클로즈는 orders 모듈을 거치지 않고 직접 거래소 API 호출 (순환 의존 방지)
- Slack 웹훅 URL은 CommonCode NOTIFICATION 그룹에서 관리
- 구조화 로거는 EP-01 M4에서 core/logger.ts로 이미 구현됨 — 이 에픽에서는 EventLog DB 저장 연동만 추가
- EventLog 테이블은 이 에픽 마이그레이션에서 생성

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- (작업 전)

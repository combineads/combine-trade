# 09-daemon

## Objective
메인 데몬 프로세스를 구현한다. 캔들 이벤트 기반 파이프라인 오케스트레이션, 크래시 복구, 그레이스풀 셧다운, 킬 스위치를 포함한다.

## Scope
- `src/daemon.ts` (L9): 메인 진입점, 파이프라인 오케스트레이션
- `scripts/kill-switch.ts`: 긴급 전체 포지션 청산 + 정지

## Non-goals
- 개별 파이프라인 모듈 구현 (EP-02~EP-08)
- 웹 서버 / API 엔드포인트 (EP-10 담당)
- 백테스트 실행 (EP-11)
- `GET /api/health` 엔드포인트 (EP-10 M2에서 구현)

## Prerequisites
- EP-01~EP-08 전체 완료
- EP-07 (exits, labeling) 완료

> **참고**: 데몬 스켈레톤(`캔들 수신 → 지표 계산 → 로깅`)은 EP-04 완료 직후부터 점진적으로 구축한다. M0에서 최소 스켈레톤을 만들고, 이후 에픽(EP-05, EP-06, EP-08) 완료 시마다 파이프라인 단계를 추가한다.

## Milestones

### M0 — 데몬 스켈레톤 (EP-04 완료 직후 시작)
- Deliverables:
  - `src/daemon.ts` — 최소 startDaemon():
    1. DB 연결 + config 로드
    2. **히스토리 데이터 동기화** — 전일까지 Binance public data 다운로드 & UPSERT (EP-04 sync.ts 호출)
    3. 캔들 수집기 시작 (EP-04 — WebSocket 실시간)
    4. 캔들 마감 → 지표 계산 (EP-02) → 로깅
  - SIGTERM/SIGINT 기본 핸들러
- Acceptance criteria:
  - 데몬 시작 시 전일까지 히스토리 동기화 완료 후 WebSocket 연결
  - Binance WebSocket 연결 + 캔들 수신
  - 캔들 마감 시 지표 계산 로그 출력
  - Ctrl+C로 정상 종료
- Validation:
  - `bun run daemon` (analysis 모드)
  - 캔들 수신 로그 확인
- **선행 조건**: EP-01 + EP-02 + EP-03 M1-M2 + EP-04 완료

### M1 — 전체 파이프라인 오케스트레이션
- Deliverables:
  - `src/daemon.ts` — 완전한 파이프라인:
    1. 지표 재계산
    2. 방향 필터 (1D 마감 시)
    3. WATCHING 평가 (1H 마감 시) / 진입 시그널 체크 (5M/1M 마감 시)
    4. 시그널 → 벡터화 → KNN → 포지션 사이징 → 주문 실행
       - **5M/1M 동시 시그널 시 1M 우선** (SL 타이트 → 손익비 유리, PRD 7.16)
    5. 오픈 포지션: 청산 체크 (TP1/TP2/트레일링/TIME_EXIT)
       - 1H close 시 TP1/TP2 가격 동적 갱신 + 트레일링 상향
  - 대조 워커 60초 인터벌 시작
  - 파이프라인 레이턴시 계측 (candle close → signal generation timestamp 차이 기록)
- Acceptance criteria:
  - 캔들 마감에서 주문까지 < 1200ms (analysis 모드에서 시그널 생성까지 < 200ms)
  - 심볼별 독립 파이프라인 (하나의 에러가 다른 심볼에 영향 없음)
  - 모든 에러가 core/logger + Slack 알림
  - **레이턴시 측정 방법**: candle close_time과 signal created_at의 차이를 EventLog에 기록
- Validation:
  - `bun test -- --grep "daemon"`
  - 데몬 시작 → 캔들 수신 → 로그 확인 (analysis 모드)

### M2 — 크래시 복구
- Deliverables:
  - `src/daemon.ts` 내 크래시 복구 시퀀스:
    1. 거래소 포지션 조회
    2. DB 티켓 대조
    3. 매칭: SL 재등록 확인
    4. 불일치: 패닉 클로즈
    5. 고아: IDLE 마킹
    6. 손실 제한 상태 복원 (SymbolState에서)
  - 복구 완료 후 정상 파이프라인 재개
- Acceptance criteria:
  - 데몬 재시작 시 자동 복구
  - SL이 거래소에 없으면 재등록
  - 복구 액션 EventLog + Slack 알림
- Validation:
  - `bun test -- --grep "crash-recovery"`

### M3 — 그레이스풀 셧다운 & 킬 스위치
- Deliverables:
  - SIGTERM/SIGINT 핸들러 (M0 기본에서 확장):
    1. 새 캔들 이벤트 수신 중단
    2. 미체결 진입 주문 취소
    3. 오픈 포지션 유지 (SL이 거래소에 있음)
    4. 펜딩 라벨 DB 플러시
    5. DB/WS 연결 종료
  - `scripts/kill-switch.ts`:
    1. 전 거래소 포지션 조회
    2. 전체 시장가 청산 (reduceOnly)
    3. 전체 주문 취소
    4. execution_mode → analysis 전환
    5. Slack "KILL SWITCH ACTIVATED" 알림
- Acceptance criteria:
  - 셧다운 시 데이터 손실 없음
  - 킬 스위치는 데몬과 독립 실행 가능
  - 킬 스위치 트리거: CLI (`bun scripts/kill-switch.ts`), 웹 UI 버튼 (EP-10에서 구현), API 엔드포인트 (EP-10 M3에서 구현)
- Validation:
  - 데몬 실행 중 SIGTERM 전송 → 정상 종료 확인
  - `bun scripts/kill-switch.ts` (테스트넷)

### M4 — 실행 모드 관리
- Deliverables:
  - 실행 모드 관리 (analysis / alert / live)
    - analysis: 시그널만 기록
    - alert: 실제 주문 + Slack 알림 (소액 검증 단계)
    - live: 실제 주문 (본격 운영)
  - systemd/pm2 설정 가이드
- Acceptance criteria:
  - 모드 전환이 CommonCode에서 관리
  - analysis 모드에서 주문 실행 불가 (EP-06 M2 하드 가드와 연동)
- Validation:
  - 모드별 동작 확인 테스트

## Task candidates
- T-09-001: daemon.ts — 최소 스켈레톤 (캔들 수신 → 지표 → 로깅) [M0]
- T-09-002: daemon.ts — 전체 파이프라인 오케스트레이션 연결
- T-09-003: daemon.ts — 심볼별 독립 에러 처리
- T-09-004: daemon.ts — 파이프라인 레이턴시 계측
- T-09-005: daemon.ts — 크래시 복구 시퀀스
- T-09-006: daemon.ts — SIGTERM/SIGINT 그레이스풀 셧다운
- T-09-007: scripts/kill-switch.ts — 긴급 킬 스위치
- T-09-008: daemon.ts — 실행 모드 관리 (analysis/alert/live)
- T-09-009: systemd/pm2 설정 파일 생성
- T-09-010: 데몬 전체 E2E 통합 테스트 (캔들→시그널→주문→청산→라벨링 관통)
- T-09-011: 데몬 시작 시 히스토리 동기화 + 1M 6개월 rolling 정리 통합

## Risks
- **파이프라인 레이턴시**: 1200ms 예산 초과 가능. M1에서 프로파일링 후 병목 최적화.
- **동시성 이슈**: 캔들 마감과 대조 워커가 동시에 SymbolState 변경. 트랜잭션 격리 + 잠금 순서 규칙.
- **킬 스위치 신뢰성**: 거래소 API 대량 호출 시 레이트리밋. 거래소별 순차 처리 + 재시도.
- **통합 리스크**: EP-01~EP-08 전체 통합 시 인터페이스 불일치 대량 발생 가능. **완화**: M0 스켈레톤을 EP-04 직후 구축하여 점진적 통합.

## Decision log
- 파이프라인은 캔들 마감 이벤트에 동기적으로 실행 (비동기 큐 불필요 — 단일 프로세스)
- 킬 스위치는 데몬 프로세스와 무관한 독립 스크립트 (CLI 트리거)
- 웹 UI 킬 스위치 버튼과 API 엔드포인트는 EP-10에서 구현 (이 에픽은 CLI만)
- 헬스체크 엔드포인트 (`GET /api/health`)는 EP-10 M2에서 구현 — 이 에픽에서는 다루지 않음
- 데몬 스켈레톤(M0)은 EP-04 완료 직후 시작하여 통합 리스크를 조기에 발견
- API 서버가 이벤트 루프를 점유하여 파이프라인 지연 가능 — EP-10에서 쿼리 타임아웃 설정

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- (작업 전)

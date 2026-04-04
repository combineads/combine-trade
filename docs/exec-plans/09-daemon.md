# 09-daemon

## Objective
메인 데몬 프로세스를 구현한다. 캔들 이벤트 기반 파이프라인 오케스트레이션, 크래시 복구, 그레이스풀 셧다운, 킬 스위치를 포함한다.

## Scope
- `src/daemon.ts` (L9): 메인 진입점, 시작/종료
- `src/daemon/pipeline.ts` (L9): 캔들 마감 이벤트 → 파이프라인 오케스트레이션
- `src/daemon/crash-recovery.ts` (L9): 시작 시 크래시 복구 시퀀스
- `src/daemon/shutdown.ts` (L9): 그레이스풀 셧다운 + 실행 모드 관리
- `scripts/kill-switch.ts`: 긴급 전체 포지션 청산 + 정지

> **구조 결정:** daemon.ts 단일 파일에 7개 태스크가 집중되는 파일 소유권 충돌 방지를 위해 `src/daemon/` 디렉토리로 분리. L9 레이어 규칙 준수, ARCHITECTURE.md 갱신 필요.

## Non-goals
- 개별 파이프라인 모듈 구현 (EP-02~EP-08에서 완료)
- 웹 서버 / API 엔드포인트 (EP-11 담당)
- 백테스트 실행 (EP-13)
- `GET /api/health` 엔드포인트 (EP-11 M2에서 구현)
- systemd/pm2 설정 파일 (운영 가이드 문서로 별도 관리)

## Prerequisites
- EP-01~EP-08 전체 완료 ✅
  - EP-04: CandleManager (sync + collector + gap recovery + cleanup)
  - EP-05: signals, vectors, knn
  - EP-06: positions, orders, limits
  - EP-07: exits, labeling, pyramid
  - EP-08: reconciliation, notifications, event-log

## Milestones

### M1 — 데몬 스켈레톤 + CandleManager 연결
- Deliverables:
  - `src/daemon.ts` — startDaemon():
    1. DB 연결 (`getDb()`) + config 로드 (`loadCommonCodes()`)
    2. CandleManager.start() — 히스토리 동기화 + WebSocket 수집 + 갭 복구 (EP-04 기구현)
    3. 캔들 마감 콜백 등록 (`onCandleClose()`)
    4. 대조 워커 시작 (`startReconciliation()`, EP-08 기구현)
    5. SIGTERM/SIGINT 기본 핸들러 (process.on)
  - CandleManager가 sync + collector + cleanup을 이미 처리하므로 별도 구현 불필요
- Acceptance criteria:
  - 데몬 시작 시 CandleManager.start() → 히스토리 동기화 → WebSocket 연결
  - 캔들 마감 시 콜백 호출 확인 (로그)
  - 대조 워커 60초 간격 동작
  - Ctrl+C로 정상 종료
- Validation:
  - `bun test -- tests/daemon/daemon-skeleton.test.ts`
  - `bun run typecheck && bun run lint`

### M2 — 전체 파이프라인 오케스트레이션
- Deliverables:
  - `src/daemon/pipeline.ts` — handleCandleClose(candle, timeframe):
    1. 지표 재계산 (EP-02: calcBB20, calcBB4, calcMA, calcRSI, calcATR)
    2. 방향 필터 (1D 마감 시, EP-04: DailyDirectionFilter)
    3. WATCHING 평가 (1H 마감 시, EP-05: WatchingDetector) / 진입 시그널 체크 (5M/1M 마감 시, EP-05: EvidenceGate + SafetyGate)
    4. 시그널 → 벡터화 → KNN → 포지션 사이징 → 주문 실행 (EP-05/06)
       - **5M/1M 동시 시그널 시 1M 우선** — daemon pipeline에서 조율 (SL 타이트 → 손익비 유리, PRD 7.16)
    5. 오픈 포지션: 청산 체크 (TP1/TP2/트레일링/TIME_EXIT, EP-07)
       - 1H close 시 TP1/TP2 가격 동적 갱신 + 트레일링 상향
  - **심볼별 독립 파이프라인**: try/catch per symbol — 하나의 에러가 다른 심볼에 영향 없음
  - **파이프라인 레이턴시 계측**: `Date.now()` 시작/종료 차이를 EventLog `PIPELINE_LATENCY` 이벤트로 기록
- Acceptance criteria:
  - 캔들 마감에서 주문까지 < 1200ms (analysis 모드에서 시그널 생성까지 < 200ms)
  - 심볼 A 에러 발생 시 심볼 B 파이프라인 정상 실행
  - 모든 에러가 core/logger + Slack 알림
  - 레이턴시 EventLog 기록 확인
- Validation:
  - `bun test -- tests/daemon/pipeline.test.ts`
  - `bun run typecheck && bun run lint`

### M3 — 크래시 복구
- Deliverables:
  - `src/daemon/crash-recovery.ts` — recoverFromCrash():
    1. `comparePositions()` 재사용 (EP-08 reconciliation/comparator.ts) — 거래소↔DB 대조
    2. 매칭: SL 거래소 등록 확인 → 미등록 시 SL 재등록 (`adapter.createOrder()`)
    3. 불일치: `emergencyClose()` 재사용 (EP-06 orders/executor.ts) — 패닉 클로즈
    4. 고아: SymbolState IDLE 마킹 (reconciliation worker와 동일 로직)
    5. 손실 제한 카운터 복원: SymbolState에서 losses_today/session/hourly 읽기
    6. 복구 액션 EventLog `CRASH_RECOVERY` + Slack 알림
  - daemon.ts에서 startDaemon() 내 CandleManager 시작 전에 호출
- Acceptance criteria:
  - 데몬 재시작 시 자동 복구 완료 후 파이프라인 재개
  - SL이 거래소에 없으면 재등록
  - 복구 액션별 EventLog + Slack 알림
- Validation:
  - `bun test -- tests/daemon/crash-recovery.test.ts`
  - `bun run typecheck && bun run lint`

### M4 — 그레이스풀 셧다운 + 킬 스위치 + 실행 모드
- Deliverables:
  - `src/daemon/shutdown.ts` — gracefulShutdown():
    1. 새 캔들 이벤트 수신 중단 (CandleManager.stop())
    2. 대조 워커 중단 (reconciliationHandle.stop())
    3. 미체결 진입 주문 취소 (PENDING 주문)
    4. 오픈 포지션 유지 (SL이 거래소에 있음)
    5. DB 연결 종료
  - `scripts/kill-switch.ts`:
    1. 전 거래소 포지션 조회 (fetchPositions)
    2. 전체 시장가 청산 (reduceOnly) — `emergencyClose()` 재사용
    3. 전체 주문 취소
    4. SymbolState.execution_mode → 'analysis' 전환
    5. Slack "KILL SWITCH ACTIVATED" 알림
  - 실행 모드 관리:
    - CommonCode `SYMBOL_CONFIG` 그룹에서 execution_mode 읽기
    - EP-06 executor.ts의 ExecutionModeError 하드 가드와 연동 (이미 구현)
    - analysis: 시그널만 기록, alert: 주문 + Slack, live: 주문
- Acceptance criteria:
  - 셧다운 시 데이터 손실 없음
  - 킬 스위치는 데몬과 독립 실행 가능 (`bun scripts/kill-switch.ts`)
  - analysis 모드에서 주문 실행 불가
- Validation:
  - `bun test -- tests/daemon/shutdown.test.ts`
  - `bun test -- tests/daemon/kill-switch.test.ts`
  - `bun run typecheck && bun run lint`

## Task candidates → Generated tasks mapping
- T-09-001: `src/daemon.ts` — 데몬 스켈레톤 (DB + CandleManager + 대조워커 + 기본 SIGTERM) [M1]
- T-09-002: `src/daemon/pipeline.ts` — 파이프라인 오케스트레이터 (에러 격리 + 레이턴시 계측 + 5M/1M 우선 규칙) [M2]
- T-09-003: `src/daemon/crash-recovery.ts` — 크래시 복구 (comparePositions + emergencyClose 재사용, SL 재등록, 손실 복원) [M3]
- T-09-004: `src/daemon/shutdown.ts` — 그레이스풀 셧다운 + 실행 모드 관리 [M4]
- T-09-005: `scripts/kill-switch.ts` — 긴급 킬 스위치 (독립 스크립트, emergencyClose 재사용) [M4]
- T-09-006: `tests/daemon/daemon-e2e.test.ts` — 데몬 E2E 통합 테스트 (스켈레톤→파이프라인→복구→셧다운 관통)

## Risks
- **파이프라인 레이턴시**: 1200ms 예산 초과 가능. M2에서 프로파일링 후 병목 최적화.
- **동시성 이슈**: 캔들 마감과 대조 워커가 동시에 SymbolState 변경. 트랜잭션 격리 + `FOR UPDATE` 잠금.
- **킬 스위치 신뢰성**: 거래소 API 대량 호출 시 레이트리밋. 거래소별 순차 처리 + 재시도.
- **통합 리스크**: EP-01~EP-08 전체 모듈 최초 통합. 인터페이스 불일치 가능. **완화**: M1 스켈레톤에서 import 호환성 조기 확인.

## Decision log
- 파이프라인은 캔들 마감 이벤트에 동기적으로 실행 (비동기 큐 불필요 — 단일 프로세스)
- daemon.ts를 `src/daemon/` 디렉토리로 분리 — 파일 소유권 충돌 방지 (7태스크→4파일). `src/daemon.ts`는 진입점, `src/daemon/*.ts`는 하위 모듈
- 킬 스위치는 데몬 프로세스와 무관한 독립 스크립트 (CLI 트리거)
- 웹 UI 킬 스위치 버튼과 API 엔드포인트는 EP-11에서 구현 (이 에픽은 CLI만)
- 헬스체크 엔드포인트 (`GET /api/health`)는 EP-11 M2에서 구현
- 크래시 복구는 EP-08 `comparePositions()` + EP-06 `emergencyClose()` 재사용 — 코드 중복 방지
- 실행 모드 하드 가드는 EP-06에서 이미 구현 (`ExecutionModeError`) — daemon은 CommonCode에서 모드를 읽어 executor에 전달만
- CandleManager (EP-04)가 히스토리 동기화 + 실시간 수집 + 갭 복구 + 1M rolling 정리를 모두 처리 — daemon에서 별도 구현 불필요
- 5M/1M 동시 시그널 시 1M 우선 규칙은 daemon pipeline handler(L9)에서 조율
- systemd/pm2 설정은 코드가 아닌 운영 가이드 문서로 별도 관리 (Non-goals)

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- 2026-04-04: 에픽 리뷰 완료. Critical 3건 수정: (1) daemon.ts×7 파일 충돌 → src/daemon/ 디렉토리 분리, (2) T-09-011 중복 제거 — CandleManager가 이미 sync+cleanup 처리, (3) T-09-002/003/004 머지 → pipeline.ts 단일 태스크. Important 6건 수정: 크래시 복구 comparePositions 재사용 명시, 실행 모드 범위 축소(EP-06 기구현), validation 명령 구체화, systemd Non-goals 이관, 5M/1M 우선 위치 명시, M0 선행조건 현실화. 11→6 태스크.
- 2026-04-04: 태스크 생성 완료 (6개). 의존성 체인: T-09-001(스켈레톤) → T-09-002(파이프라인) → T-09-003(복구, T-09-001 의존) / T-09-004(셧다운, T-09-001+002 의존) / T-09-005(킬스위치, 독립) → T-09-006(E2E, 전체 의존).
- 2026-04-04: T-09-001 완료 — daemon.ts 스켈레톤 (DB + CandleManager + 대조워커 + SIGTERM). M1 달성.
- 2026-04-04: T-09-002 완료 — pipeline.ts 오케스트레이터 (PipelineDeps DI + handleCandleClose + 38 tests). M2 달성. 타임프레임별 분기, 심볼별 에러 격리, 1M 우선 규칙, 레이턴시 계측 모두 구현. daemon.ts에 handleCandleClose 연결 완료.

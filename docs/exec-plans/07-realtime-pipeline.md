# 07-realtime-pipeline

## Objective
개별 워커들을 연결하여, 캔들 close부터 알람/매매까지 1초 이내에 완료되는 end-to-end 실시간 파이프라인을 구축한다. 워커 프로세스 관리, 에러 복원, 성능 측정을 포함한다.

## Scope
- 워커 오케스트레이션: 모든 워커 프로세스 관리
- 파이프라인 라우팅: candle_closed → strategy → vector → decision → alert/execution
- 워커 헬스 모니터링
- 프로세스 슈퍼바이저
- 에러 복원 및 resilience
- 메트릭 수집 기반 (파이프라인 레이턴시, 에러율, 워커 상태)
- Docker Compose full stack

Note: 이벤트 버스 인프라(LISTEN/NOTIFY 추상화)는 00-project-bootstrap M6에서 선행 구축됨.

## Non-goals
- 개별 워커 내부 로직 (이전 에픽에서 구현 완료)
- UI 대시보드 (08-api-ui에서 처리)
- 분산 메시지 큐 (PostgreSQL LISTEN/NOTIFY로 충분)

## Prerequisites
- `00-project-bootstrap` M6 — 이벤트 버스 인프라
- `01-candle-collection` M4 — candle-collector 워커
- `02-strategy-sandbox` M6 — strategy-worker
- `03-vector-engine` M5 — vector-worker
- `04-label-decision` M2 — label-worker
- `06-alert-execution` M2, M4 — alert-worker, execution-worker

## Milestones

### M1 — Worker process supervisor
- Deliverables:
  - `scripts/supervisor.ts` — 워커 프로세스 관리
  - 워커 목록: candle-collector, strategy-worker, vector-worker, label-worker, alert-worker, execution-worker
  - 각 워커 독립 프로세스로 실행
  - 크래시 시 자동 재시작 (exponential backoff)
  - Graceful shutdown (SIGTERM → cleanup → exit)
  - 워커 헬스 체크 (30초 heartbeat)
- Acceptance criteria:
  - 모든 워커 동시 실행
  - 단일 워커 크래시 시 자동 재시작, 다른 워커 미영향
  - SIGTERM으로 전체 graceful shutdown
- Validation:
  ```bash
  bun run start
  # verify all workers running
  # kill one worker → verify auto-restart
  # SIGTERM → verify graceful shutdown
  ```

### M2 — End-to-end pipeline integration
- Deliverables:
  - 전체 파이프라인 통합 테스트:
    ```
    candle close → candle-collector → NOTIFY candle_closed
    → strategy-worker → NOTIFY strategy_event_created
    → vector-worker: normalize → store → L2 search → statistics → decision (inline)
      → NOTIFY decision_completed
    → alert-worker (LISTEN decision_completed) → Slack
    → execution-worker (LISTEN decision_completed) → order
    ```
  - Correlation ID: 캔들 이벤트부터 최종 실행까지 추적 가능
  - 단계별 타이밍 측정 로그
- Acceptance criteria:
  - 전체 파이프라인 < 1초 (p99 envelope)
  - Correlation ID로 전체 흐름 추적 가능
  - 각 단계 지연 시간 로그 확인
- Validation:
  ```bash
  bun test -- --filter "pipeline-e2e"
  # latency benchmark
  ```

### M3 — Error handling & resilience
- Deliverables:
  - 단계별 에러 격리: 한 전략/심볼 에러가 전체 파이프라인 차단 안 함
  - Dead-letter 처리: 3회 재시도 후 실패 이벤트 기록
  - 워커 복구 시 미처리 이벤트 재처리 (DB에서 상태 확인)
  - 백프레셔: 이벤트 폭주 시 큐 관리
  - pgvector 성능 저하 시 graceful degradation: 벡터 검색 타임아웃 → PASS 반환 + 경고 로그
  - **NOTIFY 유실 대응 catch-up polling**:
    - 각 워커가 60초 간격으로 미처리 이벤트 DB 스캔
    - `WHERE processed_at IS NULL AND created_at < NOW() - INTERVAL '30 seconds'` 기반 누락 감지
    - catch-up 처리 시 중복 방지 (멱등성 보장)
- Acceptance criteria:
  - 전략 에러 → 해당 전략만 스킵, 나머지 정상 처리
  - 워커 재시작 후 미처리 이벤트 자동 복구
  - 이벤트 폭주 시 시스템 안정 유지
  - 벡터 검색 2초 초과 시 PASS + 로그
- Validation:
  ```bash
  bun test -- --filter "resilience|error-handling|degradation"
  ```

### M4 — Metrics collection & operational tooling
- Deliverables:
  - 메트릭 수집 서비스: 파이프라인 레이턴시, 에러율, 워커 상태
  - In-memory 실시간 메트릭 + 주기적 DB flush (히스토리)
  - Health aggregation: 워커 heartbeat, 캔들 갭 카운트, 파이프라인 p99 레이턴시
  - `/api/health` 데이터 소스 제공
  - Docker Compose: PostgreSQL + pgvector + 모든 워커 + API 서버 일괄 실행
- Acceptance criteria:
  - `docker compose up` 으로 전체 시스템 실행 가능
  - `/api/health`에서 전체 워커 상태 + 메트릭 확인
  - 레이턴시 히스토리 조회 가능
- Validation:
  ```bash
  docker compose up -d
  curl http://localhost:3000/api/health
  ```

## Task candidates
- T-090: Build worker process supervisor with auto-restart
- T-091: Implement graceful shutdown handler (SIGTERM)
- T-092: Add worker health check heartbeat (30s)
- T-093: Implement correlation ID propagation across pipeline
- T-094: Add per-stage latency timing logs
- T-095: Implement dead-letter handling for failed events
- T-096: Implement backpressure queue management
- T-097: Add missed event recovery on worker restart
- T-097a: Implement periodic catch-up polling for missed NOTIFY events (60s interval)
- T-098: Implement vector search timeout graceful degradation
- T-099: Build metrics collection service (latency, errors, worker status)
- T-100: Implement metrics DB flush for history
- T-101: Create Docker Compose for full system stack
- T-102: E2E pipeline integration test (candle → decision → action)
- T-103: Pipeline latency benchmark (target: < 1s p99 envelope)

## Risks
- PostgreSQL LISTEN/NOTIFY의 메시지 유실 가능성 (트랜잭션 롤백 시)
- 워커 수 증가 시 DB 연결 풀 부족
- 이벤트 순서 보장이 필요한 시나리오 (캔들 순서)
- 슈퍼바이저 자체의 장애 처리
- Multi-symbol concurrent candle close: at the top of each minute/hour, many symbols close simultaneously, creating burst load. The worker thread pool and backpressure mechanism (ARCHITECTURE.md § Multi-strategy latency budget) handle this, but peak latency may exceed p95 targets during high-correlation market events.
- Docker container restart and LISTEN/NOTIFY: container restarts break PostgreSQL connections, losing LISTEN subscriptions. The catch-up polling mechanism (60s interval) recovers missed events, but there is a window of up to 60 seconds where events may be delayed. Mitigation: workers re-subscribe to LISTEN channels on connection re-establishment.

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | 이벤트 버스 인프라는 00-bootstrap으로 이동 | 모든 워커가 의존 — 공유 인프라로 선행 구축 |
| 2026-03-21 | 워커는 독립 프로세스 (스레드 아님) | 장애 격리, 독립 재시작, 리소스 격리 |
| 2026-03-21 | 워커 복구 시 DB 상태 기반 재처리 | NOTIFY는 signal only — 유실 허용, DB가 source of truth |
| 2026-03-21 | 벡터 검색 타임아웃 시 PASS 반환 | 보수적 접근 — 성능 저하 시 매매 안 함이 안전 |
| 2026-03-21 | NOTIFY 유실 대비 주기적 catch-up polling | PG LISTEN/NOTIFY는 연결 끊김/트랜잭션 롤백 시 메시지 유실 가능 — DB가 source of truth |
| 2026-03-21 | Decision engine runs inline in vector-worker | Avoids extra hop; vector-worker already has statistics in memory |
| 2026-03-21 | decision_completed replaces vector_created for downstream | Clearer signal that includes decision result, not just vector existence |

## Progress notes
- Pending implementation.

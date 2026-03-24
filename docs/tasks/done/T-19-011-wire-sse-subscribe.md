# T-19-011 wire-sse-subscribe

## Goal
`sseSubscribe`를 PostgreSQL LISTEN/NOTIFY → 인-프로세스 이벤트 브릿지로 구현하고, LISTEN 연결 상태 체크 + 재연결 루프를 추가한다.

## Why
SSE(Server-Sent Events) 엔드포인트는 실시간 트레이딩 신호와 시스템 알림을 클라이언트에 push한다. 현재 stub 상태여서 실시간 알림이 전혀 동작하지 않는다. LISTEN 연결은 silent failure가 위험하므로 헬스체크가 필수다.

## Inputs
- T-19-005 완료
- `apps/api/src/index.ts` — `sseSubscribe` stub 위치 + 인터페이스
- `db/index.ts` (T-19-001 산출물) — postgres-js 연결
- PostgreSQL LISTEN/NOTIFY 채널 이름 (기존 코드에서 확인)

## Dependencies
T-19-005

## Expected Outputs
- `apps/api/src/db/sse-bridge.ts` — PostgreSQL LISTEN/NOTIFY → in-process listener bridge
- `apps/api/src/index.ts` — `sseSubscribe` stub 교체

## Deliverables
- `apps/api/src/db/sse-bridge.ts`
- `apps/api/src/index.ts` (수정)

## Constraints
- LISTEN 연결은 `db` 풀과 **별도** postgres-js 연결 사용 (LISTEN은 연결을 독점)
- 연결 드롭 시 자동 재연결 (backoff 없이 즉시 재시도, 최대 5회)
- 헬스체크: 재연결 실패 5회 후 에러 로그 + SSE clients에 error event 전송
- `sseSubscribe` 인터페이스: `(channel: string, callback: (payload: string) => void) => () => void` (unsubscribe 함수 반환)
- DB query 없음 — 순수 이벤트 버스 wiring

## Steps
1. `sseSubscribe` 인터페이스 및 현재 stub 구현 확인
2. LISTEN/NOTIFY 채널 이름 확인 (기존 worker 또는 core 코드에서)
3. `sse-bridge.ts` 작성:
   ```ts
   // 별도 LISTEN 전용 postgres 연결
   const listenClient = postgres(url, { max: 1 });
   // channel subscribe/unsubscribe
   // 재연결 루프 (5회 재시도)
   // health check logging
   ```
4. `index.ts` stub 교체
5. `bun run typecheck` 확인

## Acceptance Criteria
- `GET /api/v1/events/stream` SSE 엔드포인트 — 연결 유지 (200 text/event-stream)
- LISTEN 연결 드롭 후 자동 재연결
- 5회 재연결 실패 시 에러 로그 출력
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test apps/api
# SSE 연결 테스트:
# curl -N -s http://localhost:3000/api/v1/events/stream -b /tmp/cookies.txt
```

## Out of Scope
- SSE 클라이언트 측 재연결 (EventSource API 기본 동작)
- WebSocket 지원
- NOTIFY payload 암호화
- SSE session 재검증

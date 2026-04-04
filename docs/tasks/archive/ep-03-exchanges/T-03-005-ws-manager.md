# T-03-005 exchanges/ws-manager.ts — WebSocket 연결 관리자

## Goal
WebSocket 연결 수명주기를 관리하는 WsManager를 구현한다. 자동 재연결, 지수 백오프, 다중 스트림 독립 관리, 재연결 콜백을 제공한다.

## Why
24/7 데몬에서 WebSocket 연결은 불가피하게 끊긴다. 안정적인 자동 재연결 없이는 캔들 수집에 갭이 발생하고, 갭 복구(EP-04)에 불필요한 부하가 생긴다. ARCHITECTURE.md 에러 처리: "WebSocket disconnect → Auto-reconnect (1s, 2s, 4s, max 30s)."

## Inputs
- `src/exchanges/base.ts` (T-03-001) — BaseExchangeAdapter
- `docs/ARCHITECTURE.md` — WebSocket 재연결 전략 (1s→2s→4s, max 30s)
- `src/core/logger.ts` — 구조화 로거

## Dependencies
T-03-001

## Expected Outputs
- `src/exchanges/ws-manager.ts` — WsManager 클래스
- T-03-006(Binance WS kline)과 EP-04(candles collector)에서 사용

## Deliverables
- `src/exchanges/ws-manager.ts`

## Constraints
- L2 모듈: core/ 만 import
- Bun WebSocket 클라이언트 사용 (또는 ws 패키지 — Bun 호환성 따라)
- 연결당 독립 재연결 (한 스트림 끊김이 다른 스트림에 영향 없음)
- 재연결 백오프: 1s→2s→4s→8s→16s→30s (max 30s)
- 재연결 성공 시 백오프 리셋
- 정상 종료(close()) 시 재연결하지 않음

## Steps
1. WsManager 클래스 설계:
   - `connect(url: string, options: WsOptions): WsConnection`
   - `WsOptions`: { onMessage, onReconnect, onError, protocols? }
   - `WsConnection`: { send, close, isConnected }
2. 자동 재연결 구현:
   - 비정상 종료 감지 → 백오프 타이머 시작
   - 재연결 성공 → 백오프 리셋, onReconnect 콜백 호출
   - 정상 종료(close()) → 재연결 시도하지 않음
3. 다중 연결 관리:
   - Map<string, WsConnection>으로 활성 연결 추적
   - 개별 연결 종료 가능
4. closeAll() — 모든 연결 정상 종료 (데몬 shutdown 시)
5. 로거 통합: 연결/끊김/재연결 이벤트 로깅
6. 테스트 작성 (mock WebSocket)
7. typecheck, lint 통과 확인

## Acceptance Criteria
- connect()로 WebSocket 연결 생성
- 메시지 수신 시 onMessage 콜백 호출
- 비정상 종료 시 자동 재연결 시도
- 백오프: 1s→2s→4s→8s→16s→30s (max 30s, 성공 시 리셋)
- 정상 close() 후 재연결하지 않음
- 다중 연결이 독립적으로 관리됨
- closeAll()로 모든 연결 정상 종료
- 재연결 성공 시 onReconnect 콜백 호출
- `bun run typecheck` 통과

## Test Scenarios
- connect() → WebSocket 연결 성공, isConnected = true
- 메시지 수신 → onMessage 콜백에 데이터 전달
- 비정상 종료 → 1초 후 재연결 시도
- 연속 2회 실패 → 1s, 2s 간격으로 재시도
- 연속 6회 실패 → 마지막 간격이 30s (max cap)
- 재연결 성공 → 백오프 리셋 (다음 끊김 시 1s부터 시작)
- 재연결 성공 → onReconnect 콜백 호출
- close() 호출 → isConnected = false, 재연결 시도 안 함
- 다중 연결: 연결 A 끊김 → B는 영향 없음
- closeAll() → 모든 연결 종료

## Validation
```bash
bun run typecheck
bun test --grep "ws-manager"
```

## Out of Scope
- Binance 전용 kline 스트림 처리 (T-03-006)
- 캔들 데이터 해석/저장 (EP-04)
- ping/pong heartbeat (거래소별로 다름 — 각 어댑터에서 구현)

## Implementation Notes

**Completed:** 2026-04-04

### Files created
- `src/exchanges/ws-manager.ts` — WsManager class and supporting types/helpers
- `tests/exchanges/ws-manager.test.ts` — 23 tests covering all acceptance criteria

### Design decisions
- `WsConnectionInternal` is a file-private class that implements the `WsConnection` interface. `WsManager.connect()` returns it typed as `WsConnection` to keep internals hidden from callers.
- `WebSocketFactory` type is exported so tests can inject a `MockWebSocket` without any patching of globals. The default factory uses the standard `WebSocket` constructor.
- Backoff uses a fixed `BACKOFF_STEPS_MS` array `[1000, 2000, 4000, 8000, 16000, 30000]` indexed by attempt count, capped at the last element. This matches the task spec exactly and is O(1) without any math.
- Abnormal close is defined as any close code NOT in `{1000, 1001}`. Code 1006 (abnormal closure, no close frame) is the most common real-world disconnect.
- `isFirstConnection` flag distinguishes the initial open (no `onReconnect` callback) from subsequent reconnects.
- `intentionallyClosed` flag is checked in the `onopen` handler to guard against late-open races after `close()` is called while a socket is still connecting.
- `closeAll()` clears the internal Map after closing all connections, so `manager.size` returns 0 immediately.
- `WsManager.connect()` wraps the internal `close()` to also remove the connection from the Map, keeping the tracking Map clean.

### Test approach
- `MockWebSocket` exposes `simulateOpen()`, `simulateMessage()`, `simulateAbnormalClose()`, `simulateNormalClose()`, and `simulateError()` to drive the state machine synchronously.
- `FakeTimers` replaces `globalThis.setTimeout`/`clearTimeout` to capture and manually fire reconnect timers, enabling deterministic backoff sequence assertions without any real waiting.
- Timers are installed/uninstalled per-test in try/finally to prevent test pollution.

### Validation results
- `bun run typecheck`: pass
- `bun test --grep "ws-manager"`: 23/23 pass
- `bun run lint`: pass (0 errors)

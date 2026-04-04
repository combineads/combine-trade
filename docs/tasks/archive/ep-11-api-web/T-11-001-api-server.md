# T-11-001 Hono API 서버 + 정적 파일 서빙 + daemon 통합

## Goal
Hono + Bun.serve 기반 HTTP 서버를 구축하고, `./public` 정적 파일 서빙을 설정하며, daemon.ts lifecycle에 API 서버 시작/중지를 통합한다.

## Why
EP-11의 모든 API 엔드포인트와 웹 UI가 이 서버 위에서 동작한다. daemon과 같은 프로세스에서 실행되어야 하므로 DaemonDeps에 API 서버를 DI로 주입한다.

## Inputs
- `docs/exec-plans/11-api-web.md` M1
- `src/daemon.ts` — 기존 DaemonDeps 인터페이스
- `docs/ARCHITECTURE.md` — L8 api 모듈 정의

## Dependencies
- 없음 (EP-11 첫 태스크)

## Expected Outputs
- `src/api/server.ts` — `createApiServer(deps): { start(), stop() }` 팩토리
- `src/api/types.ts` — ApiServerDeps 타입 정의
- `src/daemon.ts` 수정 — DaemonDeps에 apiServer 추가, startDaemon에서 시작/중지

## Deliverables
- `src/api/server.ts`
- `src/api/types.ts`
- `src/daemon.ts` (수정)
- `tests/api/server.test.ts`

## Constraints
- Hono + Bun.serve 사용 (TECH_STACK.md)
- L8 모듈: L0~L7 임포트 가능, L9(daemon)에서 임포트
- API 서버는 DaemonDeps에 DI로 주입 (기존 패턴 준수)
- `./public` 정적 파일 서빙 (Hono serveStatic)
- daemon.ts의 기존 시작 시퀀스(initDb→loadConfig→crashRecovery→candles→reconciliation) 뒤에 API 서버 시작
- shutdown 시 API 서버도 정리

## Steps
1. `src/api/types.ts` 생성 — ApiServerDeps (db, config 접근용), ApiServerHandle 타입 정의
2. `src/api/server.ts` 생성 — Hono 앱 생성, `./public` serveStatic, `/api/*` 라우트 마운트 포인트, Bun.serve로 리스닝
3. `createApiServer(deps): ApiServerHandle` 팩토리 함수 구현 — start(port)로 서버 시작, stop()으로 정리
4. `src/daemon.ts` 수정 — DaemonDeps에 `apiServer?: { start(): Promise<void>; stop(): Promise<void> }` 추가
5. startDaemon에서 reconciliation 시작 후 apiServer.start() 호출
6. stop()에서 apiServer.stop() 호출
7. 테스트 작성: 서버 시작/중지, 정적 파일 서빙, 404 처리, daemon 통합

## Acceptance Criteria
- `createApiServer(deps)` → `start()` → HTTP 서버 리스닝 → `stop()` → 정리
- `GET /` → `./public/index.html` 서빙 (파일 존재 시)
- `GET /not-found-path` → `./public/index.html` 폴백 (SPA)
- `GET /api/not-found` → 404 JSON `{ error: "Not Found" }`
- daemon.ts에서 API 서버 시작/중지가 lifecycle에 통합
- DaemonDeps.apiServer가 optional (기존 테스트 깨지지 않음)

## Test Scenarios
- createApiServer()로 서버 생성 후 start() → Bun.serve 리스닝 확인
- start() 후 stop() → 서버 종료 확인 (포트 해제)
- GET / → 200 (public/index.html 존재 시) 또는 SPA 폴백
- GET /api/unknown → 404 JSON 응답 `{ error: "Not Found" }`
- startDaemon(deps with apiServer) → apiServer.start() 호출됨
- stop() → apiServer.stop() 호출됨
- startDaemon(deps without apiServer) → 기존 동작 유지 (하위 호환)

## Validation
```bash
bun test -- tests/api/server.test.ts
bun run typecheck && bun run lint
```

## Out of Scope
- 인증 미들웨어 (T-11-002, T-11-003)
- API 라우트 구현 (T-11-004~007)
- CORS, 에러 핸들러 (T-11-003)

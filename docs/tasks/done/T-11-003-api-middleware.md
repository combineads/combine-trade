# T-11-003 미들웨어 — auth guard, CORS, 에러 핸들러, 쿼리 타임아웃

## Goal
API 서버의 공통 미들웨어를 구현한다: JWT 인증 가드, CORS, 전역 에러 핸들러, 쿼리 타임아웃.

## Why
모든 `/api/*` 엔드포인트(login/logout 제외)에 인증이 필요하다. CORS, 에러 핸들링, 쿼리 타임아웃은 API 안정성의 기반.

## Inputs
- T-11-002의 `src/api/auth.ts` — JWT 검증 로직
- `docs/exec-plans/11-api-web.md` M1

## Dependencies
- T-11-001 (API 서버)
- T-11-002 (인증)

## Expected Outputs
- `src/api/middleware.ts` — authGuard, corsMiddleware, errorHandler, queryTimeout 미들웨어
- API 서버에 미들웨어 적용

## Deliverables
- `src/api/middleware.ts`
- `src/api/server.ts` (수정 — 미들웨어 적용)
- `tests/api/middleware.test.ts`

## Constraints
- hono/jwt의 jwt() 미들웨어 활용
- `/api/login`, `/api/logout`, `/api/health`는 인증 제외
- CORS: SPA 동일 origin이므로 기본적으로 same-origin. 개발 모드에서 localhost:5173 허용
- 에러 핸들러: 모든 에러를 JSON `{ error, message?, details? }` 형태로 응답
- 쿼리 타임아웃: 5초 (AbortSignal 또는 Promise.race)

## Steps
1. `src/api/middleware.ts` 생성
2. `authGuard(secret)` — hono/jwt 기반, 쿠키에서 token 읽기, 만료/위변조 시 401
3. `corsMiddleware()` — Hono cors() 헬퍼, 개발 모드에서 localhost:5173 허용
4. `errorHandler()` — Hono onError, 에러 유형별 HTTP 상태 코드 매핑
5. `queryTimeout(ms)` — c.set('queryTimeout', AbortSignal.timeout(ms)) 또는 미들웨어에서 타임아웃 설정
6. server.ts에 미들웨어 적용 순서: cors → errorHandler → authGuard(제외 경로) → queryTimeout
7. 테스트 작성

## Acceptance Criteria
- 유효한 JWT 쿠키 → 다음 핸들러로 진행
- 만료된 JWT → 401 `{ error: "Token expired" }`
- JWT 없음 → 401 `{ error: "Unauthorized" }`
- `/api/login`, `/api/logout`, `/api/health` → 인증 없이 접근 가능
- 라우트 핸들러에서 throw → JSON 에러 응답 (500 기본, 커스텀 상태 코드 지원)
- 5초 이상 걸리는 쿼리 → 504 `{ error: "Query timeout" }`
- CORS 헤더 설정 (개발 모드)

## Test Scenarios
- authGuard: 유효 JWT 쿠키 → 200 (다음 핸들러 실행)
- authGuard: 만료 JWT → 401 에러 응답
- authGuard: JWT 없음 → 401 에러 응답
- authGuard: /api/login 경로 → 인증 스킵
- authGuard: /api/health 경로 → 인증 스킵
- errorHandler: 핸들러에서 Error throw → 500 JSON 응답
- errorHandler: HttpError(404) throw → 404 JSON 응답
- queryTimeout: 5초 초과 요청 → 504 타임아웃 응답

## Validation
```bash
bun test -- tests/api/middleware.test.ts
bun run typecheck && bun run lint
```

## Out of Scope
- 구체적 API 라우트 (T-11-004~007)
- Rate limiting (후속)

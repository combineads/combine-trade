# T-11-002 인증 — Bun.password + hono/jwt + HttpOnly 쿠키

## Goal
단일 사용자 패스워드 인증 시스템을 구현한다. Bun.password로 해시 검증, hono/jwt로 JWT 발급, HttpOnly 쿠키로 전달한다.

## Why
웹 UI와 제어 API는 인증된 요청만 허용해야 한다. 단일 운영자이므로 아이디 없이 비밀번호만 사용하는 최소 인증.

## Inputs
- `docs/exec-plans/11-api-web.md` M1
- `docs/SECURITY.md` — 보안 정책
- T-11-001의 `src/api/server.ts`, `src/api/types.ts`

## Dependencies
- T-11-001 (API 서버)

## Expected Outputs
- `src/api/auth.ts` — `login(password): Promise<string>`, JWT 쿠키 설정 헬퍼
- `POST /api/login` 라우트
- `POST /api/logout` 라우트

## Deliverables
- `src/api/auth.ts`
- `tests/api/auth.test.ts`

## Constraints
- **Bun.password** 사용 (bcrypt/argon2 외부 패키지 금지)
- **hono/jwt** 사용 (jsonwebtoken 외부 패키지 금지)
- HttpOnly + SameSite=Strict + Secure(production) 쿠키
- JWT 만료: 24시간
- 패스워드 해시: 환경변수 `WEB_PASSWORD_HASH` 또는 CommonCode `AUTH.password_hash`
- CSRF 보호: Origin 헤더 검증 (SameSite=Strict + Origin check)
- JWT secret: 환경변수 `JWT_SECRET` 또는 CommonCode `AUTH.jwt_secret`

## Steps
1. `src/api/auth.ts` 생성 — AuthDeps 타입 (getPasswordHash, getJwtSecret)
2. `verifyPassword(input, hash)` — Bun.password.verify 래퍼
3. `generateToken(secret, expiresIn)` — hono/jwt sign
4. `createAuthRoutes(deps: AuthDeps)` — Hono 라우터:
   - `POST /api/login` — body { password } → 검증 → JWT 쿠키 설정 → 200
   - `POST /api/logout` — 쿠키 삭제 → 200
5. 쿠키 설정: `Set-Cookie: token=<jwt>; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`
6. CSRF: mutation 요청(POST/PUT/DELETE)에서 Origin 헤더가 허용 목록에 있는지 검증
7. 테스트 작성

## Acceptance Criteria
- POST /api/login { password: "correct" } → 200 + Set-Cookie (HttpOnly JWT)
- POST /api/login { password: "wrong" } → 401 `{ error: "Invalid password" }`
- POST /api/login { } → 400 `{ error: "Password required" }`
- POST /api/logout → 200 + 쿠키 삭제 (Max-Age=0)
- JWT 쿠키에 HttpOnly, SameSite=Strict 플래그
- 환경변수 미설정 시 CommonCode fallback

## Test Scenarios
- verifyPassword() with correct password → true
- verifyPassword() with wrong password → false
- POST /api/login with valid password → 200 + Set-Cookie header contains HttpOnly
- POST /api/login with invalid password → 401 error response
- POST /api/login with empty body → 400 validation error
- POST /api/logout → Set-Cookie with Max-Age=0 (쿠키 삭제)
- generateToken() → valid JWT that can be decoded with the same secret
- CSRF: POST without Origin header from allowed list → 403

## Validation
```bash
bun test -- tests/api/auth.test.ts
bun run typecheck && bun run lint
```

## Out of Scope
- 인증 미들웨어 (T-11-003에서 구현)
- 멀티유저 지원
- 리프레시 토큰

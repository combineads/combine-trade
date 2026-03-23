# T-186 wire-auth-entry-point

## Goal
`apps/api/src/index.ts`의 `stubAuth`를 `createAuth(drizzleAdapter(db, { provider: "pg" }))`로 교체한다.

## Why
현재 모든 auth 엔드포인트(`/api/auth/*`)가 stub을 반환하므로 실제 로그인이 불가능하다. 이 wiring 없이는 어떤 authenticated API 테스트도 불가능하다.

## Inputs
- T-185 완료 (better-auth 테이블 존재)
- `apps/api/src/index.ts` — 현재 `stubAuth` 위치 확인
- `packages/auth/` 또는 auth 설정 파일 (EP18 T-176에서 작성)
- `db/index.ts` (T-184 산출물)

## Dependencies
T-184, T-185

## Expected Outputs
- `apps/api/src/index.ts` — auth wiring 완료 (stubAuth 제거)
- `POST /api/auth/sign-in/email` 엔드포인트 동작

## Deliverables
- `apps/api/src/index.ts` (수정)

## Constraints
- `createAuth` 설정은 EP18 T-176 패턴을 따를 것
- `drizzleAdapter`의 `provider: "pg"` 설정 필수
- Health 엔드포인트 (`GET /api/v1/health`)는 auth 없이도 200을 반환해야 함

## Steps
1. `apps/api/src/index.ts`에서 `stubAuth` 관련 코드 찾기
2. EP18 auth 설정 파일에서 `createAuth` 시그니처 확인
3. `stubAuth` → `createAuth(drizzleAdapter(db, { provider: "pg" }))` 교체
4. `db` import 추가
5. `bun run typecheck` 확인
6. 서버 기동 후 `GET /api/v1/health` → 200 확인 (auth bypass 동작 검증)

## Acceptance Criteria
- `GET /api/v1/health` → 200 (no credentials)
- `POST /api/auth/sign-in/email` 엔드포인트가 503이 아닌 응답 반환 (200 또는 401 — 아직 user 없어도 됨)
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
# 서버 기동 후:
curl -s http://localhost:3000/api/v1/health | jq .
curl -s -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}' | jq .status
```

## Out of Scope
- OAuth, 2FA, RBAC
- Admin user 생성 (T-187 범위)
- SSE auth 검증

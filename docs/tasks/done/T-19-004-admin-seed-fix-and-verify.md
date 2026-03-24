# T-19-004 admin-seed-fix-and-verify

## Goal
`db/seed/admin.ts`의 dynamic import 경로를 수정하고, `bun run db:seed:admin` 실행 후 실제 로그인이 성공함을 확인한다.

## Why
EP18 T-18-008에서 admin seed 스크립트가 작성됐으나 `../index.js` import 경로가 맞지 않아 실패했을 수 있다. Auth wiring(T-19-003) 후 실제 로그인 검증이 필요하다.

## Inputs
- T-19-003 완료 (auth wiring 완료)
- `db/seed/admin.ts` (EP18 T-18-008 산출물)
- `db/index.ts` (T-19-001 산출물)

## Dependencies
T-19-003

## Expected Outputs
- `db/seed/admin.ts` — import 경로 수정 완료, idempotent 동작
- `bun run db:seed:admin` 성공
- admin 계정으로 `POST /api/auth/sign-in/email` → 200 + session cookie

## Deliverables
- `db/seed/admin.ts` (수정)

## Constraints
- seed는 idempotent — 이미 admin이 있으면 skip (에러 발생 안 됨)
- admin 이메일: `admin@combine.trade`, 비밀번호: `changeme-on-first-login`
- 실행 중인 API 서버 필요 (curl 테스트)

## Steps
1. `db/seed/admin.ts` 읽기 — import 경로 확인 (`../index.js` → 실제 경로로 수정)
2. `bun run db:seed:admin` 실행
3. 에러 발생 시 경로 수정 후 재실행
4. API 서버 기동 후 curl로 로그인 테스트:
   ```bash
   curl -c /tmp/cookies.txt -s -X POST http://localhost:3000/api/auth/sign-in/email \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@combine.trade","password":"changeme-on-first-login"}' | jq .
   ```
5. 인증 후 보호된 엔드포인트 접근 확인:
   ```bash
   curl -b /tmp/cookies.txt -s http://localhost:3000/api/v1/strategies | jq .
   ```

## Acceptance Criteria
- `bun run db:seed:admin` exits 0 (두 번 실행해도 에러 없음)
- `POST /api/auth/sign-in/email` admin 자격증명 → 200 + session cookie
- `GET /api/v1/strategies` with session → 200 (빈 배열 허용)
- `GET /api/v1/strategies` without session → 401

## Validation
```bash
bun run db:seed:admin
# 서버 기동 후:
curl -c /tmp/cookies.txt -s -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@combine.trade","password":"changeme-on-first-login"}' | jq .
curl -b /tmp/cookies.txt -s http://localhost:3000/api/v1/strategies | jq .
curl -s http://localhost:3000/api/v1/strategies | jq .status
```

## Out of Scope
- 다른 seed 데이터 (test strategies, demo data)
- 비밀번호 변경 flow

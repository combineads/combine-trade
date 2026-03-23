# T-195 auth-e2e-integration-test

## Goal
`tests/integration/auth-api-wiring.test.ts`를 작성한다: login → CRUD → logout → 401 전체 플로우 + User A/B 격리 검증. `README.md` quick-start에 `db:seed:admin` 단계를 추가한다.

## Why
모든 DB wiring이 완료된 후 실제 DB 대상으로 end-to-end 검증이 필요하다. 단위 테스트는 mock을 사용하지만, 이 통합 테스트는 real test DB에서 실제 HTTP 흐름을 검증한다.

## Inputs
- T-184~T-194 완료 (모든 dep wiring 완료)
- `DATABASE_URL_TEST` 환경변수 설정 (`.env`)
- 기존 통합 테스트 패턴 (`db/__tests__/` 또는 `tests/integration/`)
- `README.md` 현재 quick-start 섹션

## Dependencies
T-184, T-185, T-186, T-187, T-188, T-189, T-190, T-191, T-192, T-193, T-194

## Expected Outputs
- `tests/integration/auth-api-wiring.test.ts` — E2E 통합 테스트
- `README.md` — quick-start 업데이트

## Deliverables
- `tests/integration/auth-api-wiring.test.ts`
- `README.md` (수정)

## Constraints
- `DATABASE_URL_TEST` 사용 — production DB 건드리지 않음
- 테스트 전/후 test DB cleanup (테스트 격리)
- `bun test` 로 실행 가능
- User isolation 테스트: User A로 생성한 strategy → User B 토큰으로 접근 → 404 또는 403

## Steps
1. 기존 통합 테스트 패턴 확인 (디렉터리 구조, setup/teardown 방식)
2. `tests/integration/auth-api-wiring.test.ts` 작성:
   ```
   beforeAll: test DB migrate, admin seed
   afterAll: test DB cleanup

   test 1: Login flow
     - POST /api/auth/sign-in/email → 200 + cookie
     - GET /api/v1/strategies (with cookie) → 200
     - POST /api/auth/sign-out → 200
     - GET /api/v1/strategies (without cookie) → 401

   test 2: CRUD flow
     - Login as admin
     - POST /api/v1/strategies → 201
     - GET /api/v1/strategies → 200, contains created strategy
     - GET /api/v1/kill-switch/status → 200

   test 3: User isolation
     - Create User A, User B
     - Login as User A, create strategy
     - Login as User B, GET /api/v1/strategies → User A strategy not included
   ```
3. `README.md` quick-start 섹션에 `bun run db:seed:admin` 추가 (migrate 다음 단계)
4. `bun test tests/integration/auth-api-wiring.test.ts` 실행
5. `bun run typecheck && bun run lint` 확인

## Acceptance Criteria
- 통합 테스트 3개 시나리오 모두 통과
- `bun run typecheck && bun run lint` 통과
- README quick-start이 end-to-end 정확함

## Validation
```bash
bun test tests/integration/auth-api-wiring.test.ts
bun run typecheck && bun run lint
```

## Browser Verification
- http://localhost:3000/login → admin@combine.trade / changeme-on-first-login 입력 → Login 클릭 → /dashboard URL 확인
- http://localhost:3000/login → 인증 없이 보호 페이지 접근 → /login 리디렉션 확인

## Out of Scope
- 모든 API 엔드포인트의 통합 테스트 (핵심 auth + wiring 플로우만)
- 성능 테스트
- 부하 테스트
- README 전면 재작성

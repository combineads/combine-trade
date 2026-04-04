# T-11-013 API + 웹 통합 테스트 (E2E 검증)

## Goal
API 서버 전체 엔드포인트와 웹 빌드 통합을 검증하는 E2E 테스트를 작성한다.

## Why
개별 라우트 테스트만으로는 인증 흐름, 미들웨어 체인, 정적 파일 서빙, 에러 전파 등 통합 동작을 검증할 수 없다.

## Inputs
- T-11-001~007의 모든 API 라우트
- T-11-008~012의 웹 빌드 결과물

## Dependencies
- T-11-007 (제어 API — 마지막 API 태스크)
- T-11-012 (거래 내역 — 마지막 웹 태스크)

## Expected Outputs
- `tests/api/e2e.test.ts` — API 통합 테스트

## Deliverables
- `tests/api/e2e.test.ts`

## Constraints
- 전체 API 서버를 실제로 기동 (Bun.serve) 후 HTTP 요청으로 테스트
- 인증 흐름: login → 쿠키 → 인증 필요 엔드포인트 → 성공
- 미인증 흐름: 쿠키 없이 → 401
- DB는 mock 또는 test DB (기존 테스트 인프라 활용)
- 킬 스위치는 mock (실제 거래소 호출 방지)

## Steps
1. 테스트 setUp: createApiServer(mockDeps) → start()
2. 인증 흐름 테스트: POST /api/login → 쿠키 획득 → GET /api/positions → 200
3. 미인증 거부 테스트: GET /api/positions (쿠키 없음) → 401
4. 전체 조회 엔드포인트 스모크 테스트 (인증 후 각각 호출)
5. 제어 API 테스트: PUT /api/mode, POST /api/trade-blocks
6. 에러 핸들링 테스트: 잘못된 요청 → JSON 에러 응답
7. 정적 파일 서빙 테스트: GET / → HTML (./public 빌드 결과물)
8. tearDown: stop()

## Acceptance Criteria
- 전체 인증 흐름 (login → 인증 요청 → logout → 미인증 거부) 통과
- 모든 조회 API 엔드포인트 200 응답
- 제어 API 정상 동작
- 에러 핸들링 JSON 응답
- 정적 파일 서빙 (./public 존재 시)
- 전체 테스트 < 10초

## Test Scenarios
- Full auth flow: login → use cookie → access protected route → 200
- Unauthenticated request → 401 for all protected routes
- GET /api/health without auth → 200 (public endpoint)
- GET /api/symbol-states with auth → 200 with array response
- GET /api/tickets with auth → 200 with paginated response
- GET /api/stats with auth → 200 with stats object
- PUT /api/mode with auth → 200, mode changed
- POST /api/kill-switch with auth → 200 (mock kill-switch)
- GET / → 200 HTML content (static file serving)
- Invalid JSON body → 400 error response
- Expired JWT → 401 response

## Validation
```bash
bun test -- tests/api/e2e.test.ts
bun run typecheck && bun run lint
```

## Out of Scope
- 브라우저 자동화 테스트 (Playwright 등)
- 부하 테스트

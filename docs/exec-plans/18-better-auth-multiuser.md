# 18-better-auth-multiuser

## Objective

현재 수동 구현된 자체 JWT 인증(`packages/shared/auth/`)을 **better-auth** 라이브러리로 교체하고,
데이터 격리 스키마를 추가하여 **멀티유저**를 안전하게 지원한다.

기존 `10-auth` 에픽의 단일 사용자 전제를 폐기하고, 이 에픽이 인증/인가의 새로운 단일 진실점이 된다.

### 현재 상태 (문제)
- `packages/shared/auth/`에 jwt.ts / token.ts 두 가지 JWT 구현이 혼재 — 페이로드 구조 불일치(`sub` vs `userId`)
- `apps/api/src/middleware/auth.ts` authPlugin: 구현됐지만 dead code (다른 authGuardPlugin이 사용됨)
- 로그아웃이 무의미 — refresh token DB 폐기 연결 없음 (`saveRefreshToken`, `isRefreshTokenRevoked` no-op)
- `AuthService`(`service.ts`) 완전 구현됐으나 실제 라우트에서 미사용
- CORS 전체 허용 (`cors()` 설정 없음)
- 로그인 brute force 보호 없음
- `@elysiajs/helmet` TECH_STACK.md에 명시됐으나 미설치, 미적용
- `strategies`, `orders`, `kill_switch_state`, `daily_loss_limits` 등 핵심 테이블에 `user_id` 없음

## Scope

### 인증 교체
- `better-auth` 설치 및 Drizzle 어댑터 연결
- better-auth 스키마 마이그레이션 (user/session/account/verification 테이블)
- 기존 `users` 테이블과 better-auth `user` 테이블 정렬
- Elysia better-auth 플러그인 적용
- 로그인/로그아웃/토큰갱신 엔드포인트 better-auth 위임
- CORS origin allowlist 적용
- `@elysiajs/helmet` 보안 헤더 적용
- better-auth built-in rate limiting (로그인 5회/분, API 100회/분)

### 레거시 코드 삭제
- `packages/shared/auth/jwt.ts` — 삭제
- `packages/shared/auth/token.ts` — 삭제
- `packages/shared/auth/middleware.ts` — 삭제
- `packages/shared/auth/service.ts` — 삭제 (미사용)
- `packages/shared/auth/types.ts` — 필요한 타입만 유지 또는 better-auth 타입으로 대체
- `apps/api/src/middleware/auth.ts` — 삭제 (dead code)
- `apps/api/src/routes/auth.ts` — 삭제 (better-auth 라우트로 대체)
- `server.ts` 내 `authGuardPlugin` 인라인 로직 — better-auth 미들웨어로 대체

### 멀티유저 DB 격리
- `strategies` → `user_id UUID NOT NULL FK` 추가
- `orders` → `user_id UUID NOT NULL FK` 추가
- `kill_switch_state` → `user_id UUID NOT NULL FK` 추가
- `kill_switch_events` → `user_id UUID NOT NULL FK` 추가
- `daily_loss_limits` → `user_id UUID NOT NULL FK` 추가
- `daily_pnl_tracking` → `user_id UUID NOT NULL FK` 추가
- 기존 데이터 백필: 기존 단일 유저 레코드에 초기 관리자 `user_id` 할당
- 격리 파생 테이블 (strategy FK를 통해 자동 격리): `strategy_events`, `decisions`, `alerts`, `entry_snapshots`, `vector_table_registry`

### 클라이언트 인증 플로우
- Next.js 웹: better-auth React client (`@better-auth/react`) 적용
- Tauri 데스크탑: better-auth vanilla client 적용

## Non-goals
- 소셜 로그인 (OAuth) — 추후 확장 가능
- 2FA / MFA
- 역할 기반 접근 제어(RBAC) — 현재는 모든 사용자가 동일 권한
- 조직/팀 멀티테넌시
- 사용자 self-registration — 관리자가 계정 생성

## Prerequisites
- `10-auth` EP 범위 포함 (이 에픽이 대체함)
- `08-api-ui` M1 — Elysia API 서버 존재
- `00-project-bootstrap` M3 — Drizzle + PostgreSQL 동작

## Milestones

### M1 — better-auth 설치 및 스키마 마이그레이션

- Deliverables:
  - `better-auth`, `better-auth/adapters/drizzle` 설치
  - `@elysiajs/helmet` 설치
  - `packages/shared/auth/better-auth.ts` — better-auth 인스턴스 설정
    ```typescript
    export const auth = betterAuth({
      database: drizzleAdapter(db, { provider: "pg" }),
      emailAndPassword: { enabled: true },
      advanced: {
        cookiePrefix: "combine-trade",
        generateId: () => crypto.randomUUID(),
      },
    });
    ```
  - better-auth Drizzle 스키마 생성: `user`, `session`, `account`, `verification` 테이블
  - 기존 `users` 테이블 → better-auth `user` 테이블로 통합 마이그레이션
    - `users.email` → `user.email`
    - `users.password_hash` → `account.password` (emailAndPassword provider)
    - `users.name` → `user.name`
    - `users.id` → 유지 (UUID PK)
  - 마이그레이션 파일 생성 및 적용
- Acceptance criteria:
  - `bun run db:migrate` 성공
  - better-auth 인스턴스 import 가능
  - user/session/account 테이블 DB에 존재
  - 기존 `users` 데이터 유실 없음
- Validation:
  ```bash
  bun run db:migrate && bun run typecheck
  ```

### M2 — 서버 인증 교체 + 레거시 삭제

- Deliverables:
  - `apps/api/src/server.ts` — better-auth Elysia 플러그인 적용
    ```typescript
    import { betterAuthPlugin } from "better-auth/integrations/elysia";
    app.use(betterAuthPlugin(auth))
    ```
  - Public paths를 better-auth에 위임 (`/api/auth/**` 자동 처리)
  - `server.ts` 내 `authGuardPlugin` 인라인 로직 → better-auth 세션 미들웨어로 교체
  - CORS 설정:
    ```typescript
    cors({
      origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:3001",
      credentials: true,
    })
    ```
  - `@elysiajs/helmet` 적용 (HSTS, X-Frame-Options, X-Content-Type-Options, CSP)
  - **레거시 삭제**:
    - `packages/shared/auth/jwt.ts` 삭제
    - `packages/shared/auth/token.ts` 삭제
    - `packages/shared/auth/middleware.ts` 삭제
    - `packages/shared/auth/service.ts` 삭제
    - `apps/api/src/middleware/auth.ts` 삭제
    - `apps/api/src/routes/auth.ts` 삭제
  - `ALLOWED_ORIGIN` 환경 변수 `.env.example`에 추가
- Acceptance criteria:
  - `POST /api/auth/sign-in/email` → 세션/토큰 발급
  - `POST /api/auth/sign-out` → 세션 폐기
  - `GET /api/auth/get-session` → 현재 세션 반환
  - 토큰 없는 요청 → 401
  - `GET /api/v1/health` → 인증 없이 200
  - 레거시 파일 없음 (`packages/shared/auth/jwt.ts` 등)
  - 보안 헤더 응답에 포함 (`Strict-Transport-Security` 등)
  - CORS wildcard 없음
- Validation:
  ```bash
  bun run typecheck && bun test -- --filter "auth"
  curl -s http://localhost:3000/api/v1/health | jq .
  curl -s -X POST http://localhost:3000/api/auth/sign-in/email \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com","password":"test"}' | jq .
  ```

### M3 — 멀티유저 DB 스키마 (user_id 격리)

- Deliverables:
  - 스키마 변경 — `user_id UUID NOT NULL` + FK to `user.id`:
    - `db/schema/strategies.ts`
    - `db/schema/orders.ts`
    - `db/schema/kill-switch.ts` (killSwitchState + killSwitchEvents)
    - `db/schema/daily-loss-limits.ts` (dailyLossLimits + dailyPnlTracking)
  - 마이그레이션 생성 및 적용
  - 데이터 백필 SQL: 기존 레코드에 초기 관리자 user_id 할당
    ```sql
    -- 예시 백필
    UPDATE strategies SET user_id = (SELECT id FROM "user" LIMIT 1) WHERE user_id IS NULL;
    ```
  - `db/schema/index.ts` 업데이트
- Acceptance criteria:
  - `bun run db:migrate` 성공
  - 모든 대상 테이블에 `user_id NOT NULL` 컬럼 존재
  - 기존 데이터 user_id 값 있음
  - 스키마 타입 체크 통과
- Validation:
  ```bash
  bun run db:generate && bun run db:migrate && bun run typecheck
  ```

### M4 — Repository 및 라우트 user 격리

- Deliverables:
  - 전략 Repository — 모든 쿼리에 `user_id` 필터:
    - `findAll(userId)` → `WHERE user_id = $1`
    - `findById(id, userId)` → `WHERE id = $1 AND user_id = $2`
    - `create(data, userId)` → `user_id` 자동 할당
    - `update(id, data, userId)` → ownership 검증
    - `delete(id, userId)` → ownership 검증
  - 주문 Repository — `user_id` 필터 추가
  - Kill switch Repository — `user_id` 필터 추가
  - Daily loss limit Repository — `user_id` 필터 추가
  - API 라우트에서 better-auth 세션의 `userId` 추출:
    ```typescript
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new UnauthorizedError();
    const userId = session.user.id;
    ```
  - 모든 라우트 핸들러 — `userId` 파라미터 주입 및 repo 호출에 전달
  - 크로스유저 접근 시 404 반환 (403이 아닌 404로 존재 자체 노출 방지)
- Acceptance criteria:
  - User A의 전략이 User B 토큰으로 조회 불가 (404)
  - 자신의 전략 정상 조회/수정/삭제
  - 전략 생성 시 `user_id` 자동 설정
  - Kill switch 활성화가 다른 유저에게 영향 없음
- Validation:
  ```bash
  bun test -- --filter "user-isolation|strategy-auth|kill-switch-auth"
  ```

### M5 — 클라이언트 인증 플로우

- Deliverables:
  - **Next.js 웹** (`apps/web/`):
    - `better-auth` React client 설치 (`createAuthClient`)
    - 로그인 페이지 (`/login`) — better-auth `signIn.email()` 호출
    - 세션 상태 관리 — `useSession()` hook 활용
    - 미인증 라우트 redirect (Next.js middleware)
    - 자동 세션 갱신
    - 로그아웃 — `signOut()` + redirect
  - **Tauri 데스크탑** (`apps/desktop/`):
    - better-auth vanilla client (`createAuthClient`) 적용
    - fetch base URL을 Tauri에서 API 서버로 설정
    - 로그인 화면 (`LoginView`) — `packages/ui/views/`에 공통 컴포넌트
    - 세션 저장 — Tauri plugin-store (Keychain)
    - 자동 갱신 로직
  - `packages/ui/hooks/useAuth.ts` — 플랫폼 무관 auth hook
- Acceptance criteria:
  - 웹: 미인증 → `/login` redirect → 로그인 성공 → 대시보드 이동
  - 웹: 세션 만료 → 자동 갱신 → 사용자 경험 끊김 없음
  - 데스크탑: 앱 재시작 후 세션 유지 (Keychain)
  - 로그아웃 후 보호 라우트 접근 불가
- Validation:
  ```bash
  bun test -- --filter "auth-client|login"
  ```

### M6 — 보안 강화 + 최종 정리

- Deliverables:
  - `ALLOWED_ORIGIN` 환경 변수 검증 로직 (unset 시 경고 로그)
  - Rate limiting 검증 — better-auth 내장 rate limit 동작 확인
    - 로그인: 5회/분 초과 → 429
    - 일반 API: 100회/분
  - SSE 연결 인증 — better-auth 세션 검증 (`/api/v1/sse`)
  - 초기 관리자 계정 시드 스크립트 (`db/seed/admin.ts`)
    ```bash
    bun run db:seed:admin  # 최초 실행 시 1회
    ```
  - `docs/SECURITY.md` 업데이트 — better-auth 기반 인증으로 내용 갱신
  - `docs/exec-plans/10-auth.md` deprecated 표시 (이 에픽으로 대체됨)
  - `packages/shared/auth/` 디렉토리 정리 — 남은 파일: `encryption.ts`, `password.ts`만 유지
  - `TECH_STACK.md` better-auth 항목 실제 사용 현황으로 업데이트
  - Integration test: 전체 인증 플로우 (가입 → 로그인 → API 접근 → 로그아웃 → 재접근 거부)
- Acceptance criteria:
  - 로그인 6회 연속 → 429 응답
  - SSE 연결: 토큰 없음 → 401
  - 보안 헤더 모든 응답에 포함
  - `packages/shared/auth/jwt.ts` 등 레거시 파일 없음
  - 통합 테스트 통과
- Validation:
  ```bash
  bun test -- --filter "auth-integration|rate-limit|sse-auth"
  bun run typecheck && bun run lint
  # 레거시 파일 없음 확인
  ls packages/shared/auth/  # encryption.ts, password.ts 만 존재해야 함
  ```

## Task candidates

| 번호 | 제목 | 설명 |
|------|------|------|
| T-18-001 | better-auth-setup-and-configuration | better-auth, @elysiajs/helmet 설치; drizzle adapter 설정 |
| T-18-009 | migrate-users-table-to-better-auth | user/session/account/verification 테이블 생성; users 테이블 통합 마이그레이션 |
| T-18-002 | replace-server-auth-middleware | server.ts 내 authGuardPlugin 제거; better-auth Elysia 플러그인 + helmet + CORS 적용 |
| T-18-003 | delete-legacy-auth-code | packages/shared/auth/{jwt,token,middleware,service}.ts 삭제; apps/api/src/middleware/auth.ts 삭제; apps/api/src/routes/auth.ts 삭제 |
| T-18-004 | multiuser-db-schema | strategies/orders/kill_switch_state/kill_switch_events/daily_loss_limits/daily_pnl_tracking 테이블 user_id 추가 + 마이그레이션 + 백필 |
| T-18-005 | repository-user-isolation | StrategyRepository, OrderRepository, KillSwitchRepository, LossLimitRepository 모든 메서드에 userId 파라미터 추가; 쿼리에 user_id 필터 적용 |
| T-18-006 | route-session-extraction | 모든 API 라우트에서 better-auth 세션 추출 후 userId를 repo에 전달 |
| T-18-007 | nextjs-auth-client | Next.js better-auth client 설정; 로그인 페이지; 세션 미들웨어; useAuth hook |
| (not implemented) | tauri-auth-client | Tauri better-auth vanilla client; LoginView 공통 컴포넌트; Keychain 세션 저장 |
| (not implemented) | sse-auth | SSE 엔드포인트 better-auth 세션 검증 적용 |
| T-18-008 | admin-seed-script-and-integration-tests | 초기 관리자 계정 시드 스크립트 + 전체 인증 플로우 통합 테스트: 로그인 → API → 로그아웃 → 재접근 거부; user isolation 테스트 |

## Risks

| 위험 | 영향 | 완화 방안 |
|------|------|----------|
| better-auth Drizzle 어댑터 + Bun 런타임 호환성 | 높음 | M1에서 기본 동작 먼저 검증; 문제 시 custom adapter 작성 |
| 기존 `users` 테이블 → better-auth `user` 테이블 마이그레이션 데이터 손실 | 높음 | 마이그레이션 전 pg_dump 백업; 컬럼 매핑 명시적 검증 |
| 기존 clients(웹/데스크탑)가 `/api/v1/auth/*` 경로에 의존 중인 경우 | 중간 | better-auth 기본 경로는 `/api/auth/*`; 필요시 basePath 설정으로 맞춤 |
| user_id 추가 후 기존 단일유저 데이터 백필 누락 | 중간 | 마이그레이션 스크립트에 NOT NULL default + 백필 SQL 포함; migrate 후 count 검증 |

## Decision log

| 날짜 | 결정 | 근거 |
|------|------|------|
| 2026-03-23 | better-auth 도입, 자체 JWT 구현 전면 교체 | 현재 자체 구현에 페이로드 불일치 버그, 로그아웃 미작동, rate limiting 없음 등 복합 결함 존재. better-auth가 이를 모두 해결하고 추후 OAuth/2FA 확장도 가능 |
| 2026-03-23 | 단일사용자 전제(10-auth) 폐기, 멀티유저로 전환 | 외부 인터넷 노출 환경에서 단일유저라도 데이터 격리는 필수 보안 요건. 추후 공유 인스턴스 확장 가능성도 고려 |
| 2026-03-23 | strategies/orders/kill_switch/daily_loss_limits에만 user_id 직접 추가 | 나머지 테이블(events, decisions, alerts 등)은 strategy FK를 통해 간접 격리 — 스키마 변경 최소화 |
| 2026-03-23 | 크로스유저 접근 시 404 반환 | 403은 존재 자체를 노출함. 404로 정보 유출 방지 |
| 2026-03-23 | `packages/shared/auth/`에서 encryption.ts, password.ts만 유지 | encryption.ts는 거래소 API키 암호화에 계속 사용. password.ts는 Bun.password Argon2id 래퍼로 유지 가치 있음 |

## Progress notes

- 2026-03-23: 에픽 생성. 10-auth를 대체하는 새 에픽.

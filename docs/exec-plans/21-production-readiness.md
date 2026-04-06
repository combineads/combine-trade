# EP-21: 프로덕션 준비 — 보안 강화 + UI 완성

## Objective

프로덕션 배포에 필요한 보안 강화와 UI 미비 사항을 해결한다. API 인증 완성, 보호 미들웨어 추가, 로깅 보안, 404 페이지 등을 구현하여 단일 운영자가 안전하게 사용할 수 있는 상태를 달성한다.

## Scope

- `src/api/server.ts` (L8): auth 라우트 마운트, 보안 헤더, 바디 크기 제한
- `src/api/auth.ts` (L8): Secure 쿠키 플래그, `GET /api/me`
- `src/api/middleware.ts` (L8): rate limiter, CORS 설정 가능화
- `src/core/logger.ts` (L0): 민감값 스크러빙
- `src/web/` (standalone): 404 페이지, 글로벌 에러 바운더리
- `.gitignore`, `package.json`: 운영 위생

## Non-goals

- 멀티유저 인증/인가 (단일 운영자 시스템)
- OAuth/SSO 연동
- WAF 또는 외부 보안 프록시 구성
- HTTPS 인프라 (리버스 프록시 영역)
- 거래소 API 키 로테이션 자동화

## Prerequisites

- EP-11 (API/Web) 완료 ✅ — auth.ts, middleware.ts, server.ts, 웹 3개 화면
- EP-14 (auto-transfer) 완료 ✅ — transfer/scheduler.ts (console.log 전환 대상)
- EP-18/19 완료 ✅ — 최신 코드 상태

## Milestones

### M1 — API 인증 완성 (Critical + High)

- Deliverables:
  - `src/api/server.ts` 수정:
    - `createAuthRoutes` import & mount (현재 auth 라우트가 server에 마운트 안 됨)
    - `jwtSecret` 필수화 (옵셔널 → 필수, 미설정 시 서버 시작 거부)
  - `src/api/auth.ts` 수정:
    - `GET /api/me` 엔드포인트 추가 (프론트엔드 인증 상태 확인)
    - `buildSetCookie()` + `buildClearCookie()`에 `Secure` 플래그 추가 (개발 시 NODE_ENV=development 조건부)
  - `src/daemon.ts` 수정: `JWT_SECRET` 환경변수를 `createApiServer()`에 필수 전달
- Acceptance criteria:
  - `jwtSecret` 없이 `createApiServer()` 호출 시 에러 throw
  - `POST /api/login` → JWT 쿠키 발급 (Secure; HttpOnly; SameSite=Strict)
  - `GET /api/me` → 인증된 사용자 정보 반환 (401 if no auth)
  - 인증 없이 `POST /api/kill-switch` 호출 시 401
  - 프론트엔드 로그인/로그아웃 플로우 정상 동작
- Validation:
  - `bun test -- --grep "auth"`
  - `bun run typecheck`

### M2 — API 보호 미들웨어 (High + Medium)

- Deliverables:
  - `src/api/middleware.ts` — rate limiter 미들웨어 (in-memory token bucket):
    - `POST /api/login`: 5회/분/IP
    - `POST /api/transfers/trigger`: 1회/분
    - `POST /api/kill-switch`: 1회/분
    - `PUT /api/mode`: 5회/분
  - `src/api/server.ts` — 보안 헤더:
    - `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'`
    - `X-Frame-Options: DENY`
    - `X-Content-Type-Options: nosniff`
  - `src/api/server.ts` — `bodyLimit(1MB)` 미들웨어
  - `src/api/middleware.ts` — CORS origin 환경변수 `CORS_ORIGIN` 지원 (기본값 same-origin)
- Acceptance criteria:
  - 로그인 6번째 시도 시 429 Too Many Requests 반환
  - 응답 헤더에 X-Frame-Options, X-Content-Type-Options, CSP 포함
  - 2MB 바디 전송 시 413 Payload Too Large 반환
  - `CORS_ORIGIN` 환경변수로 origin 변경 가능
- Validation:
  - `bun test -- --grep "rate-limit|security-header|body-limit|cors"`
  - `bun run typecheck`

### M3 — 로깅 보안 + 운영 위생 (Medium)

- Deliverables:
  - `src/core/logger.ts` 수정 — `buildEntry()`에 민감값 스크러빙:
    - 키 패턴 `/password|secret|apiKey|apiSecret|token|authorization/i` → `"[REDACTED]"`
  - `src/transfer/scheduler.ts` 수정: `console.log`/`console.error` → `createLogger("transfer-scheduler")` 전환
  - `.gitignore` 수정: `.env.test` 패턴 추가
  - `package.json` 수정: 프로덕션 의존성 `^` → 정확한 버전 고정 (ccxt, hono 등)
- Acceptance criteria:
  - `logger.info("test", { password: "abc" })` → JSON에 `"[REDACTED]"` 표시
  - TransferScheduler 로그가 JSON 구조화 형식
  - `.env.test`가 git 추적에서 제거됨
  - `ccxt`, `hono` 등 핵심 패키지가 정확한 버전 (^ 없음)
- Validation:
  - `bun test -- --grep "logger-scrub|transfer-scheduler"`
  - `bun run typecheck && bun run lint`

### M4 — 웹 UI 완성 (IA.md Known Gaps)

- Deliverables:
  - `src/web/src/pages/NotFoundPage.tsx` — 404 페이지:
    - "페이지를 찾을 수 없습니다" 안내
    - 대시보드 돌아가기 링크
    - DESIGN_SYSTEM.md 토큰 사용 (다크 모드)
  - `src/web/src/App.tsx` (또는 라우터) — catch-all `*` 라우트 → NotFoundPage
  - `src/web/src/components/ErrorBoundary.tsx` — 글로벌 에러 바운더리:
    - React Error Boundary 래퍼
    - 에러 발생 시 "오류가 발생했습니다" + 새로고침 버튼
    - 에러 상세 console.error (프로덕션에서는 숨김)
  - `src/web/src/main.tsx` 수정 — ErrorBoundary 래핑
- Acceptance criteria:
  - `/invalid-path` 접근 시 NotFoundPage 표시 (S04)
  - 대시보드 돌아가기 링크 → `/` 이동
  - React 렌더링 에러 시 ErrorBoundary가 fallback UI 표시 (앱 크래시 방지)
  - `bun run build:web` 성공
- Validation:
  - `bun run build:web`
  - `bun run typecheck && bun run lint`

## Task candidates

- T-21-001: api/server.ts — auth 라우트 마운트 + jwtSecret 필수화
- T-21-002: api/auth.ts — GET /api/me 엔드포인트 + Secure 쿠키 플래그
- T-21-003: api/middleware.ts — rate limiter (in-memory token bucket, 엔드포인트별)
- T-21-004: api/server.ts — secureHeaders (CSP, X-Frame-Options, X-Content-Type-Options)
- T-21-005: api/server.ts — bodyLimit(1MB) + CORS origin 환경변수화
- T-21-006: core/logger.ts — 민감값 스크러빙 (deny-list 키 매칭)
- T-21-007: transfer/scheduler.ts — console.log → 구조화 로거 전환
- T-21-008: .gitignore + package.json — 운영 위생 (env 제외, 버전 고정)
- T-21-009: web/NotFoundPage.tsx — 404 페이지 + catch-all 라우트
- T-21-010: web/ErrorBoundary.tsx — 글로벌 에러 바운더리 + main.tsx 래핑
- T-21-011: 보안 + UI 통합 테스트 (E2E 검증)

## Risks

- **Secure 쿠키로 로컬 개발 차단**: `Secure` 플래그는 HTTPS에서만 쿠키 전송. **완화**: `NODE_ENV=development` 시 조건부 적용. 브라우저는 localhost에서 Secure 쿠키 허용.
- **Rate limiter 메모리 누수**: 장기 운영 시 IP 엔트리 누적. **완화**: TTL 기반 자동 정리. 단일 운영자이므로 IP 수 극히 제한.
- **의존성 버전 고정 후 업데이트 누락**: 보안 패치 수동 관리 필요. **완화**: 월 1회 audit + Slack 리마인더.
- **jwtSecret 필수화 시 기존 설정 깨짐**: 환경변수 미설정 시 데몬 시작 불가. **완화**: .env.example에 `JWT_SECRET=changeme` 추가, 매뉴얼 업데이트.

## Decision log

- **in-memory rate limiter**: Redis 불필요 (단일 프로세스/단일 운영자). 프로세스 재시작 시 카운터 리셋 허용.
- **Secure 쿠키 조건부**: `NODE_ENV !== "development"` 조건.
- **404 페이지**: IA.md에서 Medium 심각도로 권장. 간단한 안내 + 대시보드 링크면 충분.
- **ErrorBoundary**: IA.md에서 Low 심각도. 하지만 React 앱 안정성을 위해 구현. Slack이 주 알림 채널이므로 에러 리포팅 서비스(Sentry 등)는 추가 안 함.
- **EP-17 보안 감사 항목 중 의존성 audit(osv-scanner) 제외**: bun 생태계에서 안정적 audit 도구가 아직 미성숙. 수동 확인으로 대체.
- **UUID 형식 검증**: trade-blocks/:id에 대한 입력 검증은 defense-in-depth. Drizzle ORM이 이미 UUID 타입 검증하므로 우선순위 낮음 → 이번 에픽에서 포함하되 M2에서 간단 구현.

## Progress notes

- 2026-04-06: 에픽 생성. EP-17 보안 감사 + IA.md Known Gaps 통합.

# 18-security-hardening

## Objective
보안 감사(2026-04-05) 발견 사항 11건(C1/H3/M7)을 해결하여 프로덕션 배포 가능한 보안 수준을 달성한다. 인증 시스템 완성, API 보호 강화, 운영 보안 기반 확보가 목표다.

## Scope
- `src/api/server.ts` (L8): 인증 라우트 마운트, 보안 헤더, 바디 크기 제한
- `src/api/auth.ts` (L8): Secure 쿠키 플래그, rate limiting
- `src/api/middleware.ts` (L8): 보안 미들웨어, CORS 설정 가능화
- `src/core/logger.ts` (L0): 민감값 스크러빙
- `src/transfer/scheduler.ts` (L7): 구조화 로거 전환
- `.gitignore`, `package.json`: 운영 위생

## Non-goals
- 멀티유저 인증/인가 (단일 운영자 시스템)
- OAuth/SSO 연동
- WAF 또는 외부 보안 프록시 구성
- 거래소 API 키 로테이션 자동화
- 전체 HTTPS 인프라 구성 (리버스 프록시 영역)

## Prerequisites
- EP-11 (API/Web) 완료 — auth.ts, middleware.ts, server.ts 존재
- EP-14 (auto-transfer) 완료 — transfer/scheduler.ts 존재
- `docs/reports/security-audit-2026-04-05.md` — 발견 사항 참조

## Milestones

### M1 — 인증 시스템 완성 (CRITICAL + HIGH)
- Deliverables:
  - `src/api/server.ts` 수정: `createAuthRoutes` import & mount
  - `src/api/server.ts` 수정: `jwtSecret` 필수 필드화 (옵셔널 → 필수, 미설정 시 서버 시작 거부)
  - `src/api/auth.ts` 수정: `GET /api/me` 엔드포인트 추가 (프론트엔드 인증 상태 확인용)
  - `src/api/auth.ts` 수정: `buildSetCookie()` + `buildClearCookie()`에 `Secure` 플래그 추가
  - `src/daemon.ts` 수정: `JWT_SECRET` 환경변수를 `createApiServer()`에 전달 확인
  - 보안 감사 Finding: A01-001 (CRITICAL), A02-001 (HIGH)
- Acceptance criteria:
  - `jwtSecret` 없이 `createApiServer()` 호출 시 에러 throw
  - `POST /api/login` → JWT 쿠키 발급 (Secure; HttpOnly; SameSite=Strict)
  - `GET /api/me` → 인증된 사용자 정보 반환 (401 if no auth)
  - 인증 없이 `POST /api/kill-switch` 호출 시 401
  - 프론트엔드 로그인/로그아웃 플로우 정상 동작
- Validation:
  - `bun test -- --grep "auth"`
  - `bun run typecheck`

### M2 — API 보호 강화 (HIGH + MEDIUM)
- Deliverables:
  - `src/api/middleware.ts` 수정: rate limiter 미들웨어 추가 (in-memory token bucket)
    - `POST /api/login`: 5회/분/IP
    - `POST /api/transfers/trigger`: 1회/분
    - `POST /api/kill-switch`: 1회/분
    - `PUT /api/mode`: 5회/분
  - `src/api/server.ts` 수정: Hono `secureHeaders` 미들웨어 또는 수동 헤더 설정
    - `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'`
    - `X-Frame-Options: DENY`
    - `X-Content-Type-Options: nosniff`
  - `src/api/server.ts` 수정: `bodyLimit(1MB)` 미들웨어 추가
  - `src/api/middleware.ts` 수정: CORS origin을 환경변수 `CORS_ORIGIN`에서 읽기 (기본값 same-origin)
  - 보안 감사 Finding: A07-001 (HIGH), A05-004 (HIGH), A04-001 (MEDIUM), A05-002 (MEDIUM)
- Acceptance criteria:
  - 로그인 6번째 시도 시 429 Too Many Requests 반환
  - 응답 헤더에 X-Frame-Options, X-Content-Type-Options, CSP 포함
  - 2MB 바디 전송 시 413 Payload Too Large 반환
  - `CORS_ORIGIN` 환경변수로 CORS origin 변경 가능
- Validation:
  - `bun test -- --grep "rate-limit\|security-header\|body-limit\|cors"`
  - `bun run typecheck`

### M3 — 로깅 보안 & 운영 위생 (MEDIUM)
- Deliverables:
  - `src/core/logger.ts` 수정: `buildEntry()`에 민감값 스크러빙 추가
    - 키 패턴 `/password|secret|apiKey|apiSecret|token|authorization/i` → 값을 `"[REDACTED]"` 치환
  - `src/transfer/scheduler.ts` 수정: `console.log`/`console.error` → `createLogger("transfer-scheduler")` 전환
  - `.gitignore` 수정: `.env.test` 패턴 추가 + `git rm --cached .env.test`
  - `package.json` 수정: 프로덕션 의존성 `^` → 정확한 버전 고정 (최소 `ccxt`, `jsonwebtoken`, `hono`)
  - 보안 감사 Finding: A09-001 (MEDIUM), A09-002 (MEDIUM), A05-001 (MEDIUM), A05-003 (MEDIUM)
- Acceptance criteria:
  - `logger.info("test", { password: "abc" })` → JSON 출력에 `"[REDACTED]"` 표시
  - TransferScheduler 로그가 JSON 구조화 형식
  - `.env.test`가 git 추적에서 제거됨
  - `ccxt`, `jsonwebtoken`, `hono`가 정확한 버전 (^ 없음)
- Validation:
  - `bun test -- --grep "logger-scrub\|transfer-scheduler"`
  - `git ls-files .env.test` → 빈 출력
  - `bun run typecheck`
  - `bun run lint`

### M4 — 의존성 보안 & 검증
- Deliverables:
  - `package.json` scripts에 `"audit"` 스크립트 추가 (osv-scanner 또는 npm audit via package-lock.json)
  - 최초 audit 실행 + 발견된 HIGH/CRITICAL CVE 문서화
  - `src/api/routes/control.ts` 수정: `DELETE /trade-blocks/:id`에 UUID 형식 검증 추가
  - 보안 감사 Finding: A06-001 (MEDIUM), path param validation (defense-in-depth)
- Acceptance criteria:
  - `bun run audit` 실행 가능 + 결과 출력
  - 잘못된 UUID 형식의 `:id` 파라미터 → 400 Bad Request
- Validation:
  - `bun run audit`
  - `bun test -- --grep "uuid-validation\|trade-block"`
  - `bun run typecheck`

## Task candidates
- T-19-001: auth 라우트 server.ts 마운트 + jwtSecret 필수화 + GET /api/me
- T-19-002: JWT 쿠키 Secure 플래그 추가 (buildSetCookie + buildClearCookie)
- T-19-003: rate limiter 미들웨어 구현 (in-memory token bucket, 엔드포인트별 설정)
- T-19-004: secureHeaders 미들웨어 (CSP, X-Frame-Options, X-Content-Type-Options)
- T-19-005: bodyLimit 미들웨어 (1MB 글로벌)
- T-19-006: CORS origin 환경변수 설정 가능화
- T-19-007: logger.ts 민감값 스크러빙 (deny-list 필터)
- T-19-008: TransferScheduler console.log → 구조화 로거 전환
- T-19-009: .env.test git 제거 + .gitignore 업데이트
- T-19-010: 프로덕션 의존성 버전 고정 (ccxt, jsonwebtoken, hono 등)
- T-19-011: 의존성 audit 스크립트 추가 (osv-scanner 또는 npm audit)
- T-19-012: UUID 형식 검증 유틸 + trade-blocks/:id 적용

## Risks
- **Rate limiter 메모리 누수**: in-memory token bucket은 장기 운영 시 IP 엔트리가 누적될 수 있음. **완화**: 오래된 엔트리 자동 정리 (TTL 기반), 단일 운영자 시스템이므로 IP 수가 극히 제한적.
- **Secure 쿠키로 로컬 개발 차단**: `Secure` 플래그는 HTTPS에서만 쿠키 전송. **완화**: `NODE_ENV=development` 시 Secure 조건부 적용, 또는 개발 시 `localhost` 예외 (브라우저가 localhost에서는 Secure 쿠키 허용).
- **의존성 버전 고정 후 업데이트 누락**: 정확한 버전 고정 시 보안 패치를 수동 업데이트해야 함. **완화**: 월 1회 의존성 audit 스케줄 + Dependabot 또는 수동 체크.
- **CORS 제거 시 개발 환경 영향**: 프로덕션에서 CORS 비활성화 시 로컬 개발(Vite 프록시)에 영향. **완화**: 환경변수 분기 (`CORS_ORIGIN` 미설정 시 기존 localhost 유지).

## Decision log
- **in-memory rate limiter 선택**: Redis 등 외부 저장소 없이 단일 프로세스 Map 기반. 이유: 단일 운영자/단일 서버 시스템이므로 분산 rate limiting 불필요. 프로세스 재시작 시 카운터 리셋되지만 허용.
- **Secure 쿠키 조건부 적용**: 개발 환경에서는 HTTP를 사용할 수 있으므로, `process.env.NODE_ENV !== "development"` 조건으로 Secure 플래그 적용. localhost는 대부분 브라우저에서 Secure 쿠키를 허용하지만, 안전하게 조건부 처리.
- **osv-scanner 우선**: `bun audit` 미지원, `npm audit`은 lockfile 불일치. osv-scanner는 bun.lock 직접 파싱 가능. 설치: `brew install osv-scanner` 또는 CI에서 바이너리 다운로드.
- **A09-002 (로거 스크러빙) 범위**: 현재 callers가 시크릿을 전달하지 않으므로 예방적 조치. 오버헤드 최소화를 위해 키 이름 매칭만 수행 (값 패턴 매칭 미실시).

## Consensus Log
- (계획 단계)

## Progress notes
- (작업 전)

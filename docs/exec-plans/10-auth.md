# 10-auth

> **DEPRECATED** — superseded by `docs/exec-plans/18-better-auth-multiuser.md`.
> All auth implementation is now in EP18. This document is retained for historical reference only.

> ⚠️ **DEPRECATED** — 이 에픽은 `18-better-auth-multiuser`로 대체됩니다. 새 작업은 18번 에픽을 참조하세요.

## Objective
Elysia API 서버에 인증/인가 레이어를 구축하여 미인증 접근을 차단한다. 단일 사용자 시스템이지만 API가 네트워크에 노출될 수 있으므로, 모든 API 엔드포인트와 WebSocket/SSE 연결에 인증이 필수이다.

## Scope
- `packages/shared/auth/` — 인증 도메인 로직
- Elysia 인증 미들웨어 (API 게이트)
- 세션/토큰 관리
- Tauri 앱 인증 흐름
- Next.js 웹 인증 흐름
- 거래소 API 키 암호화 저장/관리

## Non-goals
- 멀티유저 / 역할 기반 접근 제어 (RBAC)
- OAuth / 소셜 로그인
- 2FA (추후 확장 가능)

## Prerequisites
- `00-project-bootstrap` M2 (모노레포), M3 (DB), M5 (IoC/AOP)
- `08-api-ui` M1 (Elysia API 서버) — 인증 미들웨어 적용 대상

Note: 이 에픽은 08-api-ui와 병렬 또는 직후에 진행. API 엔드포인트가 존재해야 미들웨어 적용 가능하지만, 인증 없이 API를 외부에 노출해서는 안 됨.

## Milestones

### M1 — Authentication foundation
- Deliverables:
  - `packages/shared/auth/` — 인증 모듈
  - 사용자 계정 스키마: `users` 테이블 (id, email, password_hash, created_at)
  - 초기 관리자 계정 시드 (첫 실행 시 생성)
  - 비밀번호 해싱: Argon2id (memory: 64MB, iterations: 3, parallelism: 4) per SECURITY.md specification
  - JWT 토큰 발급/검증
    - Access token: 짧은 수명 (15분)
    - Refresh token: 긴 수명 (7일), DB 저장, 폐기 가능
- Acceptance criteria:
  - 비밀번호 해싱 후 저장 (평문 저장 금지)
  - JWT 발급/검증 정상 작동
  - Refresh token 폐기(revoke) 가능
- Validation:
  ```bash
  bun test -- --filter "auth"
  ```

### M2 — API authentication middleware
- Deliverables:
  - Elysia 인증 미들웨어: 모든 API 요청에 JWT 검증
  - 예외 경로: `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `GET /api/v1/health` (public)
  - 미인증 요청: 401 Unauthorized 반환
  - 만료 토큰: 401 + 갱신 안내
  - SSE 스트리밍 연결: 초기 연결 시 토큰 검증
  - Login API: `POST /api/v1/auth/login` → { access_token, refresh_token }
  - Refresh API: `POST /api/v1/auth/refresh` → { access_token }
  - Logout API: `POST /api/v1/auth/logout` → refresh token 폐기
- Acceptance criteria:
  - 토큰 없는 API 호출 → 401
  - 유효 토큰 → 정상 응답
  - 만료 토큰 → 401
  - 폐기된 refresh token → 401
  - health 엔드포인트는 인증 없이 접근 가능
- Validation:
  ```bash
  bun test -- --filter "auth-middleware"
  ```

### M3 — Client authentication flows
- Deliverables:
  - **Next.js 웹**:
    - 로그인 페이지
    - 토큰 저장 (httpOnly cookie 또는 secure storage)
    - API 요청 시 자동 토큰 첨부
    - 토큰 만료 시 자동 갱신 (refresh token)
    - 로그아웃 흐름
  - **Tauri 앱**:
    - 로그인 화면
    - Tauri secure storage에 토큰 저장
    - API 요청 시 자동 토큰 첨부
    - 자동 갱신
- Acceptance criteria:
  - 로그인 → 토큰 획득 → API 접근 가능
  - 토큰 만료 → 자동 갱신 → 사용자 경험 끊김 없음
  - 로그아웃 → 토큰 폐기 → API 접근 불가
- Validation:
  ```bash
  bun test -- --filter "auth-client"
  ```

### M4 — Exchange API key secure management
- Deliverables:
  - 거래소 API 키 암호화 저장 스키마: `exchange_credentials` 테이블
  - 암호화: AES-256-GCM (master key는 환경변수)
  - CRUD API: 키 등록, 조회(마스킹), 삭제
  - 키 조회 시 마스킹 (`sk-****...1234`)
  - 메모리 내 복호화 (디스크에 평문 절대 불가)
  - 기존 `.env` 기반 키를 DB 암호화 저장으로 마이그레이션 경로
  - **Master key 로테이션 유틸리티**:
    - 기존 master key → 새 master key로 모든 암호화 데이터 재암호화
    - CLI 명령어: `bun run auth:rotate-master-key`
    - 로테이션 중 서비스 중단 최소화 (기존 키로 복호화 → 새 키로 암호화)
    - 로테이션 완료 로그 및 검증
- Acceptance criteria:
  - API 키가 DB에 암호화 저장
  - 조회 API에서 마스킹된 값만 반환
  - 실행 시에만 복호화 (메모리 내)
  - Master key 없이는 복호화 불가
- Validation:
  ```bash
  bun test -- --filter "credential|api-key"
  ```

## Task candidates
- T-10-001: Create users table schema and initial admin seed
- T-10-006: Implement password hashing (Argon2id)
- T-10-005: Implement JWT access/refresh token service
- T-18-003: Implement refresh token storage and revocation (superseded by EP18 better-auth)
- T-10-007: Build Elysia authentication middleware
- T-10-008: Implement login/refresh/logout API endpoints
- T-10-002: Add authentication exception for public routes (health, login)
- T-18-011: Implement SSE connection authentication (superseded by EP18)
- T-18-007: Build Next.js login page and auth flow + token storage and auto-refresh (superseded by EP18)
- T-18-010: Build Tauri login screen and secure token storage (superseded by EP18)
- T-10-009: Implement exchange API key encryption service (AES-256-GCM)
- T-10-004: Build exchange credential CRUD API with masking
- T-18-008: Integration test: login → token → API access → refresh → logout (superseded by EP18)
- T-10-010: Implement master key rotation CLI utility
- T-10-011: Test: master key rotation with zero data loss verification

## Risks
- JWT secret key 관리: 환경변수 유출 시 모든 토큰 위조 가능
- Tauri secure storage의 플랫폼별 차이 (macOS Keychain, Windows Credential Manager)
- 단일 사용자 시스템에서의 인증 UX 마찰 (매번 로그인)
  - 완화: 긴 refresh token 수명(7일) + remember me 옵션
- API 키 암호화 master key 분실 시 복구 불가
  - 완화: 거래소에서 키 재발급 가능하므로 치명적이지 않음

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | JWT (세션 쿠키 아님) | Tauri + Next.js 모두 지원, stateless API 설계 |
| 2026-03-21 | Refresh token DB 저장 | 폐기(revoke) 가능해야 — 보안 사고 시 즉시 무효화 |
| 2026-03-21 | 거래소 키 AES-256-GCM 암호화 | .env 평문보다 안전, DB 유출 시에도 보호 |
| 2026-03-21 | 단일 사용자지만 인증 필수 | 네트워크 노출 가능성 + 실제 자금 보호 |

## Progress notes
- Pending implementation.

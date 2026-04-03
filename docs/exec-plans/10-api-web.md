# 10-api-web

## Objective
REST API와 웹 대시보드를 구현한다. 운영자가 시스템 상태를 모니터링하고 설정을 변경할 수 있는 인터페이스를 제공한다.

## Scope
- `src/api/` (L8): REST 라우트 (Hono + Bun.serve)
- `src/web/` (standalone): React + Vite + Zustand + TanStack Query SPA
- 인증: 단일 사용자 패스워드 → JWT (HttpOnly cookie)

## Non-goals
- 멀티유저 지원
- 모바일 네이티브 앱
- 실시간 차트 (초기 — 향후 WebSocket 추가 가능)
- 킬 스위치 구현 (EP-09 — 이 에픽은 API 엔드포인트 노출만)

## Prerequisites
- EP-01 (core, db, config) 완료
- EP-06 M1 (positions — 조회용) 완료
- EP-08 M3 (EventLog) 완료

## Milestones

### M1 — API 서버 & 인증
- Deliverables:
  - `src/api/server.ts` — Hono + Bun.serve 기반 HTTP 서버
  - `src/api/auth.ts` — 패스워드 검증 (bcrypt), JWT 발급, HttpOnly 쿠키
  - `src/api/middleware.ts` — 인증 미들웨어, CORS, 에러 핸들러, 쿼리 타임아웃
- Acceptance criteria:
  - 로그인 → JWT 쿠키 발급 → 인증된 요청만 허용
  - 패스워드는 bcrypt 해시 (CommonCode NOTIFICATION 그룹 또는 환경변수)
  - JWT 만료 시 자동 로그아웃
  - CSRF 보호 (SameSite + CSRF 토큰)
  - 쿼리 타임아웃 설정으로 이벤트 루프 점유 방지
- Validation:
  - `bun test -- --grep "api-auth"`

### M2 — 조회 API 엔드포인트
- Deliverables:
  - `GET /api/health` — 시스템 상태 (DB + 거래소 연결)
  - `GET /api/positions` — 활성 포지션 목록
  - `GET /api/tickets` — 티켓 이력 (cursor 기반 페이지네이션)
  - `GET /api/signals` — 시그널 이력 (cursor 기반 페이지네이션)
  - `GET /api/candles/:symbol/:exchange/:timeframe` — 캔들 데이터
  - `GET /api/config` — 현재 설정
  - `GET /api/events` — 이벤트 로그 (필터)
  - `GET /api/stats` — 대시보드 통계 (승률, PnL 등)
- Acceptance criteria:
  - 각 엔드포인트가 올바른 데이터 반환
  - 페이지네이션 지원 (cursor 기반)
  - 응답 시간 < 200ms
- Validation:
  - `bun test -- --grep "api-routes"`

### M3 — 제어 API 엔드포인트
- Deliverables:
  - `PUT /api/config` — 설정 변경
  - `POST /api/kill-switch` — 킬 스위치 트리거 (EP-09 킬 스위치 함수 호출)
  - `PUT /api/mode` — 실행 모드 전환
  - `POST /api/trade-blocks` — 수동 거래차단 추가
  - `DELETE /api/trade-blocks/:id` — 거래차단 삭제
- Acceptance criteria:
  - 설정 변경이 CommonCode + 메모리 캐시 즉시 반영
  - ANCHOR 그룹 수정 시 거부
  - 킬 스위치 API가 EP-09 `scripts/kill-switch.ts` 로직을 호출
- Validation:
  - `bun test -- --grep "api-control"`

### M4 — 웹 대시보드 기반 (로그인, 대시보드, 킬 스위치)
- Deliverables:
  - `src/web/` — Vite + React + Zustand + TanStack Query 초기화
  - 디자인 시스템 적용: DESIGN_SYSTEM.md 토큰 (다크 모드, 에메랄드 그린)
  - 페이지:
    - 로그인
    - 대시보드 (활성 포지션, 오늘 PnL, 시그널 현황, 시스템 상태)
    - 킬 스위치 버튼 (확인 대화상자 포함)
- Acceptance criteria:
  - DESIGN_SYSTEM.md 토큰 사용
  - TanStack Query 자동 리프레시 (5초)
  - 로그인 → JWT 인증 → 대시보드 접근
  - 킬 스위치 버튼 동작 (확인 대화상자 필수)
- Validation:
  - `bun run build` (웹 빌드 성공)
  - 브라우저 수동 확인

### M5 — 웹 이력/설정 페이지
- Deliverables:
  - 페이지:
    - 포지션 이력 (페이지네이션, 필터)
    - 시그널 이력 (페이지네이션, 필터)
    - 설정 관리 (CommonCode 편집, ANCHOR 보호)
    - 이벤트 로그 (필터, 검색)
  - 반응형 레이아웃
- Acceptance criteria:
  - 모든 페이지가 DESIGN_SYSTEM.md 토큰 사용
  - 페이지네이션/필터 정상 동작
  - ANCHOR 그룹 수정 시 UI에서도 거부
- Validation:
  - `bun run build` (웹 빌드 성공)
  - 브라우저 수동 확인

## Task candidates
- T-10-001: api/server.ts — Hono + Bun.serve HTTP 서버 기본
- T-10-002: api/auth.ts — 패스워드 인증 & JWT (HttpOnly, CSRF)
- T-10-003: api/middleware.ts — 인증, CORS, 에러, 쿼리 타임아웃 미들웨어
- T-10-004: api/routes/ — 조회 엔드포인트 (health, positions, tickets)
- T-10-005: api/routes/ — 조회 엔드포인트 (signals, candles, config, events, stats)
- T-10-006: api/routes/ — 제어 엔드포인트 (config, mode, kill-switch, trade-blocks)
- T-10-007: web/ — Vite + React 프로젝트 초기화 & 디자인 시스템 적용
- T-10-008: web/ — 로그인 페이지 & 인증 상태 관리
- T-10-009: web/ — 대시보드 페이지 (활성 포지션, PnL, 시그널) + 킬 스위치
- T-10-010: web/ — 포지션/시그널 이력 페이지
- T-10-011: web/ — 설정 관리 페이지
- T-10-012: web/ — 이벤트 로그 페이지

## Risks
- **Hono + Bun 호환성**: Hono는 Bun 공식 지원하므로 리스크 낮음.
- **JWT 보안**: HttpOnly 쿠키 + SameSite=Strict + CSRF 토큰 필수.
- **이벤트 루프 점유**: API 쿼리가 파이프라인을 지연시킬 수 있음. **완화**: 쿼리 타임아웃(5초), DB connection pool 분리(API용 vs 파이프라인용 고려).
- **프론트엔드 번들 크기**: 초기에는 차트 없이 테이블 기반 UI로 경량화.

## Decision log
- API 프레임워크는 Hono 사용 (Bun 네이티브 지원, 경량)
- 단일 프로세스에서 API 서버도 같이 실행 (별도 프로세스 아님) — 쿼리 타임아웃으로 이벤트 루프 보호
- 웹 빌드 결과물은 ./public에 저장, daemon이 정적 파일 서빙
- 초기에는 차트 없이 테이블/숫자 기반 대시보드 (차트는 후속)
- 킬 스위치 API 엔드포인트는 EP-09의 킬 스위치 로직을 호출 — 구현은 EP-09, 노출은 이 에픽
- 헬스체크 (`GET /api/health`)는 이 에픽(M2)에서 구현 — EP-09에서는 다루지 않음

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- (작업 전)

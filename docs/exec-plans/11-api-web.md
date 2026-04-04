# 11-api-web

## Objective
REST API와 웹 대시보드를 구현한다. 운영자가 시스템 상태를 모니터링하고 긴급 조치를 취할 수 있는 인터페이스를 제공한다. WEB_UI_SCREENS.md의 3개 화면(로그인, 대시보드, 거래 내역)을 구현 범위로 한다.

## Scope
- `src/api/` (L8): REST 라우트 (Hono + Bun.serve), daemon.ts에서 시작
- `src/web/` (standalone): React + Vite + Zustand + TanStack Query + Tailwind CSS SPA
- 인증: 단일 사용자 패스워드 (Bun.password) → JWT (HttpOnly cookie)
- 화면: 로그인, 대시보드, 거래 내역 (WEB_UI_SCREENS.md 기준 3개)

## Non-goals
- 멀티유저 지원
- 모바일 네이티브 앱
- 실시간 차트 (초기 — 향후 WebSocket 추가 가능)
- 킬 스위치 구현 (EP-09 — 이 에픽은 API 엔드포인트 노출만)
- 캔들 조회 API (`GET /api/candles` — 차트 없으므로 불필요)
- 설정 관리 페이지 (CommonCode 편집 UI — 후속 에픽)
- 이벤트 로그 전용 페이지 (후속 에픽)
- 시그널 이력 전용 페이지 (후속 에픽)

## Prerequisites
- EP-01~EP-10 전체 완료 ✅
  - EP-01: core, db, config (기반)
  - EP-05: signals, vectors, knn (조회 대상)
  - EP-06: positions, orders (조회 대상)
  - EP-08: EventLog, notifications (조회 대상)
  - EP-09: daemon, pipeline, kill-switch (API 통합 대상)
  - EP-10: strategy alignment (최신 코드 상태)

## Background
WEB_UI_SCREENS.md에 3개 화면이 설계되어 있다:
1. **로그인** — 단일 사용자 비밀번호 인증, 최대 400px 카드
2. **대시보드** — 시스템 상태 + 활성 포지션 + 오늘 PnL + 모드 전환 + 킬스위치
3. **거래 내역** — 완료 거래 테이블 + 승률/기대값/MDD 요약

공통: 다크 모드 전용, Inter + JetBrains Mono 폰트, DESIGN_SYSTEM.md 토큰 기반.

## Milestones

### M1 — API 서버 & 인증
- Deliverables:
  - `src/api/server.ts` — Hono + Bun.serve 기반 HTTP 서버, `./public` 정적 파일 서빙 (Hono serveStatic)
  - `src/api/auth.ts` — 패스워드 검증 (Bun.password.hash/verify), JWT 발급 (hono/jwt), HttpOnly 쿠키
  - `src/api/middleware.ts` — 인증 미들웨어, CORS, 에러 핸들러, 쿼리 타임아웃
  - `src/daemon.ts` 수정 — API 서버 시작/중지를 daemon lifecycle에 통합
- Acceptance criteria:
  - 로그인 → JWT 쿠키 발급 → 인증된 요청만 허용
  - 패스워드는 Bun.password 해시 (환경변수 `WEB_PASSWORD_HASH` 또는 CommonCode `AUTH.password_hash`)
  - JWT 만료 시 401 반환 → 클라이언트가 로그인 페이지로 리다이렉트
  - CSRF 보호 (SameSite=Strict + Origin 헤더 검증)
  - 쿼리 타임아웃 설정으로 이벤트 루프 점유 방지
  - daemon 시작 시 API 서버 자동 시작, 셧다운 시 정리
  - `./public` 디렉토리의 Vite 빌드 결과물을 정적 파일로 서빙
- Validation:
  - `bun test -- tests/api/`
  - `bun run typecheck && bun run lint`

### M2 — 조회 API 엔드포인트
대시보드와 거래 내역 화면에 필요한 데이터를 제공하는 읽기 전용 API.
- Deliverables:
  - `GET /api/health` — 시스템 상태 (DB 연결, 데몬 가동 시간)
  - `GET /api/symbol-states` — 심볼별 FSM 상태, 방향, 현재가, Trade Block 상태
  - `GET /api/positions` — 활성 포지션 목록 (티켓 기반)
  - `GET /api/tickets` — 완료 거래 이력 (cursor 페이지네이션 + 필터: 기간/심볼/거래소/결과)
  - `GET /api/signals/recent` — 최근 시그널 N건 (대시보드용)
  - `GET /api/events/recent` — 최근 이벤트 N건 (대시보드용)
  - `GET /api/stats` — 성과 통계 (오늘 PnL, 거래 수, 승률, 평균 손익비, MDD)
  - `GET /api/config` — 현재 설정 (실행 모드, Trade Block 목록)
- Acceptance criteria:
  - 각 엔드포인트가 올바른 데이터 반환
  - tickets API: 기간(오늘/7일/30일/전체), 심볼, 거래소, 결과 필터 지원
  - cursor 기반 페이지네이션 (tickets)
  - 응답 시간 < 200ms
  - 모든 금액/가격 필드는 string (Decimal.js 직렬화)
- Validation:
  - `bun test -- tests/api/`
  - `bun run typecheck && bun run lint`

### M3 — 제어 API 엔드포인트
- Deliverables:
  - `PUT /api/mode` — 실행 모드 전환 (analysis/alert/live). live 전환 시 확인 필요
  - `POST /api/kill-switch` — 킬 스위치 트리거 (EP-09 `killSwitch()` 호출)
  - `POST /api/trade-blocks` — 수동 거래차단 추가 (MANUAL 타입)
  - `DELETE /api/trade-blocks/:id` — 거래차단 삭제
- Acceptance criteria:
  - 모드 전환이 SymbolState.execution_mode + 메모리 즉시 반영
  - 킬 스위치 API가 EP-09 킬 스위치 로직을 호출하고 결과 반환
  - Trade Block CRUD가 DB + 메모리 캐시 동시 반영
  - 모든 제어 API 호출 시 EventLog 기록
- Validation:
  - `bun test -- tests/api/`
  - `bun run typecheck && bun run lint`

### M4 — 웹 기반 + 로그인
- Deliverables:
  - `src/web/` — Vite + React + Zustand + TanStack Query + Tailwind CSS 초기화
  - 디자인 시스템 적용: `docs/assets/tokens.css` 임포트, Inter + JetBrains Mono 폰트
  - 공통 레이아웃: 헤더 바 (로고, 네비게이션, 모드 드롭다운, Trade Block 토글, 킬스위치 버튼)
  - 로그인 페이지 (WEB_UI_SCREENS.md §1 기준)
  - 인증 상태 관리 (Zustand store, 401 인터셉터)
  - 빌드 파이프라인: `bun run build:web` → `./public/`
- Acceptance criteria:
  - `<html lang="ko">`, `color-scheme: dark`, `<meta name="theme-color">`
  - DESIGN_SYSTEM.md 토큰 사용 (배경 #0a0e14, 카드 #1e293b, primary #17b862)
  - 비밀번호 입력 → 로그인 → JWT 쿠키 → 대시보드 이동
  - 에러 상태: 빨간 테두리 + 인라인 메시지 + 자동 포커스
  - 로딩 상태: 버튼 스피너 + 비활성화
  - Enter 키 제출, `autocomplete="current-password"`
  - `:focus-visible` 스타일, 스킵 링크
  - `bun run build:web` 성공
- Validation:
  - `bun run build:web`
  - `bun run typecheck && bun run lint`

### M5 — 대시보드 + 거래 내역
- Deliverables:
  - 대시보드 페이지 (WEB_UI_SCREENS.md §2 기준):
    - 시스템 상태 행 (4개 미니 카드: 데몬 상태, 거래소 연결, 오늘 손실 한도, 세션 손실)
    - 심볼 상태 카드 (FSM 상태 배지, 방향 배지, 현재가, Trade Block 경고)
    - 활성 포지션 테이블 (심볼, 방향, 진입가, 현재가, 미실현 PnL, 청산 단계, SL 상태)
    - 오늘의 성과 카드 (큰 숫자 PnL, 거래 수, 승률)
    - 최근 거래 리스트 (5건)
    - 최근 시그널 리스트 (5건)
    - 킬스위치 확인 모달 (포커스 트랩, Esc 닫기)
    - 실거래 모드 전환 확인 모달
  - 거래 내역 페이지 (WEB_UI_SCREENS.md §3 기준):
    - 성과 요약 카드 행 (총 수익, 총 거래, 승률, 평균 손익비, 최대 낙폭)
    - 필터 영역 (기간 탭, 심볼/거래소/결과 드롭다운)
    - 거래 테이블 (시간, 심볼, 거래소, 방향, 진입가, 청산가, 수량, 실현 PnL, 결과)
    - 페이지네이션
    - 필터 상태 URL 쿼리 파라미터 반영
  - TanStack Query: 대시보드 5초 자동 리프레시
  - 반응형: 모바일 1열 전환
  - 빈 상태 / 로딩 상태 (skeleton pulse)
- Acceptance criteria:
  - 모든 숫자: JetBrains Mono + `font-variant-numeric: tabular-nums`
  - 수익 #22c55e / 손실 #ef4444 색상 구분 + 텍스트로도 상태 전달 (색맹 대응)
  - WATCHING 배지 pulse 애니메이션 + `prefers-reduced-motion` 대응
  - 킬스위치 모달: 포커스 트랩 + `overscroll-behavior: contain` + Esc 닫기
  - `touch-action: manipulation` (모바일 더블탭 방지)
  - `Intl.DateTimeFormat`/`Intl.NumberFormat` 사용
  - 시맨틱 HTML: `<table>`, `<nav aria-label>`, `role="tablist"`, `role="switch"`
  - 거래 내역 필터 → URL 쿼리 파라미터 동기화
  - 모든 링크 `<a>`/`<Link>` (Cmd+클릭 지원)
  - `bun run build:web` 성공
- Validation:
  - `bun run build:web`
  - `bun run typecheck && bun run lint`

## Task candidates → Generated tasks mapping
- T-11-001: api/server.ts — Hono + Bun.serve 서버 + 정적 파일 서빙 + daemon.ts 통합 [M1]
- T-11-002: api/auth.ts — Bun.password + hono/jwt 인증 + HttpOnly 쿠키 [M1]
- T-11-003: api/middleware.ts — auth guard, CORS, 에러 핸들러, 쿼리 타임아웃 [M1]
- T-11-004: api/routes/ — 조회 API: health, symbol-states, positions [M2]
- T-11-005: api/routes/ — 조회 API: tickets (필터+페이지네이션), stats (성과 통계) [M2]
- T-11-006: api/routes/ — 조회 API: signals/recent, events/recent, config [M2]
- T-11-007: api/routes/ — 제어 API: mode, kill-switch, trade-blocks CRUD [M3]
- T-11-008: web/ — Vite + React + Tailwind + 디자인 토큰 + 빌드 파이프라인 [M4]
- T-11-009: web/ — 로그인 페이지 + 인증 상태 관리 (Zustand) [M4]
- T-11-010: web/ — 대시보드: 헤더 + 시스템 상태 + 심볼 카드 + 활성 포지션 [M5]
- T-11-011: web/ — 대시보드: 오늘 성과 + 최근 거래 + 최근 시그널 + 킬스위치 모달 [M5]
- T-11-012: web/ — 거래 내역: 성과 요약 + 필터 + 테이블 + 페이지네이션 [M5]
- T-11-013: API + 웹 통합 테스트 (E2E 검증) [E2E]

## Risks
- **Hono + Bun 호환성**: Hono는 Bun 공식 지원하므로 리스크 낮음.
- **JWT 보안**: HttpOnly 쿠키 + SameSite=Strict + Origin 검증 필수.
- **이벤트 루프 점유**: API 쿼리가 파이프라인을 지연시킬 수 있음. **완화**: 쿼리 타임아웃(5초), DB connection pool 분리(API용 vs 파이프라인용 고려).
- **프론트엔드 번들 크기**: 차트 없이 테이블 기반 UI로 경량화. Tailwind CSS purge로 최소화.
- **daemon.ts 수정 범위**: API 서버 통합 시 기존 daemon.ts 구조 변경 필요. **완화**: startApiServer()/stopApiServer()를 DaemonDeps에 추가하는 DI 패턴.

## Decision log
- API 프레임워크는 Hono 사용 (Bun 네이티브 지원, 경량)
- 단일 프로세스에서 API 서버도 같이 실행 (별도 프로세스 아님) — daemon.ts에서 시작/중지 관리
- 쿼리 타임아웃으로 이벤트 루프 보호
- 웹 빌드 결과물은 ./public에 저장, Hono serveStatic으로 정적 파일 서빙
- 초기에는 차트 없이 테이블/숫자 기반 대시보드 (차트는 후속)
- 킬 스위치 API 엔드포인트는 EP-09의 킬 스위치 로직을 호출 — 구현은 EP-09, 노출은 이 에픽
- 헬스체크 (`GET /api/health`)는 이 에픽(M2)에서 구현 — EP-09에서는 다루지 않음
- **bcrypt 대신 Bun.password 사용** — 외부 의존성 제거, Bun 네이티브 Argon2id/bcrypt
- **jsonwebtoken 대신 hono/jwt 사용** — Hono 에코시스템 일관성, 외부 의존성 제거
- **캔들 조회 API 제외** — WEB_UI_SCREENS.md에 차트 없음, Non-goals에 실시간 차트 명시
- **WEB_UI_SCREENS.md 3화면만 구현** — 설정 관리/이벤트 로그/시그널 이력 전용 페이지는 후속 에픽으로
- **화면 설계는 WEB_UI_SCREENS.md 참고** — 최종 구현은 기술적 판단에 따라 조정 가능 (참고용, 정답 아님)
- **PUT /api/config 제거** — 설정 관리 페이지가 Non-goals이므로 config 수정 API도 불필요. 모드 전환/Trade Block은 별도 제어 API로 제공

## Consensus Log
- Round 1-2: EP-01~EP-13 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- 2026-04-04: 에픽 리뷰 완료. Critical 5건 수정: (1) Prerequisites EP-01~EP-10 전체 ✅, (2) bcrypt→Bun.password + jsonwebtoken→hono/jwt, (3) M4/M5 범위를 WEB_UI_SCREENS.md 3화면으로 정렬, (4) 조회 API에 symbol-states/signals/recent/events/recent 추가 + candles 제거, (5) T-11-004/005→004/005/006 3개로 분할. Important 5건: daemon.ts 통합 명시, candles API 제거, 접근성 체크리스트 반영, hono/jwt, 정적 파일 서빙 명시. PUT /api/config 제거 (설정 관리 페이지 없으므로).
- 2026-04-04: 태스크 생성 완료 (13개). 의존성: M1(T-11-001→002→003) 순차. M2(T-11-004/005/006)→T-11-003 의존. M3(T-11-007)→T-11-003 의존. M4(T-11-008→009)→T-11-001+002. M5(T-11-010→011, T-11-012)→M2/M3+T-11-009. E2E(T-11-013)→전체. Wave 1: T-11-001+008 독립. Wave 2: 002+003. Wave 3: 004~007+009 (WIP=2, 3사이클). Wave 4: 010~012 (WIP=2, 2사이클). Wave 5: 013.

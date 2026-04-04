# EP-11 API/Web — Archive Summary

- **Completed**: 2026-04-04
- **Tasks**: 13 (T-11-001 ~ T-11-013)
- **Tests added**: 144 API tests + 30 E2E tests
- **Source LOC**: ~5,500 (API ~2,500 + Web ~3,000)
- **Waves**: 8 (Wave 1~5: API, Wave 6~7: Web, Wave 8: E2E)
- **QA failures**: 0
- **Review rejections**: 0

## Key decisions
- Bun.password + hono/jwt — bcrypt/jsonwebtoken 외부 의존성 제거
- WEB_UI_SCREENS.md 3화면만 구현 (로그인, 대시보드, 거래 내역) — 설정 관리/이벤트 로그 후속
- daemon.ts에 optional apiServer DI — 기존 테스트 하위 호환
- Tailwind CSS 4 @theme 블록으로 DESIGN_SYSTEM.md 토큰 통합
- cursor 기반 페이지네이션 (tickets API)
- TanStack Query 5초 자동 리프레시 (대시보드)
- 킬스위치/모드전환 확인 모달 — 포커스 트랩 + Esc 닫기
- PUT /api/config 제거 — 설정 관리 페이지 없으므로 불필요

## Outputs produced
- `src/api/server.ts` — Hono + Bun.serve HTTP 서버, 정적 파일 서빙
- `src/api/auth.ts` — Bun.password 인증, hono/jwt, HttpOnly 쿠키
- `src/api/middleware.ts` — auth guard, CORS, error handler, query timeout
- `src/api/routes/health.ts` — GET /api/health
- `src/api/routes/symbol-states.ts` — GET /api/symbol-states
- `src/api/routes/positions.ts` — GET /api/positions
- `src/api/routes/tickets.ts` — GET /api/tickets (필터+페이지네이션)
- `src/api/routes/stats.ts` — GET /api/stats
- `src/api/routes/signals.ts` — GET /api/signals/recent
- `src/api/routes/events.ts` — GET /api/events/recent
- `src/api/routes/config.ts` — GET /api/config
- `src/api/routes/control.ts` — PUT /api/mode, POST /api/kill-switch, trade-blocks CRUD
- `src/web/` — Vite + React 19 + Tailwind CSS 4 + Zustand + TanStack Query
- `src/web/src/pages/LoginPage.tsx` — 로그인 페이지
- `src/web/src/pages/DashboardPage.tsx` — 대시보드 (시스템 상태, 심볼 카드, 포지션, 성과, 시그널)
- `src/web/src/pages/TradesPage.tsx` — 거래 내역 (필터, 테이블, 페이지네이션)
- `src/web/src/components/modals/` — KillSwitchModal, ModeChangeModal

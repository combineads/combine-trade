# T-11-008 웹 프로젝트 초기화 — Vite + React + Tailwind + 디자인 토큰

## Goal
`src/web/` 디렉토리에 Vite + React + Tailwind CSS 프로젝트를 초기화하고, DESIGN_SYSTEM.md 토큰을 적용한다.

## Why
EP-11 웹 UI(로그인, 대시보드, 거래 내역)의 기반 프로젝트. 디자인 토큰, 폰트, 빌드 파이프라인이 여기서 설정된다.

## Inputs
- `docs/DESIGN_SYSTEM.md` — 디자인 토큰
- `docs/assets/tokens.css` — CSS 커스텀 프로퍼티
- `docs/TECH_STACK.md` — React 19, Vite 8, Tailwind 4, Zustand 5, TanStack Query 5

## Dependencies
- T-11-001 (API 서버 — 정적 파일 서빙 경로 ./public)

## Expected Outputs
- `src/web/` 프로젝트 구조 (vite.config.ts, index.html, App.tsx, main.tsx)
- `bun run build:web` 스크립트 → `./public/` 빌드 출력
- Tailwind CSS + 디자인 토큰 적용

## Deliverables
- `src/web/vite.config.ts`
- `src/web/index.html`
- `src/web/src/main.tsx`
- `src/web/src/App.tsx`
- `src/web/src/index.css` (Tailwind + tokens.css 임포트)
- `src/web/tailwind.config.ts` (디자인 토큰 확��)
- `src/web/tsconfig.json`
- `package.json` 수정 (build:web 스크립트 추가)

## Constraints
- Vite outDir: `../../public` (프로젝트 루트 ./public)
- `<html lang="ko">`, `color-scheme: dark`, `<meta name="theme-color" content="#0a0e14">`
- Inter (UI) + JetBrains Mono (숫자) 폰트: Google Fonts + `font-display: swap`
- Tailwind 커스텀 색상: DESIGN_SYSTEM.md 토큰 (primary, neutral, semantic 색상)
- `docs/assets/tokens.css` 직접 임포트 또는 Tailwind theme으로 매핑
- React Router, Zustand, TanStack Query 설치 및 초기 설정
- 빈 상태에서 `bun run build:web` 성공해야 함

## Steps
1. `src/web/vite.config.ts` — React plugin, outDir: `../../public`, base: `/`
2. `src/web/index.html` — `<html lang="ko">`, meta 태그, font preconnect, root div
3. `src/web/src/main.tsx` — React.createRoot, QueryClientProvider, BrowserRouter, App
4. `src/web/src/App.tsx` — React Router Routes 기본 구조 (/, /login, /dashboard, /trades)
5. `src/web/src/index.css` — Tailwind directives + tokens.css 임포트
6. `src/web/tailwind.config.ts` — DESIGN_SYSTEM.md 색상을 theme.extend에 매핑
7. `src/web/tsconfig.json` — path alias @web/ → src/web/src/
8. `package.json`에 `"build:web": "cd src/web && bunx vite build"` 추가
9. 스킵 링크 `<a href="#main">본문으로 건너뛰기</a>` 추가

## Acceptance Criteria
- `bun run build:web` → `./public/index.html` + `./public/assets/*` 생성
- 브라우저에서 `http://localhost:PORT/` → 빈 React 앱 렌더링
- `<html lang="ko">` + `color-scheme: dark` 설정
- Inter + JetBrains Mono 폰트 로드 (font-display: swap)
- Tailwind 색상 토큰: `bg-neutral-950`, `text-primary-500` 등 사용 가능
- `bun run typecheck` 통과 (web tsconfig 포함)

## Test Scenarios
N/A — 프로젝트 초기화 태스크. 빌드 성공이 검증.

## Validation
```bash
bun run build:web
bun run typecheck && bun run lint
```

## Browser Verification
- http://localhost:3000/ → 빈 React 앱 렌더링 확인 (다크 배경 #0a0e14)

## Out of Scope
- 로그인 페이지 구현 (T-11-009)
- 대시보드/거래 내역 구현 (T-11-010~012)

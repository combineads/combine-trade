# T-11-009 로그인 페이지 + 인증 상태 관리

## Goal
WEB_UI_SCREENS.md §1 기반 로그인 페이지와 Zustand 인증 상태 관리를 구현한다.

## Why
웹 UI의 진입점. 비밀번호 인증 후 JWT 쿠키를 받아 대시보드로 이동한다.

## Inputs
- `docs/WEB_UI_SCREENS.md` §1 — 로그인 화면 설계
- T-11-008의 웹 프로젝트 구조
- T-11-002의 POST /api/login, POST /api/logout API

## Dependencies
- T-11-008 (웹 초기화)
- T-11-002 (인증 API)

## Expected Outputs
- `src/web/src/pages/LoginPage.tsx`
- `src/web/src/stores/auth.ts` — Zustand 인증 store
- `src/web/src/lib/api.ts` — fetch 래퍼 (401 인터셉터)

## Deliverables
- `src/web/src/pages/LoginPage.tsx`
- `src/web/src/stores/auth.ts`
- `src/web/src/lib/api.ts`
- `src/web/src/components/Layout.tsx` (공통 레이아웃 — 인증 라우트 가드)

## Constraints
- 비밀번호만 (아이디 없음 — 단일 사용자)
- `<form>` 래핑, Enter 키 제출
- `autocomplete="current-password"`, `spellCheck={false}`
- 에러 상태: 빨간 테두리 (#ef4444) + 인라인 메시지 + 자동 포커스
- 로딩 상태: 버튼 "로그인 중…" + 스피너 + 비활성화 (opacity 0.5)
- 포커스: `:focus-visible` outline 2px solid #17b862
- 카드: 최대 400px, 배경 #1e293b, 화면 정중앙
- 로고: "COMBINE TRADE" (#17b862, 700, 24px) + 부제 "Double-BB 자동매매 시스템"
- 하단: 버전 "v0.1.0" (#64748b, 12px)
- 401 인터셉터: API 응답 401 → auth store 로그아웃 → /login 리다이렉트
- TanStack Query는 이 태스크에서 설정하지 않음 (T-11-010에서)

## Steps
1. `src/web/src/lib/api.ts` — fetch 래퍼, baseUrl, 401 인터셉터
2. `src/web/src/stores/auth.ts` — Zustand store: isAuthenticated, login(password), logout()
3. `src/web/src/pages/LoginPage.tsx` — 로그인 폼, 에러/로딩 상태
4. `src/web/src/components/Layout.tsx` — 인증 체크, 미인증→/login 리다이렉트, 헤더 바 구조
5. App.tsx 라우트 업데이트: /login → LoginPage, /→Layout(대시보드), /trades→Layout(거래내역)
6. 접근성: `<label>`, `:focus-visible`, 에러 시 자동 포커스

## Acceptance Criteria
- /login → 비밀번호 입력 카드 렌더링
- 올바른 비밀번호 입력 → POST /api/login → 쿠키 설정 → / (대시보드) 이동
- 잘못된 비밀번호 → 빨간 테두리 + "비밀번호가 일치하지 않습니다" 메시지
- 빈 제출 → 클라이언트 검증 에러
- Enter 키로 제출 가능
- 로딩 중 버튼 비활성화 + 스피너
- 인증 상태에서 /login 접근 → / 리다이렉트
- 미인증 상태에서 / 접근 → /login 리다이렉트
- 401 응답 → 자동 로그아웃 + /login 이동

## Test Scenarios
N/A — UI 컴포넌트 태스크. 빌드 성공 + 브라우저 검증.

## Validation
```bash
bun run build:web
bun run typecheck && bun run lint
```

## Browser Verification
- http://localhost:3000/login → 로그인 카드 렌더링 (다크 배경, 에메랄드 버튼)
- http://localhost:3000/login → 비밀번호 입력 + Enter → 대시보드 이동
- http://localhost:3000/login → 잘못된 비밀번호 → 에러 메시지 표시

## Out of Scope
- 대시보드/거래 내역 페이지 (T-11-010~012)
- 헤더 바 세부 구현 (모드 드롭다운, 킬스위치 — T-11-010/011)

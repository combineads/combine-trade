# T-11-010 대시보드 — 헤더 + 시스템 상태 + 심볼 카드 + 활성 포지션

## Goal
대시보드 페이지의 헤더 바, 시스템 상태 행, 심볼 상태 카드, 활성 포지션 테이블을 구현한다.

## Why
대시보드의 좌측 영역(메인 정보)과 헤더 바(네비게이션 + 제어). "지금 잘 돌고 있나?"를 한눈에 확인하는 핵심 영역.

## Inputs
- `docs/WEB_UI_SCREENS.md` §2 — 대시보드 화면 설계
- T-11-004의 GET /api/health, GET /api/symbol-states, GET /api/positions
- T-11-009의 Layout, auth store

## Dependencies
- T-11-009 (로그인 + 레이아웃)
- T-11-004 (health, symbol-states, positions API)

## Expected Outputs
- `src/web/src/pages/DashboardPage.tsx`
- `src/web/src/components/dashboard/` — SystemStatusRow, SymbolCard, PositionsTable
- `src/web/src/components/Header.tsx` — 전체 헤더 바

## Deliverables
- `src/web/src/pages/DashboardPage.tsx`
- `src/web/src/components/Header.tsx`
- `src/web/src/components/dashboard/SystemStatusRow.tsx`
- `src/web/src/components/dashboard/SymbolCard.tsx`
- `src/web/src/components/dashboard/PositionsTable.tsx`
- `src/web/src/hooks/useApi.ts` (TanStack Query 커스텀 훅)

## Constraints
- TanStack Query: 5초 자동 리프레시 (refetchInterval: 5000)
- 헤더 바: "COMBINE TRADE" 로고 + 네비게이션("대시보드", "거래 내역") + 실행 모드 드롭다운 + Trade Block 토글 + 킬스위치 버튼
- 시스템 상태 행: 4개 미니 카드 (데몬 상태, 거래소 연결, 오늘 손실 한도, 세션 손실)
- 심볼 카드: FSM 배지(WATCHING=보라, 대기=회색, 포지션=초록), 방향 배지, 현재가 (JetBrains Mono 20px)
- WATCHING 배지: pulse 애니메이션 + `prefers-reduced-motion` 대응
- 활성 포지션 테이블: `<table>` 시맨틱 마크업, 수익 #22c55e / 손실 #ef4444
- 포지션 없을 때: "활성 포지션 없음" 빈 상태
- 로딩: skeleton pulse
- 2열 그리드 (좌 60%, 우 40%) — 모바일 1열
- 모든 숫자 JetBrains Mono + tabular-nums

## Steps
1. `src/web/src/hooks/useApi.ts` — TanStack Query useQuery 래퍼 (refetchInterval 설정)
2. `src/web/src/components/Header.tsx` — 로고, 네비게이션 링크, 모드 드롭다운(API 연동), Trade Block 토글, 킬스위치 버튼(빨간)
3. Layout.tsx에 Header 통합
4. `SystemStatusRow.tsx` — GET /api/health 데이터로 4개 미니 카드
5. `SymbolCard.tsx` — GET /api/symbol-states 데이터, FSM/방향 배지, Trade Block 경고 바
6. `PositionsTable.tsx` — GET /api/positions 데이터, 시맨틱 테이블, PnL 색상
7. `DashboardPage.tsx` — 2열 그리드 레이아웃, 좌측에 위 컴포넌트 배치
8. 로딩/빈 상태 처리

## Acceptance Criteria
- 대시보드 접속 → 시스템 상태 4카드 + 심볼 카드 2개 + 활성 포지션 테이블
- 5초마다 자동 리프레시
- WATCHING 상태 → 보라 배지 + pulse 애니메이션
- `prefers-reduced-motion` → pulse 없이 배지만 표시
- 활성 포지션 없음 → "활성 포지션 없음" 텍스트
- 수익 포지션 → PnL 초록, 손실 → 빨강
- 헤더 네비게이션: "대시보드" 활성, "거래 내역" 링크
- 모바일 → 1열 레이아웃
- `<table>`, `<th scope="col">`, `<nav aria-label>` 시맨틱 마크업

## Test Scenarios
N/A — UI 컴포넌트 태스크. 빌드 성공 + 브라우저 검증.

## Validation
```bash
bun run build:web
bun run typecheck && bun run lint
```

## Browser Verification
- http://localhost:3000/ → 대시보드 렌더링 (헤더 + 시스템 상태 + 심볼 카드 + 포지션 테이블)
- http://localhost:3000/ → 5초 후 데이터 자동 리프레시 확인
- http://localhost:3000/ → 모바일 뷰포트에서 1열 레이아웃

## Out of Scope
- 대시보드 우측 영역 (T-11-011)
- 킬스위치 모달 (T-11-011)
- 거래 내역 페이지 (T-11-012)

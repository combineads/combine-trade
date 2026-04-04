# T-11-012 거래 내역 — 성과 요약 + 필터 + 테이블 + 페이지네이션

## Goal
WEB_UI_SCREENS.md §3 기반 거래 내역 페이지를 구현한다: 성과 요약 카드, 필터, 거래 테이블, 페이지네이션.

## Why
운영자가 과거 거래 성과를 확인하고 필터링하는 핵심 분석 화면.

## Inputs
- `docs/WEB_UI_SCREENS.md` §3 — 거래 내역 화면 설계
- T-11-005의 GET /api/tickets, GET /api/stats

## Dependencies
- T-11-010 (대시보드 — Header, Layout 재사용)
- T-11-005 (tickets + stats API)

## Expected Outputs
- `src/web/src/pages/TradesPage.tsx`
- `src/web/src/components/trades/` — PerformanceSummary, TradeFilters, TradesTable, Pagination

## Deliverables
- `src/web/src/pages/TradesPage.tsx`
- `src/web/src/components/trades/PerformanceSummary.tsx`
- `src/web/src/components/trades/TradeFilters.tsx`
- `src/web/src/components/trades/TradesTable.tsx`
- `src/web/src/components/trades/Pagination.tsx`

## Constraints
- 성과 요약: 5개 미니 카드 (총 수익, 총 거래, 승률, 평균 손익비, 최대 낙폭)
- 필터: 기간 탭(오늘/7일/30일/전체) + 심볼/거래소/결과 드롭다운
- 기간 탭: `role="tablist"` + `role="tab"` + `aria-selected`
- 드롭다운: `<select>` with 명시적 `background-color` + `color`
- 필터 상태 → URL 쿼리 파라미터 반영 (`?period=30d&symbol=BTCUSDT`)
- 테이블: `<table>`, `<thead>`, `<th scope="col">` 시맨틱 마크업
- 방향 배지: LONG 초록(#052e16/#22c55e), SHORT 빨강(#450a0a/#ef4444)
- 숫자 전부 JetBrains Mono + tabular-nums
- 행 호버: #263248
- 빈 상태: "조건에 맞는 거래 내역이 없습니다"
- 로딩: 성과 요약 skeleton + 테이블 5행 skeleton
- 페이지네이션: "이전 | 1 2 3 … | 다음" `<nav aria-label="페이지네이션">`
- `Intl.DateTimeFormat`, `Intl.NumberFormat` 사용

## Steps
1. `PerformanceSummary.tsx` — GET /api/stats 데이터, 5개 미니 카드
2. `TradeFilters.tsx` — 기간 탭 + 드롭다운, URL 쿼리 파라미터 동기화 (useSearchParams)
3. `TradesTable.tsx` — GET /api/tickets 데이터, 시맨틱 테이블, PnL 색상, 방향 배지
4. `Pagination.tsx` — cursor 기반, "이전/다음" + 페이지 번호
5. `TradesPage.tsx` — 위 4개 컴포넌트 조합
6. App.tsx 라우트 /trades → TradesPage
7. 로딩/빈 상태 처리

## Acceptance Criteria
- /trades → 성과 요약 + 필터 + 테이블 + 페이지네이션 렌더링
- 기간 탭 "30일" 클릭 → URL ?period=30d + 테이블 갱신
- 심볼 필터 "BTCUSDT" → URL ?symbol=BTCUSDT + 테이블 갱신
- 복합 필터: ?period=7d&symbol=BTCUSDT&result=WIN
- "다음" 버튼 → 다음 페이지 로드 (cursor 기반)
- LONG 방향 → 초록 배지, SHORT → 빨간 배지
- 수익 PnL → #22c55e, 손실 → #ef4444
- 결과 0건 → "조건에 맞는 거래 내역이 없습니다"
- URL 직접 접근 (/trades?period=7d) → 필터 상태 복원
- 날짜: Intl.DateTimeFormat 포맷
- 성과 요약 보조 텍스트에 기간 표시

## Test Scenarios
N/A — UI 컴포넌트 태스크. 빌드 성공 + 브라우저 검증.

## Validation
```bash
bun run build:web
bun run typecheck && bun run lint
```

## Browser Verification
- http://localhost:3000/trades → 거래 내역 페이지 렌더링
- http://localhost:3000/trades → 기간 탭 클릭 → URL 변경 + 데이터 갱신
- http://localhost:3000/trades?period=7d → 7일 필터 적용 상태로 로드

## Out of Scope
- 거래 상세 모달 (후속)
- 차트/그래프 (Non-goals)

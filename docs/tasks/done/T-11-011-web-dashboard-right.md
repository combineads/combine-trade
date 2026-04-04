# T-11-011 대시보드 — 오늘 성과 + 최근 거래 + 최근 시그널 + 킬스위치 모달

## Goal
대시보드 페이지의 우측 영역(오늘 성과, 최근 거래, 최근 시그널)과 킬스위치/모드전환 확인 모달을 구현한다.

## Why
대시보드의 우측 영역은 "오늘 어떻게 됐나?"를 요약하고, 킬스위치와 모드 전환은 긴급 조치 인터페이스.

## Inputs
- `docs/WEB_UI_SCREENS.md` §2 — 대시보드 우측, 킬스위치 모달, 모드 전환 모달
- T-11-005의 GET /api/stats
- T-11-006의 GET /api/signals/recent, GET /api/events/recent
- T-11-007의 POST /api/kill-switch, PUT /api/mode
- T-11-010의 DashboardPage, Header

## Dependencies
- T-11-010 (대시보드 좌측)
- T-11-005 (stats API)
- T-11-006 (signals/events API)
- T-11-007 (제어 API)

## Expected Outputs
- `src/web/src/components/dashboard/TodayPerformance.tsx`
- `src/web/src/components/dashboard/RecentTrades.tsx`
- `src/web/src/components/dashboard/RecentSignals.tsx`
- `src/web/src/components/modals/KillSwitchModal.tsx`
- `src/web/src/components/modals/ModeChangeModal.tsx`

## Deliverables
- `src/web/src/components/dashboard/TodayPerformance.tsx`
- `src/web/src/components/dashboard/RecentTrades.tsx`
- `src/web/src/components/dashboard/RecentSignals.tsx`
- `src/web/src/components/modals/KillSwitchModal.tsx`
- `src/web/src/components/modals/ModeChangeModal.tsx`
- DashboardPage.tsx 수정 (우측 영역 추가)
- Header.tsx 수정 (모달 연결)

## Constraints
- 오늘 성과: 큰 숫자 PnL (36px, JetBrains Mono), 수익 #22c55e / 손실 #ef4444
- 최근 거래: 5건, 컴팩트 리스트, "전체 보기" 링크 → /trades
- 최근 시그널: 5건, 색상 점 (초록=체결, 보라=WATCHING, 빨강=거부)
- 킬스위치 모달: 빨간 테두리, 포커스 트랩, Esc 닫기, Tab 순환, `overscroll-behavior: contain`
- 모드 전환 모달: "실거래 모드로 전환하시겠습니까?" 확인 (live 전환 시만)
- 거래/시그널 없을 때 빈 상태 메시지
- `aria-live="polite"` 로딩/성공 알림
- `touch-action: manipulation`

## Steps
1. `TodayPerformance.tsx` — GET /api/stats 데이터, 큰 PnL 숫자 + 거래 수 + 승률
2. `RecentTrades.tsx` — GET /api/tickets?period=today 또는 별도 recent API, 5건 리스트
3. `RecentSignals.tsx` — GET /api/signals/recent, 5건 리스트 + 색상 점
4. DashboardPage.tsx 우측 열에 위 3개 컴포넌트 배치
5. `KillSwitchModal.tsx` — 확인/취소, POST /api/kill-switch 호출, 결과 표시
6. `ModeChangeModal.tsx` — live 모드 전환 확인, PUT /api/mode 호출
7. Header.tsx에서 킬스위치 버튼 → KillSwitchModal, 모드 드롭다운 live 선택 → ModeChangeModal
8. 포커스 트랩 구현 (모달 내 Tab 순환)
9. Esc 키 → 모달 닫기

## Acceptance Criteria
- 대시보드 우측: 오늘 성과 + 최근 거래 + 최근 시그널
- PnL 양수 → #22c55e, 음수 → #ef4444
- "전체 보기" 클릭 → /trades 이동
- 킬스위치 버튼 클릭 → 확인 모달 (배경 오버레이, 포커스 트랩)
- 모달에서 "긴급 청산 실행" → POST /api/kill-switch → 결과
- 모달에서 Esc → 닫기
- 모달에서 Tab → 내부 순환 (외부로 나가지 않음)
- 모드 드롭다운에서 "실거래" 선택 → 확인 모달
- 거래 없음 → "아직 완료된 거래가 없습니다"
- 시그널 없음 → "최근 시그널 없음"

## Test Scenarios
N/A — UI 컴포넌트 태스크. 빌드 성공 + 브라우저 검증.

## Validation
```bash
bun run build:web
bun run typecheck && bun run lint
```

## Browser Verification
- http://localhost:3000/ → 대시보드 전체 (좌+우) 렌더링 확인
- http://localhost:3000/ → 킬스위치 버튼 → 모달 열림 → Esc 닫힘
- http://localhost:3000/ → 모드 드롭다운 → "실거래" → 확인 모달

## Out of Scope
- 거래 내역 페이지 (T-11-012)
- Trade Block 생성/삭제 UI (헤더 토글만)

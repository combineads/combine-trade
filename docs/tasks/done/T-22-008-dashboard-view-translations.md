# T-22-008 Dashboard 뷰 번역 (dashboard namespace)

## Goal
`packages/ui/src/views/dashboard/` 및 관련 컴포넌트의 하드코딩 문자열을 번역 키로 교체하고, `dashboard` namespace의 ko/en 번역을 완성한다.

## Why
대시보드는 사용자가 가장 먼저 접하는 화면이다. 킬스위치 카드, 워커 상태, 전략 요약, 최근 이벤트 등 핵심 정보가 모두 포함되어 있어 번역 우선순위가 높다.

## Inputs
- T-22-005 출력물: `common` namespace 완성, renderWithI18n 헬퍼
- T-22-007 출력물: 날짜/숫자 포맷터
- `packages/ui/src/views/dashboard/` 현재 코드

## Dependencies
T-22-005, T-22-007

## Expected Outputs
- `dashboard` namespace ko/en 번역 완성
- Dashboard 뷰 하드코딩 문자열 제거
- 기존 뷰 테스트 통과

## Deliverables
- `packages/ui/src/i18n/messages/ko.json` 업데이트: `dashboard` namespace
  - 킬스위치: "킬스위치", "활성화", "비활성화", "긴급 중지", "모든 거래 중지됨"
  - 워커 상태: "워커 상태", "실행 중", "중지됨", "오류"
  - 전략 요약: "활성 전략", "오늘의 손익", "총 손익", "포지션"
  - 최근 이벤트: "최근 이벤트", "신호", "진입", "청산"
- `packages/ui/src/i18n/messages/en.json` 업데이트: `dashboard` namespace 영문
- `packages/ui/src/views/dashboard/` 컴포넌트: `useTranslations('dashboard')` 적용, 날짜/숫자에 `useFormatters` 적용
- 기존 dashboard 뷰 테스트 업데이트 (I18nProvider 래핑)

## Constraints
- LONG, SHORT, PASS, PnL 등 트레이딩 전문 용어는 영어 유지
- 킬스위치 상태 표시는 항상 명확하게 — 번역으로 인한 UX 저하 금지
- 기존 컴포넌트 props API 변경 없음

## Steps
1. `packages/ui/src/views/dashboard/` 전체 하드코딩 문자열 추출
2. `dashboard` namespace 번역 키 설계
3. ko.json, en.json 작성
4. 뷰 컴포넌트에 `useTranslations('dashboard')` 적용
5. 날짜/숫자 표시에 `useFormatters` 적용
6. 테스트 업데이트 및 통과 확인

## Acceptance Criteria
- `packages/ui/src/views/dashboard/` 에 하드코딩 UI 문자열 없음
- ko/en `dashboard` namespace 키 100% 매칭
- `bun test packages/ui` 통과
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test packages/ui
```

## Out of Scope
전략/주문 뷰 번역 (T-22-009, T-22-010), 언어 선택기 top-bar 통합

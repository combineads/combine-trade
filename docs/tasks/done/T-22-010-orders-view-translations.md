# T-22-010 Orders 뷰 번역 (orders namespace)

## Goal
`packages/ui/src/views/orders/` 내 주문 목록, 포지션, 상태 표시의 하드코딩 문자열을 번역 키로 교체하고, `orders` namespace의 ko/en 번역을 완성한다.

## Why
주문 및 포지션 뷰는 실제 거래 현황을 보여주는 핵심 화면이다. 상태 문자열(체결, 취소, 부분체결 등)과 포지션 정보가 올바르게 번역되어야 사용자가 거래 상황을 정확히 파악할 수 있다.

## Inputs
- T-22-005 출력물: `common` namespace, renderWithI18n 헬퍼
- T-22-007 출력물: 날짜/숫자/통화 포맷터
- T-22-011 출력물: 트레이딩 용어 glossary
- `packages/ui/src/views/orders/` 현재 코드

## Dependencies
T-22-005, T-22-007, T-22-011

## Expected Outputs
- `orders` namespace ko/en 번역 완성
- Orders 뷰 하드코딩 문자열 제거
- 기존 테스트 통과

## Deliverables
- `packages/ui/src/i18n/messages/ko.json` 업데이트: `orders` namespace
  - 주문 목록: "주문 내역", "미체결 주문", "체결 내역"
  - 주문 상태: "체결", "취소", "부분체결", "대기", "거부"
  - 주문 유형: "지정가", "시장가", "스탑 로스", "익절"
  - 포지션: "포지션", "평균 진입가", "현재가", "미실현 손익", "레버리지"
  - 컬럼헤더: "심볼", "방향", "수량", "가격", "체결시간", "수수료"
- `packages/ui/src/i18n/messages/en.json` 업데이트: `orders` namespace 영문
- `packages/ui/src/views/orders/` 컴포넌트: `useTranslations('orders')` + `useFormatters` 적용
- 기존 orders 테스트 업데이트

## Constraints
- LONG, SHORT, PASS 방향 표시는 영어 유지 (glossary 기준)
- 가격/수량 표시에 `useFormatters` 필수 (locale별 숫자 포맷)
- 주문 ID, 심볼명(예: BTC/USDT)은 번역 대상 아님

## Steps
1. `packages/ui/src/views/orders/` 전체 하드코딩 문자열 추출
2. T-22-011 glossary 참조하여 번역 키 설계
3. ko.json, en.json 작성
4. 컴포넌트에 `useTranslations('orders')` + `useFormatters` 적용
5. 테스트 업데이트 및 통과 확인

## Acceptance Criteria
- `packages/ui/src/views/orders/` 에 하드코딩 UI 문자열 없음
- ko/en `orders` namespace 키 100% 매칭
- 가격/수량/날짜가 locale에 맞게 포맷됨
- `bun test packages/ui` 통과
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test packages/ui
```

## Out of Scope
주문 실행 로직, 알림/리스크 뷰 번역 (T-22-012), 백테스트 뷰 번역 (T-22-013)

# T-22-007 숫자/날짜/통화 포맷팅 유틸리티

## Goal
`Intl.NumberFormat`과 `Intl.DateTimeFormat`을 기반으로 locale별 숫자/날짜/통화 포맷팅 유틸리티를 구현한다.

## Why
트레이딩 앱에서 숫자(가격, 수량, 수익률), 날짜(체결시간, 이벤트시간), 통화(손익)는 locale에 맞게 포맷되어야 한다. 포맷 로직을 중앙화하여 일관성을 보장한다.

## Inputs
- T-22-001 출력물: `locales` 설정
- T-22-002 출력물: `useFormatter` 훅 (next-intl 제공)
- EP22 요구사항: 날짜 ko → `2026년 3월 24일`, en → `Mar 24, 2026`

## Dependencies
T-22-001, T-22-002

## Expected Outputs
- 포맷팅 유틸리티 함수 모음
- React 훅 버전
- 단위 테스트 (locale별 출력 검증)

## Deliverables
- `packages/ui/src/i18n/formatters.ts`:
  - `formatNumber(value, locale, options?)` — 숫자 포맷 (소수점, 천단위 구분)
  - `formatPrice(value, locale, currency?)` — 통화 포맷 (기본 USDT)
  - `formatPercent(value, locale)` — 백분율 포맷
  - `formatDate(date, locale, style?)` — 날짜 포맷 (short/medium/long)
  - `formatDateTime(date, locale)` — 날짜+시간 포맷
  - `formatRelativeTime(date, locale)` — 상대시간 ("3분 전", "3 min ago")
- `packages/ui/src/i18n/useFormatters.ts`: React 훅 버전 (`useLocale()` 기반)
- `packages/ui/src/i18n/__tests__/formatters.test.ts`: ko/en 각 포맷 함수 출력 검증

## Constraints
- 모든 가격/수익 계산에 Decimal.js 사용 금지 (이 유틸리티는 표시 전용, 계산은 항상 Decimal.js)
- `Intl` 내장 API만 사용 (외부 날짜 라이브러리 추가 금지)
- next-intl `useFormatter`와 함께 사용 가능하도록 설계

## Steps
1. 포맷팅 요구사항 정리 (가격, 날짜, 백분율, 상대시간)
2. `formatters.ts` 순수 함수로 구현
3. `useFormatters.ts` 훅 구현
4. 단위 테스트: ko locale (`ko-KR`) / en locale (`en-US`) 출력 값 스냅샷 검증
5. `bun run typecheck` 통과

## Acceptance Criteria
- `formatDate(new Date('2026-03-24'), 'ko')` → `"2026년 3월 24일"`
- `formatDate(new Date('2026-03-24'), 'en')` → `"Mar 24, 2026"`
- `formatPrice(1234.56, 'ko', 'USDT')` → `"1,234.56 USDT"`
- `formatPercent(0.1234, 'ko')` → `"12.34%"`
- `bun test packages/ui/src/i18n/__tests__/formatters.test.ts` 통과
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test packages/ui/src/i18n/__tests__/formatters.test.ts
```

## Out of Scope
백테스트 결과 포맷 (T-22-013에서 사용), 실제 컴포넌트에 포맷터 적용 (각 뷰 번역 태스크에서 처리)

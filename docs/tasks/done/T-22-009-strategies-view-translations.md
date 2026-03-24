# T-22-009 Strategies 뷰 번역 (strategies namespace)

## Goal
`packages/ui/src/views/strategies/` 내 전략 목록, 상세, 에디터 UI의 하드코딩 문자열을 번역 키로 교체하고, `strategies` namespace의 ko/en 번역을 완성한다.

## Why
전략 관리는 Combine Trade의 핵심 기능이다. 전략 목록, 상세 정보, 에디터 UI의 버튼/라벨/상태 문자열이 번역되어야 한다.

## Inputs
- T-22-005 출력물: `common` namespace, renderWithI18n 헬퍼
- T-22-011 출력물: 트레이딩 용어 glossary (의존성 순서 주의: glossary 먼저)
- `packages/ui/src/views/strategies/` 현재 코드

## Dependencies
T-22-005, T-22-011

## Expected Outputs
- `strategies` namespace ko/en 번역 완성
- Strategies 뷰 하드코딩 문자열 제거
- 기존 테스트 통과

## Deliverables
- `packages/ui/src/i18n/messages/ko.json` 업데이트: `strategies` namespace
  - 목록: "전략 목록", "새 전략", "버전", "상태", "마지막 실행", "이벤트 수"
  - 상태값: "활성", "비활성", "초안", "오류"
  - 에디터 UI: "코드 저장", "테스트 실행", "배포", "되돌리기"
  - 상세: "전략 정보", "백테스트 결과", "최근 신호", "파라미터"
- `packages/ui/src/i18n/messages/en.json` 업데이트: `strategies` namespace 영문
- `packages/ui/src/views/strategies/` 컴포넌트: `useTranslations('strategies')` 적용
- 기존 strategies 테스트 업데이트

## Constraints
- Monaco 에디터 내부 코드는 항상 영어 — 에디터 UI(툴바, 버튼)만 번역
- 전략 이름(사용자 입력 데이터)은 번역 대상 아님
- glossary(T-22-011) 기준으로 트레이딩 용어 일관성 유지

## Steps
1. `packages/ui/src/views/strategies/` 전체 하드코딩 문자열 추출
2. T-22-011 glossary 참조하여 번역 키 설계
3. ko.json, en.json 작성
4. 컴포넌트 적용
5. 테스트 업데이트 및 통과 확인

## Acceptance Criteria
- `packages/ui/src/views/strategies/` 에 하드코딩 UI 문자열 없음
- ko/en `strategies` namespace 키 100% 매칭
- glossary 기준 도메인 용어 일관성 확인
- `bun test packages/ui` 통과
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test packages/ui
```

## Out of Scope
Monaco 에디터 코드 자체 번역, 전략 실행 로직, 주문 뷰 번역 (T-22-010)

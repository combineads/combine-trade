# T-22-005 공통 컴포넌트 번역 키 추출 및 common namespace

## Goal
`packages/ui/src/components/` 내 공통 컴포넌트의 하드코딩 문자열을 번역 키로 교체하고, `common` namespace의 ko/en 번역을 완성한다.

## Why
공통 컴포넌트(Button, Card, Table, Modal, Badge 등)는 모든 뷰에서 사용된다. 이 컴포넌트들의 문자열이 번역되지 않으면 전체 i18n 적용이 불완전해진다.

## Inputs
- T-22-001 출력물: `packages/ui/src/i18n/messages/{ko,en}.json`
- T-22-002 출력물: `useTranslations` 훅
- `packages/ui/src/components/` 현재 코드

## Dependencies
T-22-001, T-22-002

## Expected Outputs
- `common` namespace 번역 파일 완성 (ko/en 100%)
- 공통 컴포넌트에서 하드코딩 문자열 제거
- 컴포넌트 업데이트 후 기존 테스트 통과

## Deliverables
- `packages/ui/src/i18n/messages/ko.json` 업데이트: `common` namespace 완성
  - 버튼: 확인, 취소, 저장, 삭제, 편집, 닫기, 적용, 초기화, 더 보기, 이전, 다음
  - 상태: 로딩, 성공, 실패, 경고, 정보, 비어있음, 없음
  - 에러: 네트워크 오류, 알 수 없는 오류, 재시도
  - 네비게이션: 대시보드, 전략, 주문, 알림, 리스크, 설정, 백테스트, 이벤트, 차트, 저널
  - 확인 다이얼로그: "정말 삭제하시겠습니까?", "이 작업은 되돌릴 수 없습니다" 등
- `packages/ui/src/i18n/messages/en.json` 업데이트: 동일 `common` namespace 영문
- `packages/ui/src/components/` 내 하드코딩 문자열 → `useTranslations('common')` 교체
- `packages/ui/src/components/__tests__/` 테스트 업데이트 (I18nProvider 래핑 추가)

## Constraints
- LONG, SHORT, PASS 등 트레이딩 고유 용어는 번역하지 않음 (영어 유지)
- 컴포넌트 API(props) 변경 없이 내부에서만 `useTranslations` 사용
- 기존 컴포넌트 테스트가 깨지지 않도록 테스트 헬퍼에 `I18nProvider` 래핑 추가

## Steps
1. `packages/ui/src/components/` 하드코딩 문자열 전수 조사
2. `common` namespace 번역 키 설계
3. `ko.json`, `en.json` `common` 섹션 작성
4. 컴포넌트별 `useTranslations('common')` 적용
5. 테스트 헬퍼 업데이트 (renderWithI18n)
6. 기존 테스트 통과 확인

## Acceptance Criteria
- `packages/ui/src/components/` 에 하드코딩 한글/영문 UI 문자열 없음
- ko/en `common` namespace 키 100% 매칭
- `bun test packages/ui` 통과
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test packages/ui
```

## Out of Scope
뷰 컴포넌트 번역 (T-22-008 이후), `LanguageSwitcher` (T-22-006), 날짜/숫자 포맷터 (T-22-007)

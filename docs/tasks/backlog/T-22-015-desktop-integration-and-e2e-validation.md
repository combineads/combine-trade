# T-22-015 Desktop 앱 i18n 통합, 누락 감지 스크립트 및 E2E 검증

## Goal
`apps/desktop/` i18n 통합을 최종 확인하고, 번역 누락 감지 스크립트(`scripts/i18n-check.ts`)를 작성하며, 주요 시나리오에서 ko↔en 전환 E2E 테스트를 작성한다.

## Why
EP22의 마지막 마일스톤(M5)으로 전체 i18n 구현의 완성도를 검증한다. 번역 누락 감지 스크립트는 향후 새 문자열 추가 시 누락을 방지하는 안전망 역할을 한다.

## Inputs
- T-22-004 출력물: desktop LocaleProvider
- T-22-008~T-22-014 출력물: 전체 번역 namespace 완성
- `packages/ui/src/i18n/messages/ko.json`, `en.json` — 최종 번역 파일
- `scripts/` 현재 디렉토리 구조

## Dependencies
T-22-004, T-22-008, T-22-009, T-22-010, T-22-012, T-22-013, T-22-014

## Expected Outputs
- `scripts/i18n-check.ts` — 번역 누락 키 감지 스크립트
- `apps/desktop/` 빌드 성공 및 ko↔en 전환 동작 확인
- E2E 또는 통합 테스트에서 locale 전환 시나리오 검증

## Deliverables
- `scripts/i18n-check.ts`:
  - ko.json과 en.json의 모든 키 재귀 비교
  - 한쪽에만 있는 키 목록 출력
  - 누락 시 exit code 0 (warning, 빌드 블록 아님), 단 누락 키 목록을 stdout에 출력
  - `bun run scripts/i18n-check.ts` 로 단독 실행 가능
- `packages/ui/src/i18n/__tests__/i18n-check.test.ts`: 스크립트 로직 단위 테스트
- `apps/desktop/` 최종 빌드 검증 (static export 성공)
- `packages/ui/src/i18n/__tests__/locale-switch.test.tsx`: ko→en, en→ko 전환 통합 테스트
  - 주요 시나리오: 언어 전환 후 `common`, `dashboard` namespace 문자열 변경 확인
  - localStorage 저장/복원 확인

## Constraints
- `scripts/i18n-check.ts`는 외부 의존성 없이 Bun 내장 API만 사용
- 누락 번역 키는 빌드 에러가 아닌 경고 — 사용 편의성 우선 (fallback 표시)
- E2E 테스트는 브라우저 없는 jsdom 환경에서 실행 (Playwright는 별도 CI 환경 필요)

## Steps
1. `packages/ui/src/i18n/messages/ko.json`, `en.json` 최종 상태 확인
2. `scripts/i18n-check.ts` 구현 (재귀 키 비교 로직)
3. i18n-check 단위 테스트 작성
4. locale 전환 통합 테스트 작성
5. `cd apps/desktop && bun run build` 성공 확인
6. `bun run scripts/i18n-check.ts` 실행 — 누락 키 없음 확인

## Acceptance Criteria
- `bun run scripts/i18n-check.ts` 실행 시 누락 키 없음 (또는 목록 출력)
- `cd apps/desktop && bun run build` 성공
- locale 전환 통합 테스트 통과
- ko.json과 en.json의 모든 namespace/키 100% 일치
- `bun run typecheck` 통과
- `bun test packages/ui/src/i18n/__tests__/` 전체 통과

## Validation
```bash
bun run typecheck
bun run scripts/i18n-check.ts
bun test packages/ui/src/i18n/__tests__/
cd apps/desktop && bun run build
```

## Out of Scope
Playwright 기반 실제 브라우저 E2E (별도 CI 설정 필요), 3번째 언어 추가, API/worker i18n

# T-22-012 Alerts/Risk/Settings 뷰 번역

## Goal
`packages/ui/src/views/` 내 alerts, risk, settings 뷰의 하드코딩 문자열을 번역 키로 교체하고, 각 namespace의 ko/en 번역을 완성한다.

## Why
알림, 리스크 관리, 설정은 안전성에 직결된 화면이다. 특히 킬스위치 및 손실 한도 관련 문자열이 정확하게 번역되어야 사용자가 위험 상황을 올바르게 인식할 수 있다.

## Inputs
- T-22-005 출력물: `common` namespace, renderWithI18n 헬퍼
- T-22-011 출력물: 트레이딩 용어 glossary
- `packages/ui/src/views/alerts/`, `views/risk/`, `views/settings/` 현재 코드

## Dependencies
T-22-005, T-22-011

## Expected Outputs
- `alerts`, `risk`, `settings` namespace ko/en 번역 완성
- 3개 뷰 하드코딩 문자열 제거
- 기존 테스트 통과

## Deliverables
- `packages/ui/src/i18n/messages/ko.json` 업데이트:
  - `alerts` namespace: "알림", "새 알림", "알림 규칙", "조건", "채널", "웹훅", "이메일", "슬랙", "알림 유형", "가격 알림", "신호 알림"
  - `risk` namespace: "리스크 관리", "킬스위치", "일일 손실 한도", "현재 손실", "한도 초과", "자동매매 중단", "긴급 청산", "한도 설정"
  - `settings` namespace: "설정", "계정", "API 키", "언어", "테마", "알림 설정", "보안", "2단계 인증", "로그아웃"
- `packages/ui/src/i18n/messages/en.json` 업데이트: 동일 3개 namespace 영문
- `packages/ui/src/views/alerts/`, `views/risk/`, `views/settings/` 컴포넌트 번역 적용
- settings 뷰에 `LanguageSwitcher` 통합 (언어 설정 섹션)
- 기존 테스트 업데이트

## Constraints
- 리스크 관련 경고 문자열은 명확성 최우선 — 번역이 의미를 약화시키지 않도록
- 킬스위치 활성화 확인 다이얼로그 문자열은 `common.confirmDialog` 재사용
- settings 뷰 언어 설정은 `LanguageSwitcher` (T-22-006) 컴포넌트 사용

## Steps
1. 3개 뷰 디렉토리 문자열 전수 조사
2. 각 namespace 번역 키 설계
3. ko.json, en.json 작성 (3개 namespace)
4. 컴포넌트 적용
5. settings 뷰에 LanguageSwitcher 통합
6. 테스트 업데이트 및 통과 확인

## Acceptance Criteria
- alerts, risk, settings 뷰에 하드코딩 문자열 없음
- ko/en 3개 namespace 키 100% 매칭
- settings 뷰에서 언어 전환 가능
- `bun test packages/ui` 통과
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test packages/ui
```

## Out of Scope
알림 전송 로직, auth/backtest/events/charts 뷰 번역 (T-22-013), 실제 Slack/Email 연동

# T-22-013 Auth/Backtest/Events/Charts 뷰 번역

## Goal
`packages/ui/src/views/` 내 auth, backtest, events, charts 뷰의 하드코딩 문자열을 번역 키로 교체하고, 각 namespace의 ko/en 번역을 완성한다.

## Why
인증, 백테스트, 이벤트, 차트는 사용자 여정의 중요한 진입점 및 분석 화면이다. 이 화면들의 번역이 완료되어야 전체 UI에서 하드코딩 문자열 제로 목표를 달성할 수 있다.

## Inputs
- T-22-005 출력물: `common` namespace, renderWithI18n 헬퍼
- T-22-007 출력물: 날짜/숫자 포맷터 (백테스트 결과 수치 포맷)
- T-22-011 출력물: 트레이딩 용어 glossary
- `packages/ui/src/views/auth/`, `views/backtest/`, `views/events/`, `views/charts/` 현재 코드

## Dependencies
T-22-005, T-22-007, T-22-011

## Expected Outputs
- `auth`, `backtest`, `events`, `charts` namespace ko/en 번역 완성
- 4개 뷰 하드코딩 문자열 제거
- 기존 테스트 통과

## Deliverables
- `packages/ui/src/i18n/messages/ko.json` 업데이트:
  - `auth` namespace: "로그인", "이메일", "비밀번호", "로그인 유지", "로그인 실패", "토큰 만료", "다시 로그인"
  - `backtest` namespace: "백테스트", "기간", "시작", "종료", "전략 선택", "결과", "총 수익률", "최대 낙폭", "승률", "거래 횟수", "실행 중", "완료", "실패"
  - `events` namespace: "이벤트", "이벤트 목록", "이벤트 유형", "발생 시간", "전략", "심볼", "신호", "벡터", "유사도"
  - `charts` namespace: "차트", "캔들스틱", "지표", "기간", "1분", "5분", "15분", "1시간", "4시간", "1일", "전체화면"
- `packages/ui/src/i18n/messages/en.json` 업데이트: 동일 4개 namespace 영문
- 4개 뷰 컴포넌트: `useTranslations` 적용
- backtest 결과 수치에 `useFormatters` 적용 (locale별 숫자/날짜 포맷)
- 기존 테스트 업데이트

## Constraints
- 백테스트 수치(수익률, 낙폭 등)는 `useFormatters` 로 locale 처리 필수
- 이벤트 유형(신호명, 전략명)은 사용자 데이터 — 번역 대상 아님
- 차트 시간단위(1m, 5m 등) 약어는 locale별 표현 다름 주의 (ko: 1분, en: 1m)

## Steps
1. 4개 뷰 디렉토리 문자열 전수 조사
2. 각 namespace 번역 키 설계
3. ko.json, en.json 작성 (4개 namespace)
4. 컴포넌트 적용 (backtest는 useFormatters 포함)
5. 테스트 업데이트 및 통과 확인

## Acceptance Criteria
- auth, backtest, events, charts 뷰에 하드코딩 UI 문자열 없음
- ko/en 4개 namespace 키 100% 매칭
- 백테스트 수치가 locale에 맞게 포맷됨
- `bun test packages/ui` 통과
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test packages/ui
```

## Out of Scope
journal 뷰 번역 (T-22-014), desktop 통합 (T-22-015), 실제 백테스트 실행 로직

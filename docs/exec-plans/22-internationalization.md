# EP22 — Internationalization (i18n)

## Objective

Combine Trade UI에 국제화(i18n)를 적용하여 사용자가 한국어(ko)와 영어(en) 중 선호 언어를 선택할 수 있게 한다. 기본 언어는 한국어(ko). 향후 언어 추가가 용이한 구조를 설계한다.

## Scope

- `packages/ui/` 내 모든 공통 컴포넌트 및 뷰의 하드코딩된 문자열을 번역 키로 교체
- `apps/web/` Next.js App Router 기반 i18n 라우팅 및 미들웨어
- `apps/desktop/` 클라이언트 사이드 i18n (static export 호환)
- 언어 설정 UI (Settings 페이지 또는 top-bar 언어 선택기)
- 번역 리소스 파일 (ko, en)
- 숫자/날짜/통화 포맷팅의 로케일별 처리

## Non-goals

- 서버 사이드 (API, workers) 국제화 — 로그/에러 메시지는 영어 유지
- 3개 이상 언어 지원 (구조만 확장 가능하게, 실제 번역은 ko/en만)
- 전략 코드 에디터(Monaco)의 i18n — 코드는 항상 영어
- DB에 저장된 사용자 컨텐츠(전략 이름, 노트 등)의 자동 번역
- RTL(Right-to-Left) 레이아웃 지원

## Prerequisites

- EP08 (API & UI) 완료 ✅
- EP20 (Desktop App) 진행 중 — desktop 앱 i18n은 desktop 스캐폴딩 후 적용

## Milestones

### M1 — i18n 인프라 구축

**Deliverables:**
- `next-intl` 패키지 설치 및 설정 (Next.js App Router 호환, RSC 지원)
- `packages/ui/` 에 i18n provider 및 `useTranslations()` 훅 래퍼
- 번역 리소스 디렉토리 구조: `packages/ui/src/i18n/messages/{ko,en}.json`
- namespace 분리 전략 정의 (common, dashboard, strategies, orders, alerts, risk, settings, auth, backtest, charts, events)
- `apps/web/` 미들웨어에서 locale 감지 및 라우팅 (`/ko/...`, `/en/...`)
- `apps/desktop/` 클라이언트 사이드 locale provider (static export 호환)

**Acceptance criteria:**
- `useTranslations('common')` 훅으로 번역 키 조회 가능
- 브라우저 Accept-Language 헤더 기반 자동 locale 감지
- URL 경로에 locale prefix 포함 (`/ko/dashboard`, `/en/dashboard`)
- desktop 앱에서 locale 전환 시 페이지 리로드 없이 UI 업데이트
- 타입 안전 번역 키 (TypeScript 자동완성)

**Validation:**
```bash
bun test --filter i18n
bun run typecheck
bun run build
```

### M2 — 공통 컴포넌트 번역

**Deliverables:**
- `packages/ui/src/components/` 내 모든 컴포넌트 하드코딩 문자열 → 번역 키
- top-bar 언어 선택기 컴포넌트 (`LanguageSwitcher`)
- 공통 번역 namespace (`common.json`): 버튼, 상태, 에러 메시지, 네비게이션, 확인 다이얼로그
- 숫자/날짜 포맷팅 유틸리티 (Intl.NumberFormat, Intl.DateTimeFormat 래퍼)

**Acceptance criteria:**
- 모든 공통 컴포넌트에 하드코딩 영문/한글 문자열 없음
- `LanguageSwitcher`로 ko↔en 전환 시 즉시 반영
- 선택한 언어가 localStorage에 저장되어 재방문 시 유지
- 숫자 포맷: ko → `1,234.56`, en → `1,234.56` (동일하되 통화 기호 차이)
- 날짜 포맷: ko → `2026년 3월 24일`, en → `Mar 24, 2026`

**Validation:**
```bash
bun test --filter i18n
bun test --filter components
bun run typecheck
```

### M3 — 핵심 뷰 번역 (Dashboard, Strategies, Orders)

**Deliverables:**
- `dashboard` namespace: 대시보드 뷰 전체 번역 (킬스위치 카드, 워커 상태, 전략 요약, 최근 이벤트)
- `strategies` namespace: 전략 목록, 상세, 에디터 뷰 번역 (에디터 UI만, 코드는 영어)
- `orders` namespace: 주문 목록, 상태, 포지션 뷰 번역
- 트레이딩 도메인 용어 한/영 대조표 작성 (`packages/ui/src/i18n/glossary.md`)

**Acceptance criteria:**
- Dashboard, Strategies, Orders 뷰에 하드코딩 문자열 없음
- 도메인 용어 일관성: "전략"↔"Strategy", "손절"↔"Stop Loss", "익절"↔"Take Profit" 등
- 트레이딩 고유 용어(LONG, SHORT, PASS)는 양쪽 언어에서 영어 유지 (도메인 표준)

**Validation:**
```bash
bun test --filter i18n
bun test --filter views
bun run typecheck
```

### M4 — 나머지 뷰 번역 (Alerts, Risk, Settings, Auth, Backtest, Events, Charts)

**Deliverables:**
- `alerts` namespace: 알림 뷰 번역
- `risk` namespace: 리스크 관리 뷰 번역 (킬스위치, 손실 한도)
- `settings` namespace: 설정 뷰 번역 (언어 설정 포함)
- `auth` namespace: 로그인, 인증 뷰 번역
- `backtest` namespace: 백테스트 뷰 번역
- `events` namespace: 이벤트 뷰 번역
- `charts` namespace: 차트 뷰 번역
- 저널 뷰 번역 (journal namespace)

**Acceptance criteria:**
- 전체 UI에 하드코딩 문자열 제로
- 모든 namespace에 ko/en 번역 100% 완료
- Backtest 결과의 수치 포맷이 locale에 맞게 표시

**Validation:**
```bash
bun test --filter i18n
bun test --filter views
bun run typecheck
bun run build
```

### M5 — Desktop 앱 통합 및 E2E 검증

**Deliverables:**
- `apps/desktop/` i18n 통합 (static export 호환 확인)
- desktop 앱 언어 전환 기능 검증
- E2E 테스트: 주요 사용자 시나리오에서 ko/en 전환 확인
- 번역 누락 감지 스크립트 (`scripts/i18n-check.ts`)

**Acceptance criteria:**
- Desktop 앱에서 ko↔en 전환 정상 동작
- 번역 누락 검사 스크립트가 CI에서 실행 가능
- 누락된 번역 키 → 빌드 경고 (에러는 아님, fallback 표시)
- ko/en 전체 전환 후 UI 깨짐 없음

**Validation:**
```bash
bun run scripts/i18n-check.ts
bun test --filter i18n
bun test --filter e2e
bun run build
```

## Task candidates

| # | Task | Description |
|---|------|-------------|
| T-22-001 | next-intl 패키지 설치 및 기본 설정 | next-intl 설치, provider 구성, messages 디렉토리 생성, TypeScript 타입 설정 |
| T-22-002 | packages/ui i18n provider 및 훅 래퍼 | useTranslations 래퍼, I18nProvider, locale context |
| T-22-003 | apps/web locale 미들웨어 및 라우팅 | Accept-Language 감지, /ko/, /en/ 경로 라우팅, 리다이렉트 |
| T-22-004 | apps/desktop 클라이언트 사이드 locale provider | static export 호환 locale 관리, localStorage 기반 |
| T-22-005 | 공통 컴포넌트 번역 키 추출 및 common namespace | Button, Card, Table 등 공통 문자열 번역 |
| T-22-006 | LanguageSwitcher 컴포넌트 구현 | top-bar 언어 선택 UI, localStorage 저장 |
| T-22-007 | 숫자/날짜/통화 포맷팅 유틸리티 | Intl.NumberFormat/DateTimeFormat 기반 로케일 포맷터 |
| T-22-008 | Dashboard 뷰 번역 (dashboard namespace) | 킬스위치 카드, 워커 상태, 전략 요약, 최근 이벤트 번역 |
| T-22-009 | Strategies 뷰 번역 (strategies namespace) | 전략 목록, 상세, 에디터 UI 번역 |
| T-22-010 | Orders 뷰 번역 (orders namespace) | 주문 목록, 포지션, 상태 번역 |
| T-22-011 | 트레이딩 용어 한/영 대조표 작성 | 도메인 용어 glossary 작성 |
| T-22-012 | Alerts/Risk/Settings 뷰 번역 | alerts, risk, settings namespace 번역 |
| T-22-013 | Auth/Backtest/Events/Charts 뷰 번역 | auth, backtest, events, charts namespace 번역 |
| T-22-014 | Journal 뷰 번역 (journal namespace) | 트레이드 저널 뷰 번역 |
| T-22-015 | Desktop 앱 i18n 통합 | desktop static export 환경에서 i18n 동작 확인 |
| T-22-016 | 번역 누락 감지 스크립트 | i18n-check.ts — 누락 키 검출, CI 연동 |
| T-22-017 | i18n E2E 테스트 | 주요 시나리오에서 ko↔en 전환 E2E 검증 |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| next-intl과 static export 호환성 | Desktop 앱 빌드 실패 | M1에서 PoC 검증. 비호환 시 react-i18next로 전환 (클라이언트 전용) |
| 번역 키 누락으로 UI에 raw key 노출 | UX 저하 | M5에서 누락 감지 스크립트 CI 연동. fallback으로 원본 언어 표시 |
| 도메인 용어 번역 불일치 | 사용자 혼란 | M3에서 glossary 먼저 작성 후 전체 적용 |
| SSR hydration mismatch (locale) | 콘솔 에러, 깜빡임 | next-intl의 서버/클라이언트 동기화 패턴 준수 |

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-24 | next-intl 채택 (react-i18next 대신) | Next.js App Router RSC 네이티브 지원, 타입 안전 번역 키, 서버/클라이언트 통합 API |
| 2026-03-24 | 기본 언어: ko (한국어) | 주 사용자가 한국어 사용자 |
| 2026-03-24 | 트레이딩 고유 용어(LONG/SHORT/PASS 등) 영어 유지 | 트레이딩 도메인 표준 용어로서 번역 시 오히려 혼란 |
| 2026-03-24 | namespace 분리: 뷰 단위 | 번역 파일 크기 관리, 지연 로딩 가능, 협업 편의 |
| 2026-03-24 | 번역 리소스는 packages/ui/src/i18n/messages/ 에 위치 | 공유 UI 패키지에서 관리하여 web/desktop 모두 사용 |

## Progress notes

- 2026-03-24: Epic created. 현재 i18n 라이브러리 없음. 모든 UI 문자열이 하드코딩 상태.

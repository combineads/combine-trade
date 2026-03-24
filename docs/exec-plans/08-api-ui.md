# 08-api-ui

## Objective
Elysia API 서버와 Tauri 데스크탑/모바일 앱, Next.js 웹 인터페이스를 구축하여 전략 관리, 모니터링, 백테스트 실행, 매매 현황 확인 등 사용자 인터페이스를 제공한다.

## Scope
- `apps/api/` — Elysia REST API
- `apps/web/` — Next.js 웹 UI
- `apps/desktop/` — Tauri 데스크탑/모바일 앱
- 전략 코드 에디터 (Monaco)
- 대시보드: 실시간 파이프라인 상태, 이벤트, 알람, 주문

## Non-goals
- 멀티유저 인증/인가 (단일 사용자)
- 소셜/공유 기능
- 모바일 최적화 (v1에서는 데스크탑 우선)

## Prerequisites
- `00-project-bootstrap` M2 — 모노레포 구조
- `02-strategy-sandbox` — 전략 CRUD API 데이터 소스
- `03-vector-engine` — 벡터 분석 데이터 (Strategy Detail 페이지)
- `04-label-decision` — 이벤트 라벨/통계 데이터 (Events, Statistics 페이지)
- `05-backtest` — 백테스트 실행 (POST /api/v1/backtest 엔드포인트)
- `06-alert-execution` M5 — 실행 모드 관리
- `07-realtime-pipeline` — 워커 상태 모니터링 데이터

## Milestones

### M0 — Tauri+Next.js integration PoC (1 week)

**Pre-decision (2026-03-22)**: Next.js는 SPA (`output: 'export'`)로 확정. SSR은 명시적으로 배제됨. 자세한 근거는 Decision log 참조.

- Deliverables:
  - Verify `output: 'export'` static build loads correctly in Tauri WebView
  - Benchmark Monaco Editor performance in WebView (target: responsive at 60fps)
  - Validate CSP with `unsafe-eval` for Monaco (see ARCHITECTURE.md CSP policy)
  - Working prototype: Next.js SPA page rendered in Tauri window with Monaco editor
  - Validate `tauri.conf.json` config: `devUrl` proxy + `frontendDist` static load
  - Verify PlatformAdapter pattern: `__TAURI_INTERNALS__` detection + dynamic import
  - **Fallback impact mapping**: document which features require Tauri-specific APIs (system tray, native notifications, auto-start, secure storage) and their web-only fallback behavior. This mapping guides M4 implementation.
- Success criteria:
  - Next.js SPA static export renders correctly inside Tauri WebView
  - Monaco editor maintains 60fps responsiveness under normal editing load
  - CSP policy allows Next.js hydration + Monaco with `unsafe-eval`
  - `tauri dev` (proxy mode) and `tauri build` (static mode) both work
  - PlatformAdapter correctly detects environment and loads Tauri SDK only in desktop
- Fallback:
  - If PoC fails: switch to Electron or pure web deployment (no Tauri dependency)
  - Decision must be recorded in Decision log before M1 begins
- Validation:
  ```bash
  cd apps/desktop && bun run tauri dev
  ```

### M1 — Elysia API server
- Deliverables:
  - `apps/api/` Elysia 서버 스캐폴드
  - IoC 컨테이너 연동
  - AOP 미들웨어 (로깅, 에러 핸들링)
  - API 엔드포인트:
    - `GET /api/v1/health` — 서버 + 워커 상태
    - `GET /api/v1/strategies` — 전략 목록
    - `POST /api/v1/strategies` — 전략 생성
    - `PUT /api/v1/strategies/:id` — 전략 수정 (version bump)
    - `GET /api/v1/strategies/:id/events` — 전략 이벤트 목록
    - `GET /api/v1/strategies/:id/statistics` — 전략 통계
    - `GET /api/v1/candles` — 캔들 데이터 조회
    - `GET /api/v1/events/:id` — 이벤트 상세
    - `GET /api/v1/alerts` — 알람 목록
    - `GET /api/v1/orders` — 주문 목록
    - `POST /api/v1/backtest` — 백테스트 실행
    - `PUT /api/v1/strategies/:id/mode` — 실행 모드 변경
  - Elysia 스키마 검증 (타입 안전 입출력)
- Acceptance criteria:
  - 모든 엔드포인트 타입 안전 요청/응답
  - 에러 응답 구조화 (status, code, message)
  - 헬스 체크 정상 작동
- Validation:
  ```bash
  bun test -- --filter "api"
  ```

### M2 — Real-time data streaming
- Deliverables:
  - `GET /api/v1/stream` — SSE (Server-Sent Events) 엔드포인트
  - 실시간 이벤트 스트리밍:
    - 캔들 업데이트
    - 전략 이벤트 발생
    - 의사결정 결과
    - 알람 발송 상태
    - 주문 상태 변경
  - 클라이언트별 구독 관리
  - **SSE multiplexing design decision**: evaluate whether to use a single multiplexed SSE connection (all event types on one stream) vs multiple SSE connections (one per event type). Record decision in Decision log.
  - SSE connection limit: max 3 concurrent connections per client (enforced server-side)
- Acceptance criteria:
  - SSE 연결 후 실시간 이벤트 수신
  - 연결 끊김 후 재연결 시 미수신 이벤트 없음
- Validation:
  ```bash
  bun test -- --filter "stream|sse"
  ```

### M3 — Next.js web UI foundation
- Deliverables:
  - `apps/web/` Next.js 프로젝트
  - 페이지 구조:
    - Dashboard — 파이프라인 상태 개요
    - Strategies — 전략 목록, 생성, 편집
    - Strategy Detail — 이벤트, 통계, 벡터 분석
    - Events — 이벤트 목록, 상세
    - Alerts — 알람 히스토리
    - Orders — 주문 히스토리
    - Backtest — 백테스트 실행 및 결과
  - Monaco Editor 통합 (전략 TypeScript 코드 편집)
  - API 클라이언트 (Elysia Eden treaty 또는 fetch wrapper)
- Acceptance criteria:
  - 모든 페이지 라우팅 정상 작동
  - Monaco에서 TypeScript 코드 편집 가능
  - API 데이터 표시
- Validation:
  ```bash
  cd apps/web && bun run build
  ```

### M4 — Tauri desktop app
- Deliverables:
  - `apps/desktop/` Tauri 프로젝트
  - Next.js 웹 UI를 Tauri로 래핑
  - 네이티브 기능:
    - 시스템 트레이 상주 (24/7 모니터링)
    - 네이티브 알림 (Slack 외 로컬 알림)
    - 자동 시작 옵션
  - Elysia API 서버 내장 실행 (옵션)
- Acceptance criteria:
  - Tauri 앱 빌드 및 실행 가능
  - 웹 UI 동일 기능 데스크탑에서 작동
  - 시스템 트레이 상주
- Validation:
  ```bash
  cd apps/desktop && bun run tauri build
  ```

### M5 — Strategy editor & backtesting UI
- Deliverables:
  - Monaco Editor에 TypeScript 자동완성 설정
  - Strategy API 타입 힌트 제공 (candle, indicator, defineFeature 등)
  - 코드 저장 → 전략 생성/업데이트 워크플로
  - 백테스트 실행 UI: 파라미터 입력 → 실행 → 진행률 → 결과 표시
  - 백테스트 결과 차트: 수익 곡선, WIN/LOSS 분포, 월별 통계
- Acceptance criteria:
  - Strategy API 타입 자동완성 작동
  - 코드 편집 → 저장 → 전략 업데이트 흐름 완료
  - 백테스트 진행률 실시간 표시
  - 결과 차트 렌더링
- Validation:
  ```bash
  bun test -- --filter "editor|backtest-ui"
  ```

## Task candidates
- T-08-008: Scaffold Elysia API server with IoC + AOP middleware
- T-08-002: Implement strategy CRUD API endpoints
- T-08-004: Implement candle/event/alert/order query endpoints
- T-08-005: Implement backtest trigger endpoint
- T-08-028: Implement execution mode change endpoint
- T-08-006: Implement SSE real-time streaming endpoint
- T-08-011: Scaffold Next.js web project with routing
- T-08-014: Implement Dashboard page (pipeline status overview)
- T-08-015: Implement Strategy list page
- T-08-016: Implement Strategy detail and editor page
- (not implemented): Add TypeScript autocomplete for Strategy API in Monaco
- (not implemented): Implement Backtest UI (params → progress → results)
- T-08-017: Implement Events, Alerts, Orders pages
- (not implemented): Scaffold Tauri desktop project wrapping Next.js
- (not implemented): Add system tray, native notifications, auto-start
- T-08-013: Implement API client layer (Eden treaty or fetch wrapper)

## Risks
- Monaco Editor 번들 사이즈가 크고 Tauri에서 성능 이슈 가능
- ~~Tauri + Next.js 통합 복잡도 (CSR vs SSR)~~ → SPA (static export) 확정으로 해소
- Strategy API TypeScript 타입 자동완성 구현 복잡도
- SSE 스트리밍의 브라우저 연결 제한 (6개)
- macOS WKWebView에서 tauri-driver E2E 테스트 미지원 (community 플러그인 대안 존재)

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | SSE (WebSocket 아님) for real-time | 단방향 서버→클라이언트 충분, 구현 단순 |
| 2026-03-21 | Monaco Editor for strategy code | VS Code 수준 TypeScript 편집 경험 |
| 2026-03-21 | Next.js를 Tauri로 래핑 | 코드 공유 극대화, 별도 UI 개발 최소화 |
| 2026-03-21 | SSE 연결 제한 3개/클라이언트 | 브라우저 동시 연결 제한(6개) 대비 여유 확보, 리소스 보호 |
| 2026-03-22 | `packages/ui/` 공통 컴포넌트 라이브러리 | apps/web/(SSR)과 apps/desktop/(Static) 모두 packages/ui/ 에서 컴포넌트 import. 페이지 뷰는 packages/ui/views/, 앱 페이지는 얇은 래퍼 |
| 2026-03-22 | apps/web/ SSR 유지, apps/desktop/ Static Export | 웹은 SSR로 빠른 첫 화면. 데스크탑은 output:'export' 정적 빌드로 Tauri WebView 호환 |
| 2026-03-22 | PlatformAdapter in packages/ui/platform/ | React Context + usePlatform() 훅. Tauri SDK는 __TAURI_INTERNALS__ 감지 시만 dynamic import → 웹 번들 제외 |
| 2026-03-22 | httpOnly 쿠키 통합 인증 (Keychain은 백업) | WebView 쿠키 jar가 웹과 동일하게 동작. Keychain은 앱 재설치 복구 전용 |
| 2026-03-22 | Monaco CSP: `unsafe-eval` 허용 | Monaco 내부 동작용. 전략 코드 실행은 V8 isolate(서버). EP08-M0에서 보안 검증 |

## Progress notes
- 2026-03-22: M1 (API server) — Complete. Strategy CRUD, candle/event/alert/order query, backtest trigger, execution mode, SSE, auth, kill switch routes all implemented and tested.
- 2026-03-22: M2 (SSE streaming) — Complete. SSE endpoint with subscriber management.
- 2026-03-22: M3 tasks generated — T-08-010 (packages/ui scaffold), T-08-011 (apps/web scaffold), T-08-012 (base components), T-08-013 (API client hooks), T-08-014 (dashboard), T-08-015 (strategy list), T-08-016 (strategy editor), T-08-017 (monitoring pages), T-08-018 (risk management), T-08-019 (login/auth flow).

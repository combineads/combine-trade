# 12-tradingview-charts

## Objective
TradingView 차트 라이브러리(Lightweight Charts / Advanced Charts)와 위젯을 활용하여 시장 데이터, 전략 이벤트, 백테스트 결과, 포지션 현황 등을 전문적인 수준으로 시각화한다. 시장 소식 위젯과 다양한 차트 유형을 통합하여 원스탑 트레이딩 대시보드를 제공한다.

## Scope
- `apps/web/components/charts/` — TradingView 차트 컴포넌트 라이브러리
- `apps/web/components/widgets/` — TradingView 위젯 통합
- `apps/api/` — 차트 데이터 API 엔드포인트
- 캔들차트, 이벤트 마커, 백테스트 오버레이, 성능 차트, 시장 소식

## Non-goals
- TradingView Pine Script 실행 (자체 전략 시스템 사용)
- TradingView 계정 연동 / 소셜 기능
- 유료 TradingView 데이터 피드 (자체 캔들 데이터 사용)

## Prerequisites
- `08-api-ui` M1 (Elysia API), M3 (Next.js 웹 기초)
- `01-candle-collection` — 캔들 데이터 소스
- `02-strategy-sandbox` — 전략 이벤트 데이터
- `05-backtest` — 백테스트 결과 데이터

## Milestones

### M1 — TradingView Lightweight Charts integration
- Deliverables:
  - `lightweight-charts` (Apache 2.0) 라이브러리 통합
  - 기본 캔들스틱 차트 컴포넌트:
    - OHLCV 캔들 렌더링
    - 타임프레임 전환 (1m, 3m, 5m, 15m, 1h)
    - 심볼 전환
    - 줌/스크롤/크로스헤어
  - 실시간 캔들 업데이트: SSE 연동하여 live 캔들 반영
  - 차트 데이터 API:
    - `GET /api/v1/charts/candles?symbol=BTCUSDT&timeframe=1m&from=&to=`
    - 페이지네이션: 스크롤 시 히스토리 추가 로드
- Acceptance criteria:
  - 캔들차트가 부드럽게 렌더링 (1000+ 캔들)
  - 타임프레임/심볼 전환 < 500ms
  - 실시간 캔들 업데이트 반영
  - 히스토리 무한 스크롤 작동
- Validation:
  ```bash
  bun test -- --filter "chart-candle"
  cd apps/web && bun run build
  ```

### M2 — Technical indicator overlays
- Deliverables:
  - 차트 위 기술지표 오버레이:
    - 이동평균선: SMA, EMA, WMA (가격 차트 위)
    - Bollinger Bands (가격 차트 위)
    - 볼륨 바 (하단 패널)
  - 별도 패널 지표:
    - RSI (0-100)
    - MACD (히스토그램 + 시그널)
    - Stochastic
  - 지표 파라미터 UI 설정 (period, source 등)
  - 지표 계산: 서버 사이드 (packages/core/indicator 재사용) + API 제공
  - `GET /api/v1/charts/indicators?symbol=BTCUSDT&timeframe=1m&indicators=sma:20,bb:20:2`
- Acceptance criteria:
  - 지표가 TradingView와 동일한 시각적 표현
  - 지표 추가/제거/파라미터 변경 실시간 반영
  - 서버 계산 결과가 02-strategy-sandbox 지표와 동일
- Validation:
  ```bash
  bun test -- --filter "chart-indicator"
  ```

### M3 — Strategy event markers & annotations
- Deliverables:
  - 차트 위 전략 이벤트 마커:
    - LONG 진입: 녹색 상향 화살표
    - SHORT 진입: 빨간색 하향 화살표
    - PASS: 회색 점 (선택적 표시)
    - WIN 이탈: 녹색 체크마크
    - LOSS 이탈: 빨간색 X
    - TIME_EXIT: 회색 시계
  - TP/SL 수평선 오버레이 (이벤트 선택 시)
  - 이벤트 상세 팝업: 클릭 시 통계, 유사도, 의사결정 근거 표시
  - 전략 필터: 특정 전략의 이벤트만 표시/숨김
  - 기간 필터: 날짜 범위 선택
- Acceptance criteria:
  - 이벤트 마커가 정확한 캔들 위치에 표시
  - TP/SL 라인이 이벤트의 진입가 기준으로 정확히 그려짐
  - 이벤트 클릭 → 상세 팝업 표시
  - 전략/기간 필터 작동
- Validation:
  ```bash
  bun test -- --filter "chart-marker|chart-event"
  ```

### M4 — Backtest result visualization
- Deliverables:
  - 백테스트 결과 차트 세트:
    - 에쿼티 커브 (equity curve): 누적 수익 라인 차트
    - 드로다운 차트: 최대 드로다운 영역 차트
    - WIN/LOSS 분포: 히스토그램 (pnl_pct 구간별)
    - 월별/주별 수익 히트맵
    - 연속 WIN/LOSS streak 바 차트
  - 백테스트 기간 캔들차트 + 이벤트 마커 오버레이
  - 비교 뷰: 전략 버전 간 에쿼티 커브 비교
  - 백테스트 결과 데이터 API:
    - `GET /api/v1/backtest/:id/equity-curve`
    - `GET /api/v1/backtest/:id/distribution`
    - `GET /api/v1/backtest/:id/monthly-returns`
- Acceptance criteria:
  - 에쿼티 커브가 PnL 합계와 정확히 일치
  - 드로다운 계산이 수학적으로 정확
  - 버전 비교 차트에서 차이 시각적 확인 가능
  - 히트맵 컬러 스케일이 직관적 (초록=수익, 빨강=손실)
- Validation:
  ```bash
  bun test -- --filter "chart-backtest|chart-equity"
  ```

### M5 — TradingView widgets & market overview
- Deliverables:
  - TradingView 무료 위젯 통합:
    - **Ticker Tape**: 상단 심볼 가격 리본
    - **Market Overview**: 주요 심볼 가격 변동 요약
    - **Economic Calendar**: 경제 지표 일정
    - **Timeline**: 시장 관련 뉴스 타임라인
    - **Symbol Info**: 심볼 상세 정보 카드
    - **Technical Analysis**: TradingView 기술 분석 요약 게이지
  - 위젯 배치:
    - Dashboard 페이지: Ticker Tape (상단) + Market Overview + Timeline
    - Strategy Detail 페이지: Symbol Info + Technical Analysis
  - 위젯 설정 커스텀: 표시 심볼 목록, 테마(dark/light)
  - 위젯 로드 실패 시 graceful fallback (빈 카드 + 재시도 버튼)
- Acceptance criteria:
  - 모든 위젯이 Tauri 앱 내에서도 정상 렌더링
  - 위젯 로드 실패 시 전체 페이지 렌더링 차단 없음
  - 다크/라이트 테마 전환 시 위젯도 테마 반영
- Validation:
  ```bash
  cd apps/web && bun run build
  # manual: 대시보드에서 위젯 렌더링 확인
  ```

### M6 — Real-time trading dashboard charts
- Deliverables:
  - 실시간 트레이딩 대시보드 차트:
    - 포지션 현황 차트: 오픈 포지션별 미실현 PnL 바 차트
    - 일일 PnL 타임라인: 시간대별 실현 PnL 누적 라인
    - 전략별 성과 비교: 전략별 winrate/expectancy 레이더 차트
    - 파이프라인 레이턴시: 실시간 p50/p95/p99 게이지
  - SSE 연동 실시간 데이터 반영
  - 차트 자동 갱신 주기 설정
- Acceptance criteria:
  - 포지션 PnL이 실시간으로 업데이트 (SSE)
  - 전략 성과 비교가 최신 통계 반영
  - 레이턴시 게이지가 워커 메트릭과 일치
- Validation:
  ```bash
  bun test -- --filter "chart-dashboard|chart-realtime"
  ```

## Task candidates
- T-12-006: Integrate TradingView Lightweight Charts library
- T-12-001: Chart container component (layout, resize, base structure)
- T-12-002: Implement candlestick chart component with timeframe/symbol switching
- T-12-007: Implement real-time candle update via SSE
- T-12-010: Implement chart data API with pagination (infinite scroll)
- T-12-011: Implement technical indicator overlay components (SMA, EMA, BB)
- T-12-012: Implement separate panel indicators (RSI, MACD, Stochastic)
- T-12-013: Implement indicator data API (server-side calculation)
- T-12-003: Implement event markers overlay on chart (LONG/SHORT/WIN/LOSS)
- T-12-008: Implement strategy event chart overlay with TP/SL lines and event detail popup
- T-12-009: Implement equity curve chart component
- T-12-004: Implement backtest result views (drawdown, distribution, heatmap)
- T-12-005: Backtest page integrating chart views
- T-12-014: Implement backtest version comparison chart
- T-12-015: Integrate TradingView Ticker Tape and Market Overview widgets
- T-12-016: Integrate Timeline (news) and Economic Calendar widgets
- T-12-017: Implement real-time position PnL and daily PnL timeline charts
- T-12-018: Implement strategy performance radar chart
- T-12-019: Implement pipeline latency gauge chart
- T-12-020: Add dark/light theme support for all charts and widgets

## Risks
- TradingView Lightweight Charts의 기능 제한 (Advanced Charts 대비): 일부 고급 기능 부재
  - 완화: 핵심 기능은 Lightweight Charts로 충분, 부족 시 커스텀 구현
- TradingView 무료 위젯 정책 변경 가능성
  - 완화: 위젯 의존도 최소화, fallback UI 준비
- 대량 캔들 데이터(3년치) 차트 렌더링 성능
  - 완화: 가시 영역만 렌더링 (virtualization), 서버 사이드 다운샘플링
- Tauri 웹뷰 내 외부 스크립트(위젯) 보안 정책
  - 완화: CSP 설정, 위젯 iframe 격리

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | TradingView Lightweight Charts (Advanced 아님) | 오픈소스(Apache 2.0), 무료, 충분한 기능 |
| 2026-03-21 | 서버 사이드 지표 계산 | 자체 지표 라이브러리와 일관성 보장, 클라이언트 부담 최소화 |
| 2026-03-21 | 무료 위젯만 사용 (유료 연동 아님) | 비용 최소화, 핵심은 자체 데이터 시각화 |
| 2026-03-21 | 자체 캔들 데이터 사용 (TradingView 데이터 피드 아님) | 자체 수집 데이터의 정합성 보장, 추가 비용 없음 |

## Progress notes
- Pending implementation.
- 2026-03-25: All tasks complete. T-12-001 through T-12-020 in done/. Epic fully implemented.

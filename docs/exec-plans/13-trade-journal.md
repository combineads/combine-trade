# 13-trade-journal

## Objective
매매가 종료(라벨링)되면 진입 시점의 의사결정 근거, 시장 맥락, 종료 결과를 하나의 구조화된 매매일지로 자동 생성한다. 트레이더가 개별 매매를 복기하고, 전략 퇴화를 감지하며, 패턴 매칭의 실효성을 사후 검증할 수 있는 기반을 제공한다.

## Scope
- `packages/core/journal/` — 매매일지 도메인 로직 (스냅샷 캡처, 일지 조합, 분석)
- `workers/journal-worker/` — 라벨 생성 시 자동 일지 조합 워커
- DB schema: `trade_journals`, `entry_snapshots` 테이블
- 진입 시점 스냅샷 캡처 (의사결정 직후)
- 종료 시점 일지 조합 (라벨 생성 직후)
- 시장 맥락 수집 (상위 타임프레임, 변동성, 펀딩비)
- 자동 태깅 및 분석 (시장 상태 분류, 백테스트 대비 비교)
- 일지 검색/필터 API

## Non-goals
- 수동 매매일지 작성 UI (에디터) — 08-api-ui 확장으로 추후 처리
- AI 기반 매매일지 요약/분석 — 추후 확장
- 외부 매매일지 앱 연동 (Notion, Google Sheets 등)
- 차트 이미지 캡처 및 저장 — 12-tradingview-charts 확장으로 추후 처리

## Prerequisites
- `01-candle-collection` M2 — 캔들 데이터 접근 (멀티TF 포함)
- `03-vector-engine` M4 — 유사 패턴 검색 결과 + 통계
- `04-label-decision` M1-M3 — 라벨링 + 의사결정 결과
- `06-alert-execution` M3-M4 — 주문 실행 결과 (자동매매 모드 시)
- `11-financial-arithmetic` M2 — 수수료 반영 PnL (선택적, 없으면 gross PnL 사용)

## Milestones

### M1 — Entry snapshot capture
- Deliverables:
  - `packages/core/journal/entry-snapshot.ts` — 진입 시점 컨텍스트 캡처 서비스
  - 의사결정 엔진이 LONG/SHORT 판정 시 즉시 스냅샷 저장:
    - **의사결정 근거**: winrate, expectancy, sample_count, decision threshold 충족 여부
    - **유사 패턴 top-k**: 매칭된 패턴 ID, 유사도 점수, 해당 패턴의 결과(WIN/LOSS)
    - **전략 피처 벡터**: 정규화 전/후 값
    - **주요 지표 값**: 전략이 사용하는 모든 feature의 원본 지표값
    - **엔트리 가격, TP, SL 가격**
  - `entry_snapshots` 테이블: event_id(FK), snapshot_data(JSONB), captured_at
  - vector-worker 파이프라인에 스냅샷 캡처 훅 삽입
- Acceptance criteria:
  - LONG/SHORT 판정 시 entry_snapshot 100% 생성
  - PASS 판정 시 스냅샷 미생성
  - snapshot_data에 의사결정 근거 + 유사 패턴 + 피처 완전히 포함
  - 스냅샷 캡처가 파이프라인 레이턴시에 50ms 이상 영향 없음 (비동기 저장)
- Validation:
  ```bash
  bun test -- --filter "entry-snapshot"
  ```

### M2 — Market context enrichment
- Deliverables:
  - `packages/core/journal/market-context.ts` — 시장 맥락 수집기
  - 진입 시점의 시장 상태 캡처:
    - **상위 타임프레임 트렌드**: 1h, 4h, 1d 캔들의 SMA 기준 방향
    - **변동성**: ATR 기반 현재 변동성 vs 20일 평균 변동성 비율
    - **거래량**: 현재 거래량 vs 20봉 평균 거래량 비율
    - **펀딩비**: 현재 펀딩비율 (Epic 11 M3 의존, 없으면 null)
  - 종료 시점의 시장 상태도 동일 구조로 캡처
  - entry_snapshots.market_context(JSONB)에 저장
- Acceptance criteria:
  - 상위 TF 캔들 데이터가 DB에 존재하면 트렌드 정확히 계산
  - 상위 TF 데이터 부재 시 해당 필드 null (에러 아님)
  - 변동성/거래량 비율이 현실적 범위 (0.x ~ N.x)
- Validation:
  ```bash
  bun test -- --filter "market-context"
  ```

### M3 — Journal assembly on trade close
- Deliverables:
  - `packages/core/journal/assembler.ts` — 일지 조합 로직
  - `workers/journal-worker/` — label_ready 이벤트 수신 → 일지 자동 생성
  - `trade_journals` 테이블:
    - id, event_id(FK), strategy_id, strategy_version, symbol, timeframe
    - direction, entry_price, exit_price, entry_time, exit_time
    - result_type (WIN/LOSS/TIME_EXIT), pnl_pct, net_pnl_pct(nullable)
    - mfe_pct, mae_pct, hold_bars
    - entry_snapshot_id(FK)
    - exit_market_context(JSONB)
    - matched_patterns(JSONB) — top-k 패턴 요약 + 각 패턴의 실제 결과
    - backtest_comparison(JSONB) — 백테스트 통계 vs 실제 결과
    - auto_tags(TEXT[])
    - user_notes(TEXT, nullable)
    - created_at
  - 일지 조합 내용:
    - entry_snapshot 참조
    - 종료 시점 시장 맥락 (M2 재사용)
    - 진입→종료 구간 캔들 데이터 요약 (OHLCV 범위)
    - MFE/MAE 도달 시점 (몇 번째 바에서)
    - 매칭된 유사 패턴의 사후 검증 (유사 패턴들의 결과 분포 vs 실제 결과)
    - 수수료 반영 PnL (Epic 11 가용 시)
  - 백테스트 대비 비교:
    - 동일 전략/버전/심볼의 백테스트 winrate vs 실거래 winrate
    - 백테스트 expectancy vs 실거래 expectancy
- Acceptance criteria:
  - label_ready 이벤트 → trade_journal 100% 생성
  - entry_snapshot 미존재 시 일지 생성하되 entry 섹션 partial (경고 로그)
  - 백테스트 비교 데이터가 정확히 계산
  - journal 멱등성: unique(event_id)
- Validation:
  ```bash
  bun test -- --filter "journal-assembler|journal-worker"
  ```

### M4 — Auto-tagging & pattern analysis
- Deliverables:
  - `packages/core/journal/tagger.ts` — 자동 태그 엔진
  - 시장 상태 기반 자동 태그:
    - `trending_up` / `trending_down` / `ranging` — 상위 TF 트렌드 기준
    - `high_volatility` / `low_volatility` — ATR 비율 기준
    - `high_volume` / `low_volume` — 거래량 비율 기준
    - `with_trend` / `against_trend` — 진입 방향 vs 상위 TF 트렌드
    - `high_funding` / `low_funding` — 펀딩비 수준
  - 매매 결과 기반 태그:
    - `quick_win` (hold_bars < 전략 max_hold의 25%) / `slow_win`
    - `quick_loss` / `slow_loss`
    - `mfe_high` (MFE > TP의 50%였으나 결국 LOSS — 이익 반납 패턴)
    - `clean_win` (MFE ≈ pnl, MAE 최소)
  - 패턴 매칭 사후 검증:
    - 매칭된 top-k 패턴 중 실제로 동일 결과였던 비율
    - 이 비율이 전략 전체 winrate보다 현저히 낮으면 `pattern_drift` 태그
- Acceptance criteria:
  - 모든 일지에 최소 2개 이상 자동 태그 부여
  - 태그 기준이 deterministic (동일 데이터 → 동일 태그)
  - pattern_drift 감지가 통계적으로 유의미 (최소 10 샘플)
- Validation:
  ```bash
  bun test -- --filter "journal-tagger"
  ```

### M5 — Journal API & search
- Deliverables:
  - 일지 조회 API:
    - `GET /api/v1/journals` — 목록 조회 (페이지네이션)
    - `GET /api/v1/journals/:id` — 상세 조회 (entry snapshot + market context 포함)
    - `GET /api/v1/journals/search` — 필터 검색
  - 필터 옵션: strategy_id, symbol, direction, result_type, date_range, tags
  - 사용자 메모 추가 API: `PATCH /api/v1/journals/:id/notes`
  - 사용자 커스텀 태그 추가 API: `PATCH /api/v1/journals/:id/tags`
  - 집계 API:
    - `GET /api/v1/journals/analytics` — 태그별 승률/기대수익 집계
    - `GET /api/v1/journals/drift` — 전략별 백테스트 대비 실거래 성과 비교
  - 최근 N건 일지 SSE 스트리밍 (08-api-ui SSE 인프라 재사용)
- Acceptance criteria:
  - 필터 조합 정확히 작동
  - 태그별 집계가 수학적으로 정확
  - drift API가 백테스트 winrate vs 실거래 winrate 차이 정확히 표시
  - 사용자 메모/태그가 자동 태그와 분리 저장
- Validation:
  ```bash
  bun test -- --filter "journal-api"
  ```

### Boundary rule compliance
packages/core/journal/ must not import Elysia, CCXT, or Drizzle directly. Data access through repository interfaces injected by journal-worker.

## Task candidates
- T-179: Design trade_journals + entry_snapshots DB schema and migration
- T-180: Implement entry snapshot capture service (decision context + similar patterns)
- T-181: Hook entry snapshot capture into vector-worker pipeline (async, non-blocking)
- T-182: Implement market context collector (multi-TF trend, volatility, volume, funding)
- T-183: Implement journal assembler (combine entry snapshot + label + exit context)
- T-184: Build journal-worker (LISTEN label_ready → assemble journal)
- T-185: Implement backtest vs live comparison calculator
- T-186: Implement MFE/MAE timing analysis (peak bar identification)
- T-187: Implement pattern match post-verification (top-k actual outcome ratio)
- T-188: Implement auto-tagger (market state tags + trade result tags)
- T-189: Implement pattern_drift detection with statistical significance check
- T-190: Build journal list/detail/search API endpoints
- T-191: Build journal analytics aggregation API (tag-based winrate/expectancy)
- T-192: Build strategy drift comparison API (backtest vs live)
- T-193: Implement user notes and custom tags API
- T-194: Integration test: decision → entry snapshot → label → journal → tags

## Risks
- 진입 시점 스냅샷 캡처가 파이프라인 레이턴시 예산(1초)에 영향
  - 완화: 비동기 저장 (fire-and-forget INSERT, 실패 시 경고 로그만)
- entry_snapshot 누락 시 일지 품질 저하 (의사결정 근거 부재)
  - 완화: 누락 허용하되 partial journal 생성 + WARNING 태그 부여
- 상위 타임프레임 캔들 데이터 부재 시 시장 맥락 불완전
  - 완화: null 허용, 가용 데이터만으로 태깅 (graceful degradation)
- trade_journals 테이블 크기 증가 (JSONB 컬럼 다수)
  - 완화: snapshot_data는 별도 테이블 분리 완료, JSONB 인덱싱은 필요 시 추가
- 백테스트 대비 비교가 전략 초기(샘플 부족)에 무의미
  - 완화: 최소 30건 실거래 미만 시 drift 분석 비활성화

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | entry_snapshot을 별도 테이블로 분리 | 진입 시점(실시간)과 종료 시점(지연)의 저장 타이밍이 다름 |
| 2026-03-21 | 스냅샷 캡처는 비동기 fire-and-forget | 1초 레이턴시 예산 보호, 일지 누락보다 매매 실행이 우선 |
| 2026-03-21 | JSONB로 유연한 스키마 | 전략마다 features/indicators가 다르므로 고정 컬럼 불가 |
| 2026-03-21 | 자동 태그와 사용자 태그 분리 저장 | 자동 태그는 재계산 가능, 사용자 태그는 불변 |
| 2026-03-21 | pattern_drift 최소 샘플 30건 | 통계적 유의성 확보, 전략 의사결정 기준과 일치 |

## Progress notes
- 2026-03-22: EP13 M1-M4 pure computation layer implemented.
  - T-063: Entry snapshot builder — `buildEntrySnapshot()` (9 tests)
  - T-064: Market context calculator — `classifyTrend()`, `buildMarketContext()` (11 tests)
  - T-065: Journal assembler — `assembleJournal()` (8 tests)
  - T-066: Auto-tagger — `generateTags()` with configurable thresholds (14 tests)
  - T-067: Integration test — full pipeline snapshot→context→assembler→tagger (7 tests)
  - Total: 49 tests, 144 assertions, all passing
  - M5 (worker, DB, API) deferred — requires EP08 framework setup

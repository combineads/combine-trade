# 05-backtest

## Objective
3년치 과거 데이터를 사용하여 전략을 검증하고 벡터 + 라벨을 일괄 생성하는 백테스트 엔진을 구축한다. 이는 전략 배포 전 필수 단계이며, 실시간 운영의 통계적 기반이 된다.

## Scope
- `packages/backtest/` — 백테스트 엔진
- 히스토리컬 캔들 리플레이
- 전략 샌드박스 일괄 실행
- 벡터 일괄 생성
- 라벨 일괄 판정
- 성능 리포트 생성

## Non-goals
- 실시간 파이프라인 (07-realtime-pipeline에서 처리)
- 최적화/파라미터 튜닝 (추후 확장)
- Walk-forward 분석 (추후 확장)

## Prerequisites
- `01-candle-collection` M1-M2 — 캔들 데이터 소스 + 저장소
- `02-strategy-sandbox` M1-M4 — 지표, 전략 모델, 샌드박스, API
- `03-vector-engine` M1-M3 — 정규화, 동적 테이블, 벡터 저장/검색
- `04-label-decision` M1, M3 — 라벨링, 의사결정

## Milestones

### M1 — Historical candle loader (3-tier backfill)
- Deliverables:
  - **3-tier 백필 전략** (TECH_STACK.md 참조):
    - **Tier 1 — Binance Vision Monthly Archives** (primary, fastest):
      - URL: `data.binance.vision/data/futures/um/monthly/klines/{SYMBOL}/{TF}/{SYMBOL}-{TF}-{YYYY}-{MM}.zip`
      - 3년치: ~36 ZIP 파일 다운로드 → CSV 파싱 → bulk INSERT
      - 전월 데이터: 당월 첫 번째 월요일부터 가용
      - CSV 컬럼 (12개): open_time, open, high, low, close, volume, close_time, quote_volume, trades, taker_buy_base_vol, taker_buy_quote_vol, ignore
    - **Tier 2 — Binance Vision Daily Archives** (recent gap):
      - URL: `data.binance.vision/data/futures/um/daily/klines/{SYMBOL}/{TF}/{SYMBOL}-{TF}-{YYYY}-{MM}-{DD}.zip`
      - 당월 1일 ~ T-1일까지 가용 (전일 데이터 다음날 게시)
    - **Tier 3 — REST API** (last ~1 day):
      - 마지막 ~1일 갭: `fetchOHLCV()` 호출 (~1,440 candles for 1m)
      - Rate limit 존중 + 자동 재시도
  - **CHECKSUM 검증**: 각 ZIP 파일의 `.CHECKSUM` (SHA256) 파일 다운로드 후 무결성 검증
  - OKX fallback: Binance Vision 미제공 → Tier 3 (REST) only (전체 기간)
  - 타임프레임별/심볼별 병렬 다운로드 지원
  - 진행률 보고 (% 완료, tier별 상태)
  - 다운로드 재개 (이미 저장된 구간 스킵 — 멱등)
  - 다운로드 완료 후 연속성 검증 자동 실행
- Acceptance criteria:
  - Binance BTCUSDT 1m 3년치 ≈ 1,576,800건 다운로드 완료
  - Tier 1+2 (Vision): 3년치 로드 < 3분 (네트워크 종속)
  - 연속성 검증 통과 (갭 0)
  - 재실행 시 기존 데이터 스킵 (멱등)
  - OKX REST fallback도 정상 작동
- Validation:
  ```bash
  bun run backtest:load -- --exchange binance --symbol BTCUSDT --timeframe 1m --years 3
  # Expected: Tier 1 (monthly ZIPs) → Tier 2 (daily ZIPs) → Tier 3 (REST last ~1 day)
  ```

### M2 — Backtest replay engine
- Deliverables:
  - `packages/backtest/engine.ts` — 리플레이 엔진
  - 캔들 순차 순회하며 전략 샌드박스 실행
  - 이벤트 발생 시: features 정규화 → 벡터 저장
  - 이벤트 발생 시: forward 캔들로 즉시 라벨 판정
  - **Look-ahead bias 방지**:
    - 벡터 검색 시 시간 경계 강제: 현재 이벤트 시점 이전 벡터만 검색 대상
    - `WHERE event_time < current_event_time` 필터 적용
    - cold start 기간: 벡터가 min_samples 미만일 때 통계 INSUFFICIENT로 처리
    - cold start 기간을 리포트에 명시 (첫 유효 결정까지의 이벤트 수)
  - 체크포인트: 1000 이벤트마다 진행 상태 저장
  - 실패 시 마지막 체크포인트에서 재개
  - **Post-backtest HNSW REINDEX**: after bulk vector insertion during backtest, trigger `REINDEX INDEX CONCURRENTLY` on the affected vector table to restore optimal index quality
  - **Partial state recovery**: if backtest fails mid-run, provide cleanup utility to:
    - Remove incomplete vectors (those without corresponding labels)
    - Reset checkpoint to last consistent state
    - Report what was recovered vs lost
- Acceptance criteria:
  - 3년 1전략 백테스트 < 5분 완료
  - 모든 이벤트에 벡터 + 라벨 생성
  - 체크포인트 재개 작동
  - 메모리 사용량 안정 (무한 증가 없음)
- Validation:
  ```bash
  bun run backtest -- --strategy-id <id> --version 1
  # 실행 시간 측정: < 5분
  ```

### M3 — Backtest statistics & report
- Deliverables:
  - 백테스트 완료 후 통계 집계:
    - 총 이벤트 수, WIN/LOSS/TIME_EXIT 분포
    - winrate, expectancy, avg_win, avg_loss
    - 최대 연속 손실, 최대 드로다운
    - 기간별 분포 (월별/분기별)
    - **동시 TP/SL 도달 비율** (sl_hit_first 기반)
    - **cold start 기간**: 첫 유효 의사결정까지의 이벤트 수 및 소요 기간
    - **슬리피지 추정**: 시장가 주문 시 entry_price 대비 차 캔들 open 가격 차이 통계
  - JSON 리포트 출력
  - 유사 검색 통계: 평균 유사도, threshold 통과율
  - **수수료 영향 분석** (11-financial-arithmetic 연동 시):
    - gross PnL vs net PnL
    - total estimated fees
- Acceptance criteria:
  - 통계가 수학적으로 정확 (수동 계산 대비 검증)
  - 리포트 파일 생성
  - 백테스트 결과로 생성된 벡터가 실시간 검색에 사용 가능
- Validation:
  ```bash
  bun run backtest -- --strategy-id <id> --version 1 --report
  # verify report file exists and statistics are plausible
  ```

### M4 — Strategy version re-vectorization
- Deliverables:
  - 전략 버전 변경 시 재벡터화 워크플로:
    1. 새 벡터 테이블 생성 (03-vector-engine)
    2. 기존 이벤트에 대해 새 features 정의로 재벡터화
    3. 기존 라벨 유지 (라벨은 result_config가 동일한 경우에만 재사용 가능 — tp_pct, sl_pct, max_hold_bars가 변경되면 재계산 필수)
    4. 새 통계 생성
  - 진행률 보고
  - 기존 버전 벡터 테이블 보존 (롤백 가능)
- Acceptance criteria:
  - 버전 변경 → 새 테이블 + 재벡터화 완료
  - 기존 버전 데이터 미변경
  - 새 버전 통계가 정확
  - If strategy version change includes modified result_config (tp_pct, sl_pct, max_hold_bars), labels must be recalculated before re-vectorization. Only feature/normalization changes allow label reuse.
- Validation:
  ```bash
  bun run backtest:revectorize -- --strategy-id <id> --from-version 1 --to-version 2
  ```

## Task candidates
- T-05-001: Implement historical candle bulk downloader with Binance Vision CSV archive (monthly + daily) as primary source, REST API fallback, CHECKSUM verification + download resume logic (skip existing ranges)
- T-05-002: Implement backtest replay engine (sequential candle processing) with strategy sandbox integration + checkpoint system (save/resume every 1000 events) + optimize replay performance (target: < 5min for 3yr)
- T-05-003: Integrate label judgment into replay loop (forward scan)
- T-05-004: Implement backtest statistics aggregation and JSON report generator + cold start period tracking + slippage estimation statistics + post-backtest HNSW REINDEX trigger
- T-05-006: Implement look-ahead bias prevention (time boundary filter in vector search)
- T-05-008: Implement re-vectorization workflow for version changes
- T-05-005: Integration test: full 3-year backtest end-to-end + partial state recovery/cleanup utility for failed backtests
- T-05-009: Performance benchmark: measure and optimize backtest latency

## Risks
- 3년치 1분봉 데이터 볼륨 (~158만건/심볼) 메모리 관리 필요
- 백테스트 중 벡터 검색이 누적 벡터 증가로 점진적 느려질 수 있음
- 거래소 REST API rate limit으로 히스토리컬 데이터 다운로드 시간 소요
- 재벡터화 시 features 정의 변경에 따른 기존 이벤트 호환성
- Backtest overfitting: optimized parameters may not generalize to live markets. Mitigation: M3 statistics report includes monthly breakdown to surface temporal instability. Walk-forward analysis deferred to future extension (see Non-goals).

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | 라벨 재사용 조건: result_config 동일 시에만 | Labels are reusable across strategy versions only when result_config (tp_pct, sl_pct, max_hold_bars) is identical. If result_config changes, labels must be recalculated. |
| 2026-03-21 | 체크포인트 1000 이벤트 단위 | 장기 백테스트 중 실패 시 전체 재시작 방지 |
| 2026-03-21 | 기존 버전 테이블 보존 | 새 버전이 기대 이하일 때 롤백 가능 |
| 2026-03-21 | 벡터 검색 시 시간 경계 필터 필수 | look-ahead bias 방지 — 미래 이벤트 벡터 참조 금지 |
| 2026-03-21 | cold start 기간 리포트 포함 | 사용자가 통계 유효 시작 시점 인지해야 함 |
| 2026-03-22 | Binance Vision 3-tier backfill 채택 | Monthly→Daily→REST 순서로 3년치 벌크 로드. Monthly: 당월 첫 월요일 게시, Daily: T-1 (익일 게시). SHA256 CHECKSUM 검증 필수. |

## Progress notes
- 2026-03-22: Tasks generated — T-05-001 (CSV parser), T-05-002 (engine), T-05-003 (labeler), T-05-004 (report), T-05-005 (integration).
- 2026-03-22: M1 partial (CSV parser), M2 (replay engine + labeler), M3 (statistics report) completed. 353 tests passing. M1 Binance Vision download, M4 re-vectorization deferred to future tasks.

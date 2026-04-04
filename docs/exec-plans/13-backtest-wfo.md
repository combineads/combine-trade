# 13-backtest-wfo

## Objective
라이브 파이프라인과 동일한 코드 경로를 사용하는 백테스트 러너와 Walk-Forward Optimization(WFO)을 구현한다.

## Scope
- `src/backtest/` (L8): 백테스트 러너, Mock 어댑터, WFO 옵티마이저
- 라이브 파이프라인 코드 재사용 (candles→indicators→filters→signals→vectors→knn→positions→limits→exits→labeling)

## Non-goals
- 실시간 트레이딩 (EP-09)
- 새로운 전략 추가
- 시각화 (초기 — 웹 UI에서 별도)

## Prerequisites
- EP-01~EP-12 전체 완료
- 특히 EP-05 (벡터라이저, KNN 엔진), EP-12 (전략 검증 수정) 필수
- 충분한 히스토리 캔들 데이터 (EP-04)

## Milestones

### M1 — Mock 어댑터 & 백테스트 엔진
- Deliverables:
  - `db/migrations/006` — Backtest 테이블 마이그레이션
  - `src/backtest/mock-adapter.ts` — MockExchangeAdapter
    - 히스토리 캔들을 시간순으로 공급
    - 주문 즉시 체결 시뮬레이션
    - 슬리피지 시뮬레이션 (설정 가능)
  - `src/backtest/engine.ts` — BacktestRunner
    - 캔들 순회 → 파이프라인 호출 → 결과 수집
    - 미래 데이터 참조 방지 (lookahead bias)
- Acceptance criteria:
  - MockAdapter가 ExchangeAdapter 인터페이스 구현
  - 현재 타임스탬프 이후 데이터 접근 불가 (NO lookahead)
  - 라이브 파이프라인과 동일 코드 경로 사용
  - 시장가 주문 = 현재 close 가격으로 체결 (기본)
- Validation:
  - `bun test -- --grep "backtest"`

### M2 — 결과 집계 & 메트릭
- Deliverables:
  - `src/backtest/metrics.ts` — 결과 계산
    - 총 거래 수, 승률, 기대값
    - 최대 낙폭(MDD), 샤프 비율, 프로핏 팩터
    - 거래별 상세 (진입/청산 가격, PnL, 보유 시간)
  - `src/backtest/reporter.ts` — 결과 출력 (CLI 테이블 + DB 저장)
- Acceptance criteria:
  - 모든 메트릭이 Decimal.js로 계산
  - Backtest 테이블에 결과 저장
  - CLI에서 요약 테이블 출력
- Validation:
  - `bun test -- --grep "metrics"`
  - `bun run backtest -- --symbol BTCUSDT --start 2024-01-01 --end 2024-06-01`

### M3 — Walk-Forward Optimization
- Deliverables:
  - `src/backtest/wfo.ts` — WFO 옵티마이저
    - 구간: 6개월 IS / 2개월 OOS / 1개월 롤
    - 최적화 대상: CommonCode 튜닝 가능 파라미터 (ANCHOR 제외)
    - WFO 효율성 계산 (OOS/IS expectancy)
  - 결과를 Backtest 테이블에 저장 (parent_id로 구간 연결)
- Acceptance criteria:
  - IS 구간에서 최적 파라미터 탐색
  - OOS 구간에서 검증
  - WFO 효율성 > 0.5 기준 보고
  - ANCHOR 그룹 파라미터는 최적화에서 제외
  - 구간별 결과가 parent_id로 연결
- Validation:
  - `bun run backtest -- --mode wfo --symbol BTCUSDT`

**WFO 파라미터 탐색 전략:**

| 파라미터 그룹 | 탐색 대상 | 범위 예시 | 탐색 방법 |
|--------------|----------|----------|----------|
| KNN | top_k | 30~100 (step 10) | Grid |
| POSITION | max_pyramid_count | 1~3 | Grid |
| LOSS_LIMIT | max_daily_loss_pct | 0.05~0.15 (step 0.025) | Grid |
| SLIPPAGE | max_spread_pct | 0.03~0.10 (step 0.01) | Grid |
| FEATURE_WEIGHT | bb4_position 등 | 0.5~3.0 (step 0.5) | Random (top 5) |
| TIME_DECAY | 기간별 가중치 | 0.5~1.5 | Grid |

- **탐색 전략**: 2단계 — (1) Grid search로 큰 범위 탐색 (핵심 5개 파라미터), (2) Random search로 가중치 미세 조정
- **예상 조합 수**: Grid 단계 ~500, Random 단계 ~100 (총 ~600)
- **예상 실행 시간**: 3년 데이터 기준 1회 백테스트 ~5초 → WFO 구간 6개 × 600조합 = ~5시간
- **병렬화**: Bun worker threads 활용 (4~8 스레드)

**메모리 사용량 추정:**

| 데이터 | 크기 (심볼당) |
|--------|-------------|
| 1M 캔들 3년 (1.58M행 × ~100B) | ~150MB |
| 5M 캔들 3년 (315K행 × ~100B) | ~30MB |
| 벡터 (1.58M × 808B) | ~1.2GB |
| 지표 캐시 | ~50MB |
| **합계 (1심볼)** | **~1.4GB** |

- **완화**: 벡터는 DB에서 필요 시 검색 (메모리에 전체 로드하지 않음)
- **완화**: 캔들은 슬라이딩 윈도우로 필요한 구간만 메모리 유지
- **Bun 프로세스 메모리**: 기본 제한 없으나, 4GB 이상 시 GC 압박. 2심볼 동시 실행 시 주의.

### M4 — 백테스트 CLI
- Deliverables:
  - `bun run backtest` CLI 인터페이스
  - 옵션: --symbol, --exchange, --start, --end, --mode (backtest/wfo), --threads
  - 진행률 표시
  - 결과 요약 출력
- Acceptance criteria:
  - CLI에서 모든 옵션 동작
  - 긴 실행 시 진행률 표시
  - 에러 시 명확한 메시지
- Validation:
  - `bun run backtest --help`

## Task candidates
- T-13-001: db/migrations/006 — Backtest 테이블 마이그레이션
- T-13-002: backtest/mock-adapter.ts — MockExchangeAdapter
- T-13-003: backtest/mock-adapter.ts — 슬리피지 시뮬레이션 & lookahead 방지
- T-13-004: backtest/engine.ts — BacktestRunner 기본 루프
- T-13-005: backtest/engine.ts — 파이프라인 코드 재사용 연결
- T-13-006: backtest/metrics.ts — 기본 메트릭 (승률, 기대값, MDD)
- T-13-007: backtest/metrics.ts — 고급 메트릭 (샤프, 프로핏 팩터)
- T-13-008: backtest/reporter.ts — CLI 출력 & DB 저장
- T-13-009: backtest/wfo.ts — WFO 구간 관리 (IS/OOS/롤)
- T-13-010: backtest/wfo.ts — 파라미터 탐색 루프 (Grid + Random 2단계)
- T-13-011: backtest/wfo.ts — WFO 효율성 검증 & 보고
- T-13-012: backtest/wfo.ts — Worker thread 병렬화
- T-13-013: CLI 인터페이스 (argparse, 진행률, --threads)
- T-13-014: 백테스트 정확성 검증 (수동 계산 대비)

## Risks
- **코드 경로 동일성**: 라이브와 백테스트가 분기하면 신뢰도 하락. MockAdapter 인터페이스 준수가 핵심.
- **WFO 실행 시간**: 3년 데이터 × 600 조합 ~5시간. **완화**: Worker thread 병렬화 (4~8 스레드 → ~1시간).
- **Lookahead bias**: 미래 데이터 참조 버그가 결과를 무효화. MockAdapter에서 타임스탬프 기반 접근 제한 필수.
- **메모리 사용량**: 벡터 전체 로드 시 1.2GB/심볼. **완화**: DB 검색 기반 + 캔들 슬라이딩 윈도우.
- **WFO 과적합**: IS에서 좋은 파라미터가 OOS에서 실패. **완화**: WFO 효율성 > 0.5 기준, ANCHOR 보호.

## Decision log
- 백테스트는 개별 Signal/Ticket/Order를 DB에 저장하지 않음 (메모리에서 실행, 집계만 저장)
- WFO 최적화 대상은 CommonCode 파라미터 중 ANCHOR 제외한 것만
- MockAdapter는 시장가 주문 = 현재 close 가격으로 체결 (기본), 슬리피지 옵션 추가
- WFO 탐색은 2단계 (Grid → Random) — 조합 폭발 방지
- 벡터는 메모리 전체 로드 대신 DB 검색 — 메모리 사용량 완화
- Backtest 테이블은 이 에픽 마이그레이션에서 생성

## Consensus Log
- Round 1-2: EP-01~EP-13 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- (작업 전)

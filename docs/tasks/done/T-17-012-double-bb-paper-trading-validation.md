# T-17-012 Double-BB paper trading validation & readiness score

## Goal
Double-BB 전략을 paper 모드(execution_mode='paper')로 전환하고 ≥ 7일 모의매매를 실행한다. 완료 후 readiness score를 산출한다.

## Why
EP17-M5 요건: live 배포 전 paper trading 7일 검증과 readiness score ≥ 70점이 필요하다.
Paper trading 코드(T-14-001~T-14-005)와 readiness score 모듈(T-14-005)은 이미 구현되어 있다.

## Inputs
- T-17-011: 실시간 파이프라인 e2e 검증 완료
- T-14-005 결과물: `ReadinessScoreCalculator` (packages/core/paper)
- `packages/core/paper/` — paper order matcher, balance tracker
- API: execution_mode 전환 엔드포인트

## Dependencies
T-17-011

## Expected Outputs
- Double-BB LONG + SHORT: 7일 paper trading 실행 기록
- Readiness score ≥ 70점 산출 (backtest 35 + paper 35 + risk 20 + manual 10)
- 일별 손실 한도 breach = 0

## Deliverables
- `scripts/check-readiness.ts` — readiness score 조회 + 출력 스크립트:
  - DB에서 백테스트 통계 로드 (trades ≥ 100, expectancy, Sharpe, max DD)
  - Paper trading 기록 로드 (duration, trades, win rate z-test)
  - Risk 설정 확인 (loss limit, position size, kill switch)
  - 전체 점수 계산 + 항목별 출력
- **Manual step**: execution_mode를 'paper'로 전환 후 7일 대기

## Constraints
- paper trading은 실제 7일 실행이 필요 (자동화 불가)
- readiness score 계산 코드는 자동화 가능 (scripts/check-readiness.ts)
- win rate z-test: paper vs backtest 비교 (p < 0.05)

## Steps
1. `ReadinessScoreCalculator` 인터페이스 확인
2. `scripts/check-readiness.ts` 작성
3. Double-BB LONG/SHORT execution_mode → 'paper' 전환 (API 호출)
4. ≥ 7일 모의매매 실행 모니터링
5. `bun run scripts/check-readiness.ts` 실행
6. 점수 검증

## Acceptance Criteria
- `scripts/check-readiness.ts` 실행 시 항목별 점수 출력
- paper trading 7일 무사고 실행 (daily loss limit breach = 0)
- readiness score ≥ 70
- win rate z-test 통과 (paper ≈ backtest)
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun run scripts/check-readiness.ts --strategy-name double-bb-long
bun run scripts/check-readiness.ts --strategy-name double-bb-short
```

## Out of Scope
Live 배포 (T-17-013), 새 전략 추가, multi-symbol 운영

# T-17-010 Double-BB backtest execution & stats validation

## Goal
Double-BB LONG/SHORT 전략에 대해 3년치 백테스트를 실행하고, 통계(trades ≥ 100, expectancy > 0)를 검증한다. 완료 후 HNSW REINDEX를 수행한다.

## Why
전략 코드(T-17-002~T-17-008)와 seed 스크립트(T-17-008)는 완료됐지만, 실제 3년치 데이터로 백테스트를 돌려 벡터+라벨을 생성하고 통계를 검증하지 않았다. 이 단계 없이 실시간 파이프라인에서 kNN 검색이 불가능하다(cold start).

## Inputs
- T-17-009 출력물: 3yr BTCUSDT 1m 캔들 DB에 적재 완료
- T-17-008 출력물: Double-BB LONG/SHORT 전략 DB 등록 완료 (strategy_id 필요)
- `packages/backtest/engine.ts` — 백테스트 엔진 (T-05-002 결과물)
- `packages/backtest/report.ts` — 통계 리포트 (T-05-004 결과물)

## Dependencies
T-17-009, T-17-008

## Expected Outputs
- Double-BB LONG 전략: 벡터 + 라벨 생성 완료, JSON 리포트
- Double-BB SHORT 전략: 벡터 + 라벨 생성 완료, JSON 리포트
- HNSW 인덱스 최적화 완료

## Deliverables
- `scripts/run-double-bb-backtest.ts` — 백테스트 실행 스크립트:
  - Double-BB LONG strategy_id와 SHORT strategy_id를 DB에서 조회
  - 각 전략에 대해 `BacktestEngine.run()` 호출 (3yr 데이터, version=1)
  - 완료 후 통계 검증: trades ≥ 100, expectancy > 0
  - 완료 후 `REINDEX INDEX CONCURRENTLY` 실행 (HNSW 인덱스 최적화)
  - JSON 리포트를 `reports/double-bb-backtest-{long|short}-{date}.json`에 저장

## Constraints
- look-ahead bias 방지: 백테스트 엔진의 시간 경계 필터 반드시 활성화
- 백테스트 중단 시 체크포인트에서 재개 가능해야 함
- 통계 검증 실패 시 경고 출력 (에러로 종료하지 않음 — 결과 검토 후 파라미터 조정 가능)

## Steps
1. DB에서 Double-BB LONG/SHORT strategy_id 조회 방법 확인
2. `scripts/run-double-bb-backtest.ts` 스크립트 작성
3. LONG 백테스트 실행 (예상: < 5분)
4. SHORT 백테스트 실행
5. 통계 검증 (trades ≥ 100, expectancy > 0)
6. HNSW REINDEX 실행
7. JSON 리포트 저장 확인

## Acceptance Criteria
- LONG + SHORT 각각 백테스트 < 5분 완료
- 벡터 + 라벨 생성 확인 (벡터 테이블에 레코드 존재)
- trades ≥ 100 (양쪽 모두)
- expectancy > 0 (양쪽 모두, 아니면 경고 출력 후 파라미터 조정)
- HNSW REINDEX 완료
- JSON 리포트 파일 생성

## Validation
```bash
bun run typecheck
bun run scripts/run-double-bb-backtest.ts
# 리포트 파일 확인:
ls reports/double-bb-backtest-*.json
```

## Out of Scope
실시간 파이프라인 검증 (T-17-011), 파라미터 최적화, Walk-forward 분석

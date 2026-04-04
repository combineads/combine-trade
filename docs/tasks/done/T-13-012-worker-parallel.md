# T-13-012 Worker Thread 병렬화

## Goal
WFO 파라미터 탐색을 Bun Worker threads로 병렬 실행하여 실행 시간을 단축한다.

## Why
WFO 600조합 × 6구간 ≈ 5시간(순차). Worker 4~8개로 병렬화하면 ~1시간으로 단축. 실사용성의 핵심.

## Inputs
- `src/backtest/param-search.ts` — gridSearch, randomSearch
- `src/backtest/engine.ts` — BacktestRunner
- `docs/exec-plans/13-backtest-wfo.md` — 병렬화 전략, Bun Worker 호환성 리스크

## Dependencies
- T-13-010

## Expected Outputs
- `src/backtest/worker.ts` — Worker thread 코드
- `src/backtest/parallel.ts` — 병렬 실행 매니저
- param-search.ts 업데이트 — 병렬 옵션

## Deliverables
- `src/backtest/worker.ts`
- `src/backtest/parallel.ts`

## Constraints
- Bun Worker API 사용 (`new Worker()`)
- 워커 수는 CLI --threads 옵션으로 설정 (기본: CPU 코어 수 / 2)
- 워커가 실패하면 해당 조합만 재시도 (전체 중단 안 함)
- DB 커넥션은 워커별 독립 (pool 공유 안 함)
- **폴백**: Bun Worker가 불안정하면 단일 스레드 순차 실행으로 자동 폴백

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/backtest/worker.ts` — Worker entry point: 파라미터 조합 받아서 백테스트 실행 → 결과 반환
4. `src/backtest/parallel.ts` — ParallelSearchManager:
   a. Worker pool 생성 (N개)
   b. 조합을 chunk로 분배
   c. 결과 수집 → 병합
5. Worker 실패 시 retry 1회, 재실패 시 에러 로그 + skip
6. Bun Worker 생성 실패 시 순차 실행 폴백
7. param-search.ts에 `parallel: boolean` 옵션 추가
8. Run tests — confirm all pass (GREEN phase)
9. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- 4 workers로 600 조합 실행 시 단일 스레드 대비 3배 이상 빠름
- Worker 1개 실패 → 나머지 정상 완료, 실패 조합 로그
- Bun Worker 미지원 환경 → 순차 폴백, 에러 없음

## Test Scenarios
- ParallelSearchManager(threads=2) with 10 combinations → 결과 10개 반환
- Worker 에러 시뮬레이션 → 해당 조합 skip, 나머지 결과 정상
- threads=1 → 실질적 순차 실행과 동일 결과
- Bun Worker 생성 실패 mock → 순차 폴백 로그 출력, 결과 정상
- 병렬 결과와 순차 결과 → 동일한 최적 파라미터 (결정론적 seed 시)

## Validation
```bash
bun run typecheck
bun test -- --grep "worker|parallel"
```

## Out of Scope
- SharedArrayBuffer 활용 (향후 최적화)
- 멀티 프로세스 (Bun Worker만 사용)

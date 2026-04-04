# T-10-015 전략 교정 통합 테스트 (E2E)

## Goal
EP-10 전체(M1 신호 파이프라인 교정, M2 벡터/KNN 교정, M3 안전장치/리스크 보완)의 핵심 교정 사항이 end-to-end로 올바르게 동작하는지 검증하는 통합 테스트를 작성한다.

## Why
EP-10의 15개 태스크는 각각 단위 테스트를 포함하지만, 모듈 간 연결(BB4 source=open이 Evidence Gate를 거쳐 KNN까지 흐르는 경로, normalizer 출력이 KNN decision에 영향을 주는 경로, FSM 가드가 pipeline에서 동작하는 경로 등)은 단위 테스트로 검증할 수 없다. 통합 테스트로 교정 사항들이 실제 파이프라인에서 의도대로 상호작용하는지 확인해야 한다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — EP-10 전체 acceptance criteria
- T-10-001 ~ T-10-014 — 모든 선행 태스크의 구현 결과
- `src/indicators/bollinger.ts` — BB4 source=open 구현
- `src/filters/daily-direction.ts` — 등호 허용 구현
- `src/vectors/normalizer.ts` — [0,1] 출력, NaN→0.5 구현
- `src/knn/decision.ts` — 수수료 차감, A급 임계값 구현
- `src/knn/time-decay.ts` — 3단계 이산 감쇠 구현
- `src/positions/fsm.ts` — SymbolState FSM 전이 가드 구현

## Dependencies
- T-10-001: BB4 source=open
- T-10-002: daily-direction 등호 허용
- T-10-003: evidence-gate ONE_B + A급 신호
- T-10-004: safety-gate 임계값 교정
- T-10-005: watching 조건 교정
- T-10-006: 전략 피처 12개
- T-10-007: 캔들 피처 분모 교정
- T-10-008: normalizer 교정
- T-10-009: KNN decision 수수료/임계값
- T-10-010: time-decay 이산 감쇠
- T-10-011: SymbolState FSM 가드
- T-10-012: spread 사전 체크
- T-10-013: 계좌 일일 손실 합산
- T-10-014: reconciliation FOR UPDATE + Slack

## Expected Outputs
- `tests/strategy-alignment/strategy-alignment-e2e.test.ts` — EP-10 통합 테스트 (신규 파일)

## Deliverables
- `tests/strategy-alignment/strategy-alignment-e2e.test.ts`

## Constraints
- 테스트는 실제 DB/거래소 없이 실행 가능해야 함 (mock/stub 사용)
- 각 테스트 시나리오는 EP-10 acceptance criteria 중 하나 이상을 커버
- 테스트 데이터는 현실적인 시장 데이터 구조를 사용하되, 결정적(deterministic) 결과를 보장
- 기존 테스트 파일과 충돌하지 않는 독립 디렉토리 사용 (tests/strategy-alignment/)
- Decimal.js 정밀도 유지

## Steps
1. `tests/strategy-alignment/` 디렉토리 생성
2. 테스트 헬퍼 작성: mock candle data (open !== close), mock indicators, mock KNN neighbors
3. 시나리오 1: BB4 source=open → evidence-gate 흐름 검증
4. 시나리오 2: daily direction close==open → LONG_ONLY 또는 SHORT_ONLY 결과 검증
5. 시나리오 3: normalizer 출력 범위 [0,1] + NaN→0.5 검증
6. 시나리오 4: KNN decision에 수수료(0.08%) 차감 반영 검증
7. 시나리오 5: time-decay 3단계 이산 가중치 (1.0/0.7/0.2) 검증
8. 시나리오 6: SymbolState FSM IDLE→HAS_POSITION 차단 검증
9. typecheck + lint 통과 확인

## Acceptance Criteria
- BB4 source=open 기반 캔들 데이터가 evidence-gate를 통과하여 올바른 결과 반환
- daily_direction에서 close==open 시 이전 방향 유지 (LONG_ONLY 또는 SHORT_ONLY)
- normalizer 출력이 모든 값에서 [0,1] 범위 이내, NaN 입력 시 0.5 반환
- KNN net_expectancy에 0.08% 수수료가 차감된 상태에서 decision 산출
- time-decay가 1개월 이내 1.0, 1~3개월 0.7, 3개월 초과 0.2 가중치 적용
- SymbolState FSM이 IDLE→HAS_POSITION 직접 전이를 InvalidSymbolStateTransitionError로 차단
- 모든 테스트가 외부 의존성(DB, 거래소 API) 없이 실행 가능

## Test Scenarios
- BB4 source=open: open과 close가 다른 캔들 세트로 calcBB(source=open) 실행 → open 기반 밴드가 evidence-gate의 BB4 터치 판정에 사용됨을 검증
- daily direction 등호: close==open, MA20 slope > 0 → LONG_ONLY 반환; close==open, MA20 slope < 0 → SHORT_ONLY 반환
- normalizer [0,1]: 극단값(-100, 100), 정상값, NaN, Infinity 입력 → 출력이 모두 [0,1] 범위이며 NaN→0.5
- KNN 수수료: neighbors winRate=55%, avgReturn=0.5%, fee=0.08% → net_expectancy에 fee 차감 반영 확인
- time-decay 이산 감쇠: 10일 전 neighbor → weight=1.0; 60일 전 → weight=0.7; 120일 전 → weight=0.2
- FSM 가드: validateSymbolStateTransition("IDLE", "HAS_POSITION") → throw; validateSymbolStateTransition("IDLE", "WATCHING") → 통과 후 validateSymbolStateTransition("WATCHING", "HAS_POSITION") → 통과

## Validation
```bash
bun test -- tests/strategy-alignment/
bun run typecheck
bun run lint
```

## Out of Scope
- 실제 DB 또는 거래소 API 연동 테스트
- 백테스트 실행 (EP-13 범위)
- 성능/부하 테스트
- pipeline.ts의 full E2E (handleCandleClose 전체 흐름) — 이 테스트는 개별 모듈 간 연결 검증에 집중
- 기존 단위 테스트 수정

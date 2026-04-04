# T-05-014 시그널 파이프라인 E2E 통합 테스트

## Goal
시그널 파이프라인의 전체 흐름(방향 필터 → 거래차단 → WATCHING → Evidence Gate → Safety Gate → Vectorize → Normalize → KNN → Decision)을 E2E로 테스트한다.

## Why
개별 모듈은 단위 테스트로 검증했지만, 모듈 간 데이터 흐름과 상태 전이가 올바른지 확인하는 통합 테스트가 필요하다. 데몬 오케스트레이션(EP-09) 전에 파이프라인 정합성을 보장한다.

## Inputs
- 모든 EP-05 모듈: filters/, signals/, vectors/, knn/
- `tests/helpers/test-db.ts` — DB 테스트 인프라
- `src/db/schema.ts` — 모든 EP-05 테이블

## Dependencies
- T-05-004, T-05-005, T-05-006, T-05-007, T-05-008, T-05-009, T-05-010, T-05-011, T-05-012, T-05-013 (모든 EP-05 구현 태스크)

## Expected Outputs
- `tests/signals/pipeline-e2e.test.ts` — E2E 통합 테스트 파일

## Deliverables
- `tests/signals/pipeline-e2e.test.ts`

## Constraints
- 실제 PostgreSQL에서 실행 (test-db 헬퍼 사용, mock DB 금지)
- 테스트 시나리오:
  1. **LONG 시나리오**: 상승 bias → WATCHING(squeeze breakout) → Evidence(BB4 touch, ONE_B) → Safety(pass) → Vectorize → KNN(PASS) → Signal.knn_decision='PASS'
  2. **SHORT 시나리오**: 하락 bias → WATCHING(BB4 touch) → Evidence(DOUBLE_B) → Safety(pass) → KNN(PASS) + A-grade
  3. **차단 시나리오**: 거래차단 시간대 → isTradeBlocked=true → 진입 불가
  4. **Safety 실패 시나리오**: Evidence 통과 → Safety 실패 → Signal.safety_passed=false
  5. **KNN SKIP 시나리오**: 벡터 데이터 부족 → KNN SKIP → Signal.knn_decision='SKIP'
- 테스트 데이터: 캔들, 심볼, 벡터를 직접 DB에 INSERT
- 테스트 격리: 각 테스트 전후 cleanupTables()
- KNN 테스트를 위해 labeled 벡터 최소 50개 시드 필요

## Steps
1. 테스트 파일 구조 설계
2. 테스트 헬퍼 작성 (캔들 생성, 벡터 시드 데이터 생성)
3. LONG 시나리오 테스트 작성
4. SHORT 시나리오 + A-grade 테스트 작성
5. 차단 시나리오 테스트 작성
6. Safety 실패 시나리오 테스트 작성
7. KNN SKIP 시나리오 테스트 작성
8. typecheck + lint 통과

## Acceptance Criteria
- 5개 E2E 시나리오 모두 통과
- 실제 PostgreSQL에서 실행 (DB 미가용 시 skipIf)
- 파이프라인 각 단계의 DB 상태가 올바르게 전이
- Signal 레코드의 최종 상태(knn_decision, a_grade, safety_passed)가 시나리오와 일치
- 테스트 격리 정상 (이전 테스트 데이터가 다음 테스트에 영향 없음)

## Test Scenarios
- [E2E] LONG 전체 흐름: bias=LONG_ONLY → WATCHING → Evidence(ONE_B) → Safety(pass) → KNN(PASS) → Signal 완성
- [E2E] SHORT A-grade 흐름: bias=SHORT_ONLY → WATCHING → Evidence(DOUBLE_B) → Safety(pass) → KNN(PASS, winrate≥0.65) → a_grade=true
- [E2E] 거래차단: 아시아장 오픈 시간 → isTradeBlocked=true
- [E2E] Safety 실패: Evidence 통과 → 윅 비율 초과 → safety_passed=false
- [E2E] KNN SKIP: labeled 벡터 부족 → knn_decision='SKIP'

## Validation
```bash
bun test -- --grep "pipeline-e2e"
bun run typecheck
bun run lint
```

## Out of Scope
- 데몬 오케스트레이션 (EP-09)
- 포지션/주문 (EP-06)
- 성능 벤치마크 (별도 태스크)

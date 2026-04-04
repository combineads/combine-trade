# T-10-003 Evidence Gate 교정 — ONE_B MA20 방향 검증 + A급 신호 1H BB4 터치 연동

## Goal
`src/signals/evidence-gate.ts`에 두 가지 교정을 적용한다: (1) ONE_B 시그널에 해당 타임프레임 MA20 slope가 direction과 일치하는지 검증 (불일치 시 null 반환), (2) A급 신호(a_grade) 판정에 1H BB4 터치 조건을 추가한다.

## Why
PRD에서 ONE_B 시그널은 DOUBLE_B보다 확신도가 낮아 추가 검증이 필요하다. MA20 방향이 시그널 방향과 불일치하면 추세 반전 가능성이 높으므로 필터링해야 한다. 또한 A급 신호는 1H 타임프레임에서도 BB4 터치가 있어야 한다는 PRD 요구사항이 미구현 상태이다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M1 Evidence Gate 교정 요구사항
- `docs/PRODUCT.md` — ONE_B MA20 방향 검증, A급 신호 조건
- `src/signals/evidence-gate.ts` — 현재 구현 (EvidenceResult 타입, checkEvidence 함수)
- `src/indicators/` — calcMA20, calcBB4

## Dependencies
- T-10-001 (BB4 source=open — BB4 터치 감지에 영향)

## Expected Outputs
- `src/signals/evidence-gate.ts` — ONE_B MA20 방향 검증 추가 + a_grade 1H BB4 터치 조건 추가
- `tests/signals/evidence-gate.test.ts` — 교정된 로직 테스트 케이스

## Deliverables
- `src/signals/evidence-gate.ts`
- `tests/signals/evidence-gate.test.ts`

## Constraints
- ONE_B 시그널 시:
  - 해당 TF MA20 slope 방향과 signal direction이 일치해야 함
  - LONG + MA20 slope > 0 → 통과
  - LONG + MA20 slope <= 0 → null 반환
  - SHORT + MA20 slope < 0 → 통과
  - SHORT + MA20 slope >= 0 → null 반환
- DOUBLE_B 시그널은 MA20 검증 없이 기존대로 통과
- a_grade 판정 조건에 1H BB4 터치 추가:
  - 기존 a_grade 조건 + 1H 타임프레임에서 BB4 터치가 동시에 감지되어야 a_grade=true
  - 1H BB4 터치 없으면 a_grade=false
- 1H BB4 터치 데이터는 indicators에서 조회 (함수 시그니처 확장 필요할 수 있음)
- Decimal.js 정밀도 유지
- checkEvidence 함수의 반환 타입(EvidenceResult | null) 유지

## Steps
1. evidence-gate.ts에서 checkEvidence 함수 내 ONE_B 분기 확인
2. ONE_B 판정 후 MA20 slope 방향 검증 로직 추가
3. MA20 slope를 indicators 파라미터에서 참조하도록 인터페이스 조정
4. a_grade 판정 로직에 1H BB4 터치 조건 추가
5. 1H BB4 터치 데이터를 checkEvidence에 전달하는 방법 설계 (파라미터 추가 또는 indicators 확장)
6. 기존 DOUBLE_B 테스트가 변경 없이 통과하는지 확인
7. ONE_B + MA20 방향 일치/불일치 테스트 추가
8. a_grade + 1H BB4 터치 여부 테스트 추가
9. typecheck + lint 통과 확인

## Acceptance Criteria
- DOUBLE_B 시그널 → MA20 검증 없이 통과 (기존 동작 유지)
- ONE_B + MA20 slope가 direction과 일치 → EvidenceResult 반환
- ONE_B + MA20 slope가 direction과 불일치 → null 반환
- a_grade=true 조건: 기존 조건 + 1H BB4 터치
- a_grade=false: 1H BB4 터치 없음
- 기존 테스트 전부 통과 (DOUBLE_B 회귀 없음)

## Test Scenarios
- DOUBLE_B signal → MA20 검증 없이 통과 (회귀 테스트)
- ONE_B + LONG + MA20 slope > 0 → EvidenceResult 반환
- ONE_B + LONG + MA20 slope <= 0 → null 반환
- ONE_B + SHORT + MA20 slope < 0 → EvidenceResult 반환
- ONE_B + SHORT + MA20 slope >= 0 → null 반환
- a_grade 판정: 1H BB4 터치 있음 + 기존 조건 충족 → a_grade=true
- a_grade 판정: 1H BB4 터치 없음 → a_grade=false

## Validation
```bash
bun test -- --grep "evidence-gate"
bun run typecheck
bun run lint
```

## Out of Scope
- Safety Gate 수정 (T-10-004)
- KNN 결정 로직 변경 (M2 범위)
- BB4 source=open 변경 자체 (T-10-001에서 처리)
- 5M/1M 우선순위 로직 (데몬 오케스트레이션)

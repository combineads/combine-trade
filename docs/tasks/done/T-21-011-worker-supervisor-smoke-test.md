# T-21-011 worker supervisor smoke test

## Goal
`workers/__tests__/supervisor-smoke.test.ts`를 작성한다: 모든 워커를 수퍼바이저로 시작하고 3초 대기 후 모두 실행 중인지 확인하고 SIGTERM 후 clean exit를 검증한다.

## Why
모든 워커가 개별적으로 작동해도 수퍼바이저를 통한 통합 시작이 정상적으로 작동하는지 검증해야 한다. EP21의 최종 검증 태스크.

## Inputs
- T-21-001~T-21-010 출력물: 모든 워커 `index.ts` / `main.ts` 구현 완료
- `scripts/supervisor.ts` — 워커 수퍼바이저 (macro-collector 포함, T-21-010에서 추가)
- `packages/shared/event-bus/` — 테스트용 DB 연결

## Dependencies
T-21-001, T-21-002, T-21-003, T-21-004, T-21-005, T-21-006, T-21-007, T-21-008, T-21-009, T-21-010

## Expected Outputs
- `workers/__tests__/supervisor-smoke.test.ts` — 통과하는 smoke 테스트

## Deliverables
- `workers/__tests__/supervisor-smoke.test.ts`:
  - 수퍼바이저로 모든 워커 시작 (subprocess fork)
  - 3초 대기
  - 모든 워커 PID 유효 확인 (non-zero, 실행 중)
  - SIGTERM 전송
  - 5초 이내 모든 프로세스 종료 확인 (exit code 0)
  - 각 워커의 "started" 로그 출력 확인

## Constraints
- 실제 DB 연결 필요 (테스트 DB 환경)
- 각 워커는 `DATABASE_URL` 환경변수 필요
- `ANTHROPIC_API_KEY` 없어도 llm/retrospective 워커가 gracefully 시작 가능해야 함 (경고 후 대기)

## Steps
1. `scripts/supervisor.ts` 현재 구조 읽기
2. subprocess 시작 + PID 확인 테스트 헬퍼 구현
3. "started" 로그 확인 로직 작성
4. SIGTERM + exit 확인 로직 작성
5. `bun test workers/__tests__/supervisor-smoke.test.ts`

## Acceptance Criteria
- 모든 워커 3초 내 시작 완료
- 모든 PID non-zero (실행 중)
- 각 워커 "started" 로그 출력
- SIGTERM 후 5초 이내 모든 프로세스 종료 (exit 0)
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test workers/__tests__/supervisor-smoke.test.ts
```

## Out of Scope
개별 워커 비즈니스 로직 테스트 (각 워커 태스크에서 처리), 워커 health check HTTP endpoint

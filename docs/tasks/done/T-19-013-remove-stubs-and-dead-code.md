# T-19-013 remove-stubs-and-dead-code

## Goal
EP19 wiring 완료 후 교체된 stub 구현체, 사용하지 않는 코드, 불필요한 테이블/컬럼을 제거한다.

## Why
stub → 실제 구현으로 교체 후에도 stub 파일, stub helper, dead import가 남으면 코드베이스가 오염된다. 특히 타입 에러를 숨기거나 혼란을 줄 수 있다. EP18/EP19에서 임시로 만들어진 구조물을 깔끔히 제거해야 한다.

## Inputs
- T-19-012 완료 (모든 dep wiring + 통합 테스트 통과)
- `apps/api/src/index.ts` — stub import 잔재 확인
- `apps/api/src/` 전체 — stub 파일 탐색
- `db/schema/` — 미사용 테이블/컬럼 확인
- `bun run typecheck`, `bun run lint` 결과

## Dependencies
T-19-012

## Expected Outputs
- stub 파일 및 dead code 제거
- unused import 정리
- 사용하지 않는 DB 테이블이 있다면 migration으로 drop
- `bun run typecheck && bun run lint` 클린 통과

## Deliverables
- 삭제된 파일 목록 (커밋 메시지에 기록)
- 필요 시 `db/migrations/` drop 마이그레이션 파일

## Constraints
- **테이블 삭제는 신중하게**: production 데이터가 있을 가능성 있는 테이블은 drop 금지. EP18/EP19에서 새로 추가된 테이블 중 실제로 사용되지 않는 것만 drop.
- stub 파일인지 실제 사용 중인 파일인지 확인 후 삭제 — `grep -r "import.*from.*stub"` 등으로 참조 확인
- `bun run typecheck` 통과 후에만 파일 삭제 확정
- 삭제 전 git status 확인 — 미커밋 변경사항 없어야 함

## Steps
1. stub 파일 탐색:
   ```bash
   grep -r "stub\|Stub\|NOT_WIRED\|not wired" apps/api/src/ --include="*.ts" -l
   ```
2. `apps/api/src/index.ts`에서 제거된 stub import 잔재 확인
3. EP18에서 생성된 임시 파일 확인 (`*-stub.ts`, `*-mock.ts` 패턴)
4. unused import 정리 (`bun run lint`로 확인)
5. DB 스키마 감사: EP18/EP19에서 추가된 테이블 중 실제로 query되지 않는 것 확인
6. 사용하지 않는 테이블이 있으면 `bun run db:generate`로 drop migration 생성 후 적용
7. `bun run typecheck && bun run lint` 클린 확인
8. `bun test apps/api` 재확인

## Acceptance Criteria
- stub 파일/함수가 코드베이스에 남아있지 않음
- `bun run lint` — unused import 경고 없음
- `bun run typecheck` 통과
- `bun test apps/api` 통과
- `bun test tests/integration/auth-api-wiring.test.ts` 통과

## Validation
```bash
grep -r "stub\|Stub\|NOT_WIRED" apps/api/src/ --include="*.ts" | wc -l  # should be 0
bun run typecheck
bun run lint
bun test apps/api
bun test tests/integration/auth-api-wiring.test.ts
```

## Out of Scope
- `packages/` 전체 코드 감사 (harness-cleanup 범위)
- EP19 외 다른 에픽의 dead code
- 테스트 fixture 데이터 정리
- 주석 정리

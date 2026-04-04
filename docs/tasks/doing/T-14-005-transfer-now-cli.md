# T-14-005 수동 즉시 이체 CLI (scripts/transfer-now.ts)

## Goal
운영자가 CLI에서 즉시 이체를 실행할 수 있는 스크립트를 제공한다. `--dry-run` 옵션으로 실제 이체 없이 금액만 확인할 수 있다.

## Why
스케줄러 외에도 운영자가 필요할 때 즉시 이체를 트리거할 수 있어야 한다. dry-run은 이체 전 금액을 미리 확인하는 안전장치 역할을 한다.

## Inputs
- `docs/exec-plans/14-auto-transfer.md` M3 — 수동 즉시 이체 CLI 스펙
- T-14-002 — calculateTransferable()
- T-14-003 — executeTransfer()

## Dependencies
- T-14-002, T-14-003

## Expected Outputs
- `scripts/transfer-now.ts` CLI 스크립트
- `--dry-run` 플래그 지원

## Deliverables
- `scripts/transfer-now.ts`

## Constraints
- DB 초기화 후 CommonCode에서 설정 로드
- `--dry-run`: 잔고 계산만 출력, adapter.transfer() 호출 안 함
- 정상 실행: 이체 후 결과 출력
- 프로세스 종료 전 DB 연결 정리
- exchange는 CLI 인자 또는 기본값 `binance`

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `scripts/transfer-now.ts` 생성:
   - CLI 인자 파싱: `--dry-run`, `--exchange <name>` (기본 binance)
   - DB 초기화 + CommonCode 로드
   - ExchangeAdapter 인스턴스 생성
   - `--dry-run`:
     - fetchBalance() + fetchPositions() → calculateTransferable()
     - 결과 콘솔 출력 (walletBalance, openMargin, reserve, available, transferAmount, skip)
   - 정상 실행:
     - executeTransfer() 호출
     - 결과 콘솔 출력
   - DB 연결 정리 후 프로세스 종료
4. Run tests — confirm all pass (GREEN phase)
5. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- `bun scripts/transfer-now.ts --dry-run` 실행 시 이체 금액 계산 결과 출력, 실제 이체 없음
- `bun scripts/transfer-now.ts` 실행 시 실제 이체 수행 + 결과 출력
- `--exchange okx` 옵션 지원
- 프로세스 종료 코드: 성공=0, 실패=1

## Test Scenarios
- parseArgs(["--dry-run"]) → returns { dryRun: true, exchange: "binance" }
- parseArgs(["--exchange", "okx"]) → returns { dryRun: false, exchange: "okx" }
- parseArgs(["--dry-run", "--exchange", "bitget"]) → returns { dryRun: true, exchange: "bitget" }
- parseArgs([]) → returns { dryRun: false, exchange: "binance" } (defaults)
- dry-run mode → calls calculateTransferable() but NOT executeTransfer()

## Validation
```bash
bun test -- --grep "transfer-now"
bun run typecheck
bun scripts/transfer-now.ts --dry-run
```

## Out of Scope
- 웹 UI 수동 이체 버튼 (T-14-008)
- API 엔드포인트 (T-14-007)

## Implementation Notes

### Files created
- `scripts/transfer-now.ts` — CLI entry-point with `parseArgs()` and `main()`
- `tests/transfer/transfer-now.test.ts` — 9 tests covering parseArgs() and dry-run/normal mode branching

### Design decisions
- `parseArgs()` exported for testability; `main()` guarded by `import.meta.url` check (consistent with kill-switch.ts pattern)
- Dynamic imports used inside `main()` for DB/config/exchange modules to keep the module importable in tests without triggering DB initialisation
- `risk_pct` sourced from first SYMBOL_CONFIG entry with fallback to `"0.03"`; TRANSFER group provides transfer_pct, min_transfer_usdt, reserve_multiplier
- Consolidated two `@/config/loader` dynamic imports into one (cleanup pass)
- Type issue `args[i + 1]` narrowed via `as string` after the truthy guard check

### Validation results
- `bun test -- --grep "transfer-now"`: 9 pass, 0 fail
- `bun run typecheck`: no errors

# T-03-009 exchanges/mexc.ts — MEXC 어댑터 스캐폴드 + 2-step SL 설계

## Goal
MexcAdapter 스캐폴드를 생성하고, MEXC의 2-step SL 플로우(editOrder 미지원 시 cancel+create)를 설계 문서화한다.

## Why
MEXC는 editOrder를 지원하지 않을 수 있어, SL 이동(본절 이동) 시 기존 SL 취소 → 새 SL 생성의 2-step 플로우가 필요하다. 이 타이밍 리스크를 Phase 3 구현 전에 설계해두면 안전하다.

## Inputs
- `src/exchanges/base.ts` (T-03-001) — BaseExchangeAdapter, ExchangeNotImplementedError
- `src/core/ports.ts` — ExchangeAdapter 인터페이스
- CCXT MEXC API 특이사항 (레이트리밋: 20 req/s, editOrder 미지원 가능성)
- `docs/PRODUCT.md` — "MEXC may need 2-step order flow"

## Dependencies
T-03-001

## Expected Outputs
- `src/exchanges/mexc.ts` — MexcAdapter 클래스 (모든 메서드 NotImplemented)
- `docs/decisions/ADR-005-mexc-two-step-sl.md` — 2-step SL 설계 문서
- Phase 3에서 실제 구현 시 ADR-005 참조

## Deliverables
- `src/exchanges/mexc.ts`
- `docs/decisions/ADR-005-mexc-two-step-sl.md`

## Constraints
- BaseExchangeAdapter 상속
- exchangeType = 'mexc'
- 모든 메서드: `throw new ExchangeNotImplementedError('mexc', methodName)`
- ADR-005: 2-step SL 플로우, 타이밍 리스크, 대안(atomic replacement가 가능한지), 추천 방안 포함

## Steps
1. MexcAdapter 클래스 생성 (extends BaseExchangeAdapter)
2. exchangeType = 'mexc' 설정
3. 모든 ExchangeAdapter 메서드 오버라이드 → ExchangeNotImplementedError
4. MEXC 특이사항 주석: 레이트리밋 20req/s, editOrder 미지원, 2-step SL
5. ADR-005 작성:
   - 문제: MEXC editOrder 미지원 → SL 이동 시 cancel+create 필요
   - 타이밍 리스크: cancel 후 create 전 SL 미보호 구간
   - 대안 1: cancel+create 순차 (간단, 리스크 있음)
   - 대안 2: 새 SL 먼저 생성 → 구 SL 취소 (SL 중복 구간, 더 안전)
   - 대안 3: MEXC에서 editOrder 지원 확인 후 결정
   - 추천: 대안 2 (새 SL 먼저) + 확인 후 최종 결정
6. 테스트 작성
7. typecheck 통과 확인

## Acceptance Criteria
- MexcAdapter가 ExchangeAdapter 인터페이스 구현 (bun run typecheck 통과)
- 모든 메서드 호출 시 ExchangeNotImplementedError throw
- ADR-005가 2-step SL 플로우의 3가지 대안 + 추천안 포함
- ADR-005가 타이밍 리스크와 미티게이션 명시

## Test Scenarios
- MexcAdapter 생성 → CCXT mexc 인스턴스 생성 확인
- fetchBalance() → ExchangeNotImplementedError('mexc', 'fetchBalance')
- createOrder() → ExchangeNotImplementedError('mexc', 'createOrder')
- editOrder() → ExchangeNotImplementedError('mexc', 'editOrder') (특히 이 메서드의 미지원이 핵심)
- N/A — ADR-005는 문서이므로 테스트 불필요

## Validation
```bash
bun run typecheck
bun test --grep "mexc"
test -f docs/decisions/ADR-005-mexc-two-step-sl.md && echo "ADR-005 exists"
```

## Out of Scope
- MEXC 메서드 실제 구현 (Phase 3)
- MEXC testnet 통합 테스트
- 2-step SL 코드 구현 (Phase 3에서 ADR-005 기반으로 구현)

## Implementation Notes
- CCXT mexc does not support a sandbox URL; sandbox mode throws NotSupported.
  The sandbox test was updated to verify this expected behavior.
- Rate limit set to 20 req/s (bucketCapacity=20, refillRatePerMs=0.02) matching Bitget.
- editOrder stub includes a Phase 3 comment documenting the 2-step SL rollback contract.
- ADR-005 recommends Option 2 (Create-then-Cancel) as the baseline, with Option 3
  (runtime editOrder support check) as the Phase 3 enhancement path.

## Status
Done — 2026-04-04

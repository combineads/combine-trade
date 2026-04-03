# ADR-005: MEXC Two-Step SL Flow

## Status

Accepted (design only — implementation deferred to Phase 3)

## Context

MEXC Futures may not support `editOrder` for modifying stop-loss orders. When SL
needs to be moved (e.g., breakeven move after TP1 hit), a two-step flow is
required: cancel existing SL → create new SL.

## Problem

Between canceling the old SL and creating the new SL, the position is unprotected.
This timing gap is a critical risk.

## Options

### Option 1: Cancel then Create (Sequential)

- Cancel old SL order
- Create new SL order
- **Risk**: Position unprotected during gap (could be milliseconds to seconds
  depending on network latency and MEXC API response time)
- **Mitigation**: Minimize gap by keeping operations sequential and immediate
- **Verdict**: Simplest implementation but carries the highest risk of an
  unprotected position if network or API delays occur

### Option 2: Create then Cancel (Safer)

- Create new SL order first (temporarily 2 SL orders exist)
- Cancel old SL order
- **Risk**: Briefly having 2 SL orders — one might trigger unexpectedly if price
  moves to the SL level during the window
- **Mitigation**: Use `reduceOnly` on both orders; if both trigger simultaneously,
  the second fill attempt on a fully-closed position will be rejected by the
  exchange
- **Verdict**: Safer because having 2 SL orders is recoverable (exchange rejects
  the redundant fill), whereas having 0 SL orders is not recoverable if price gaps

### Option 3: Verify editOrder support first (Runtime check)

- At adapter initialization (or on first editOrder call), probe whether MEXC
  actually supports `editOrder` by inspecting `ccxt.has['editOrder']`
- If supported: use `editOrder` directly (same code path as Binance adapter)
- If not supported: fall back to Option 2 (Create then Cancel)
- **Risk**: MEXC may change API behavior between versions or silently return success
  without modifying the order
- **Mitigation**: Verify the modified order via `fetchOrder` after the call; if the
  price/size did not change, assume editOrder is not functional and fall back to
  Option 2
- **Verdict**: Best long-term solution — avoids the two-step overhead when MEXC
  eventually adds native support, while remaining safe today

## Decision

Recommend **Option 2** (Create then Cancel) as the baseline implementation, with
**Option 3** (runtime check) as an enhancement in the same Phase 3 task.

Rationale: Having 2 SL orders briefly is safer than having 0 SL orders. With
`reduceOnly`, the worst case is one extra fill attempt that gets rejected by the
exchange. This is an acceptable transient state. By contrast, 0 SL orders during a
gap exposes the position to unlimited downside if the market moves sharply.

## Consequences

- `MexcAdapter.editOrder()` must implement the 2-step flow internally:
  1. `createOrder` — new SL with `reduceOnly: true`
  2. `cancelOrder` — old SL
  3. If step 2 fails: `cancelOrder` the new SL and rethrow the original error
- Phase 3 implementation task must reference this ADR
- Need an integration test verifying gap handling (both cancel failure rollback and
  the dual-SL window)
- Monitor MEXC API changelog for `editOrder` support to simplify the flow later

## Implementation Notes

- Check `(this.ccxt as unknown as { has: Record<string, boolean> }).has['editOrder']`
  at runtime to select the code path (Option 3 check)
- Both SL orders must use `reduceOnly: true` to prevent accidental position
  increase if both fill
- Log a warning when falling back to the 2-step flow so operators can detect if
  MEXC silently broke `editOrder` support
- The 2-step flow adds ~2 API calls per SL modification; factor this into rate
  limit budget (20 req/s for MEXC)

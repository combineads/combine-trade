# T-07-007 Backpressure Queue

## Goal
Implement a `BoundedQueue` in `packages/shared/queue/` with configurable overflow policy (drop-oldest, drop-newest, block) and a warning when the queue reaches 80% capacity.

## Why
Pipeline workers can receive bursts of candle events faster than they can process them. Without a bounded queue, memory grows unboundedly and the process OOMs. Backpressure policies let us choose between dropping stale data (drop-oldest) or rejecting new data (drop-newest).

## Inputs
- `packages/shared/` structure
- Worker pipeline patterns in `packages/shared/pipeline/`

## Dependencies
None

## Expected Outputs
- `packages/shared/queue/bounded-queue.ts`
- `packages/shared/queue/index.ts`
- `packages/shared/queue/__tests__/bounded-queue.test.ts`

## Deliverables
- `BoundedQueue<T>` class:
  - `enqueue(item)`: respects overflow policy
  - `dequeue()`: returns next item or undefined if empty
  - `size` property
  - `isEmpty` property
  - `isFull` property
  - `onWarning` callback when >= 80% full
- Overflow policies: `"drop-oldest"`, `"drop-newest"`, `"block"` (block = async wait for space)

## Constraints
- No external dependencies
- Pure in-memory
- `packages/shared` only — no core/app imports

## Steps
1. Write failing tests
2. Implement BoundedQueue
3. Export from index.ts
4. Run `bun test` + `bun run typecheck`

## Acceptance Criteria
- drop-oldest discards the front item and inserts new one when full
- drop-newest silently discards new item when full
- block async-waits until space is available
- Warning callback fires when queue >= 80% full
- All tests pass

## Validation
```bash
bun test packages/shared/queue/__tests__/
bun run typecheck
```

## Implementation Notes
<!-- filled by implementer -->

## Outputs
<!-- filled by implementer -->

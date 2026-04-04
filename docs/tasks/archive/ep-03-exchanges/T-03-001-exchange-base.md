# T-03-001 exchanges/base.ts — CCXT 공통 래퍼

## Goal
CCXT 인스턴스를 감싸는 BaseExchangeAdapter 추상 클래스를 구현한다. 인증, 레이트리밋(토큰 버킷), 에러 매핑, Decimal 변환, 지수 백오프 재시도를 공통으로 제공한다.

## Why
4개 거래소 어댑터가 동일한 인증 흐름, 레이트리밋, 에러 처리, Decimal 변환을 공유해야 한다. 공통 기반 없이 각 어댑터가 이를 반복 구현하면 불일치와 버그의 원인이 된다.

## Inputs
- `src/core/ports.ts` — ExchangeAdapter, ExchangeConfig 타입
- `src/core/types.ts` — Exchange, Candle, OrderStatus 등 도메인 타입
- `src/core/decimal.ts` — d() 팩토리, Decimal 타입
- `docs/ARCHITECTURE.md` — 에러 처리 전략, 레이트리밋 전략

## Dependencies
EP-01 완료 (T-01-005 core/ports.ts)

## Expected Outputs
- `src/exchanges/base.ts` — BaseExchangeAdapter 추상 클래스
- `src/exchanges/errors.ts` — 도메인 에러 타입
- `src/core/ports.ts` 확장 — setLeverage() 메서드 추가
- 모든 후속 어댑터(T-03-002~T-03-009)가 이 base를 상속

## Deliverables
- `src/exchanges/base.ts`
- `src/exchanges/errors.ts`
- `src/core/ports.ts` (setLeverage 추가)

## Constraints
- L2 모듈: core/ 만 import 가능
- CCXT는 외부 의존성 (npm: ccxt)
- 레이트리밋: 토큰 버킷 패턴 (ARCHITECTURE.md)
- 지수 백오프: 1s→2s→4s, max 30s (ARCHITECTURE.md 에러 처리 전략)
- 재시도: 최대 3회 (order 실패 시)
- CCXT 응답의 number → Decimal 변환은 base에서 제공

## Steps
1. `src/exchanges/errors.ts` 생성:
   - `ExchangeError` (base), `ExchangeRateLimitError`, `ExchangeNetworkError`, `ExchangeAuthError`, `ExchangeOrderNotFoundError`, `ExchangeInsufficientFundsError`, `ExchangeNotImplementedError`
   - 각 에러에 exchange, originalError 필드
2. `src/core/ports.ts` 에 `setLeverage(leverage: number, symbol: string): Promise<void>` 추가
3. `src/exchanges/base.ts` 생성:
   - `BaseExchangeAdapter` 추상 클래스
   - 생성자: CCXT 인스턴스 생성 (exchange type + ExchangeConfig)
   - `protected ccxt: ccxt.Exchange` 필드
   - `toDecimal(value: number): Decimal` — number → Decimal 변환 헬퍼
   - `toDecimalOrNull(value: number | undefined | null): Decimal | null`
   - `mapError(error: unknown): ExchangeError` — CCXT 에러 → 도메인 에러 매핑
   - `withRetry<T>(fn: () => Promise<T>, maxRetries?: number): Promise<T>` — 지수 백오프 재시도
   - `protected abstract exchangeType: string` — CCXT 거래소 식별자
4. 토큰 버킷 레이트리밋 구현 (CCXT 내장 + 추가 가드)
5. 테스트 작성 (mock CCXT)
6. typecheck, lint 통과 확인

## Acceptance Criteria
- BaseExchangeAdapter가 ExchangeAdapter 인터페이스의 추상 구현 제공
- CCXT 에러 → 도메인 에러 매핑 (RateLimitExceeded, NetworkError, AuthenticationError, OrderNotFound, InsufficientFunds)
- toDecimal()이 CCXT number를 Decimal로 정확히 변환
- withRetry()가 3회 실패 후 에러 throw
- 지수 백오프: 1s→2s→4s 대기 (max 30s)
- ExchangeAdapter 인터페이스에 setLeverage() 추가됨
- `bun run typecheck` 통과

## Test Scenarios
- toDecimal(85432.5) → Decimal('85432.5')와 동일
- toDecimalOrNull(null) → null 반환
- toDecimalOrNull(0) → Decimal('0') (falsy value지만 유효)
- mapError(CCXT RateLimitExceeded) → ExchangeRateLimitError
- mapError(CCXT NetworkError) → ExchangeNetworkError
- mapError(CCXT AuthenticationError) → ExchangeAuthError
- mapError(unknown Error) → ExchangeError (fallback)
- withRetry: 1회 실패 + 2회 성공 → 결과 반환, 1회 대기
- withRetry: 3회 연속 실패 → 마지막 에러 throw
- withRetry: 백오프 간격이 1s, 2s, 4s로 증가 (타이머 mock)
- 토큰 버킷: 한도 내 요청 → 즉시 통과
- 토큰 버킷: 한도 초과 → 대기 후 통과

## Validation
```bash
bun run typecheck
bun test --grep "base|errors|exchange"
```

## Out of Scope
- 구체적 거래소 어댑터 구현 (T-03-002~T-03-009)
- WebSocket 관리 (T-03-005)
- 비즈니스 레벨 주문 로직 (EP-06 orders 모듈)

## Implementation Notes

**Completed:** 2026-04-04

### Files created/modified
- `src/exchanges/errors.ts` — 7 typed domain error classes (ExchangeError, ExchangeRateLimitError, ExchangeNetworkError, ExchangeAuthError, ExchangeOrderNotFoundError, ExchangeInsufficientFundsError, ExchangeNotImplementedError)
- `src/exchanges/base.ts` — BaseExchangeAdapter abstract class with TokenBucket, backoff helper, mapError, withRetry, toDecimal, toDecimalOrNull, and all ExchangeAdapter abstract method stubs
- `src/exchanges/index.ts` — updated to re-export BaseExchangeAdapter and all error classes
- `src/core/ports.ts` — added `setLeverage(leverage: number, symbol: string): Promise<void>` to ExchangeAdapter type
- `tests/exchanges/errors.test.ts` — 16 tests covering all error class construction and inheritance
- `tests/exchanges/base.test.ts` — 23 tests covering toDecimal, toDecimalOrNull, mapError (all CCXT error types), withRetry (success, retry, exhaustion, backoff timing, cap), token bucket, construction

### Design decisions
- `TokenBucket` class is file-private (not exported) — rate limiting is an implementation detail of the base class
- Used `unknown as Record<string, typeof ccxt.Exchange | undefined>` cast for the CCXT exchange class lookup to avoid `any` while still satisfying TypeScript
- `toDecimal` uses `.toString()` before constructing Decimal to avoid floating-point representation issues
- `withRetry` maps errors through `mapError` before storing as `lastError`, so the thrown error is always a domain ExchangeError
- `exchangeName: Exchange` (typed) rather than `exchangeType: string` — provides the domain-typed name used in error messages; subclasses pass the CCXT exchange ID string to the constructor separately

### Validation results
- `bun run typecheck`: pass
- `bun run lint`: pass (0 errors)
- `bun test`: 565 pass, 0 fail (39 new tests in exchanges/)

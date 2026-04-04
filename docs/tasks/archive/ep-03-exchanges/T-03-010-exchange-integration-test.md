# T-03-010 거래소 어댑터 통합 테스트 + exports

## Goal
BinanceAdapter의 end-to-end 플로우를 mock CCXT로 검증하는 통합 테스트를 작성하고, exchanges 모듈의 공개 API(index.ts)를 정리한다.

## Why
개별 메서드 단위 테스트는 각 태스크에서 작성되지만, 메서드 간 연계 플로우(레버리지 설정→주문 생성→SL 등록→주문 조회→취소)가 정상 동작하는지 통합적으로 검증해야 한다. QUALITY.md: "Integration tests for ExchangeAdapter implementations (mock exchange responses)."

## Inputs
- `src/exchanges/binance.ts` (T-03-002~T-03-006) — 완성된 BinanceAdapter
- `src/exchanges/okx.ts`, `bitget.ts`, `mexc.ts` (T-03-007~T-03-009) — 스캐폴드
- `src/exchanges/base.ts` (T-03-001) — BaseExchangeAdapter
- `src/core/ports.ts` — ExchangeAdapterFactory 타입
- `docs/QUALITY.md` — 통합 테스트 기대사항

## Dependencies
T-03-003, T-03-004, T-03-006

## Expected Outputs
- `tests/exchanges/binance.integration.test.ts` — 통합 테스트
- `src/exchanges/index.ts` — 모듈 공개 API (어댑터 팩토리, 타입 re-export)
- EP-04~EP-09에서 `import { createExchangeAdapter } from '@/exchanges'` 사용

## Deliverables
- `tests/exchanges/binance.integration.test.ts`
- `src/exchanges/index.ts`

## Constraints
- mock CCXT 사용 (실제 네트워크 호출 없음)
- 테스트넷 통합 테스트는 수동 (이 태스크에서는 mock만)
- ExchangeAdapterFactory 구현: exchange 문자열 → 해당 어댑터 인스턴스 생성
- index.ts에서 re-export: 팩토리 함수, 에러 타입, 어댑터 타입

## Steps
1. `src/exchanges/index.ts` 작성:
   - `createExchangeAdapter(exchange, config)` 팩토리 함수
   - 에러 타입 re-export
   - 어댑터 클래스 re-export (필요 시)
2. mock CCXT 헬퍼 작성:
   - Binance REST 응답 fixture (balance, positions, orders, OHLCV, markets)
   - CCXT 에러 시뮬레이션
3. 통합 테스트 시나리오 작성
4. 전체 검증 실행 (typecheck + lint + test + build)

## Acceptance Criteria
- createExchangeAdapter('binance', config) → BinanceAdapter 인스턴스
- createExchangeAdapter('okx', config) → OkxAdapter 인스턴스
- 미지원 거래소 → 에러
- 통합 테스트: 전체 주문 플로우 성공
- 통합 테스트: 에러 시나리오 (네트워크, 잔고 부족)
- `bun run typecheck && bun run lint && bun test && bun run build` 모두 통과

## Test Scenarios
- 전체 플로우: setLeverage → createOrder(market) → fetchOrder → SL 확인 → cancelOrder
- SL 포함 플로우: createOrder(stop_market, reduceOnly) → fetchOrder로 SL 존재 확인
- 에러 플로우: createOrder → CCXT InsufficientFunds → ExchangeInsufficientFundsError
- 에러 플로우: fetchBalance → CCXT NetworkError → 3회 재시도 → ExchangeNetworkError
- 팩토리: createExchangeAdapter('binance') → BinanceAdapter instanceof 확인
- 팩토리: createExchangeAdapter('okx') → OkxAdapter instanceof 확인
- 팩토리: createExchangeAdapter('unknown') → 에러 throw

## Validation
```bash
bun run typecheck
bun run lint
bun test --grep "exchange"
bun run build
```

## Out of Scope
- Binance testnet 실제 통합 테스트 (수동, CI 외)
- 다른 거래소 어댑터 실제 구현 테스트
- 비즈니스 로직 통합 테스트 (EP-06 이후)

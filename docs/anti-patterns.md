# Anti-Patterns

Patterns tried and failed, or guardrails discovered during implementation. Check here before attempting similar approaches.

## Exchange Adapter Patterns

### CCXT 에러를 각 메서드에서 개별 catch하지 말 것
- Discovered: 2026-04-04, EP-03
- Problem: 각 어댑터 메서드에서 try/catch로 CCXT 에러를 잡으면 에러 매핑 로직이 중복되고 불일치 발생
- Instead: `BaseExchangeAdapter.mapError()`에서 한 번만 매핑. `withRetry()` 내부에서 자동 처리

### CCXT number 응답을 직접 Decimal 계산에 사용하지 말 것
- Discovered: 2026-04-04, EP-03
- Problem: CCXT는 number를 반환. number를 직접 Decimal 연산에 넣으면 부동소수점 정밀도 문제 발생
- Instead: `BaseExchangeAdapter.toDecimal()`로 문자열 경유 변환 (value.toString() → d())

### createOrder에서 idempotency_key 누락하지 말 것
- Discovered: 2026-04-04, T-03-003
- Problem: 네트워크 재시도 시 중복 주문 생성 위험
- Instead: UUID v7 기반 clientOrderId를 생성하여 CCXT params에 전달. 재시도 시 동일 key 사용

## Indicator Patterns

### 지표 내부 계산을 Decimal.js로 하지 말 것
- Discovered: 2026-04-03, EP-02
- Problem: @ixjb94/indicators는 number[] 기반. Decimal으로 변환하면 성능 100배 저하
- Instead: Float64로 내부 계산 → 결과만 Decimal 변환. 지표 계산은 "통계 연산"이므로 Float64 정밀도 충분

## Database Patterns

### DB 연동 로직을 mock 테스트로 검증하지 말 것
- Discovered: 2026-04-04, EP-04 (T-04-000)
- Problem: ON CONFLICT DO UPDATE WHERE, FK 제약, SQL 기반 갭 감지 등 PostgreSQL 고유 동작은 mock으로 검증 불가. mock 테스트가 통과해도 실제 DB에서 실패하는 경우 발생
- Instead: Docker PostgreSQL + test-db 헬퍼로 실제 DB 통합 테스트. `describe.skipIf(!isTestDbAvailable())` 패턴으로 DB 미연결 시 skip

### 타임프레임 duration 같은 도메인 상수를 여러 파일에 인라인하지 말 것
- Discovered: 2026-04-04, EP-04
- Problem: 동일한 상수 매핑이 여러 파일에 중복 정의되면 불일치 위험 (예: collector.ts TIMEFRAME_DURATION_MS vs gap-detection.ts getTimeframeDurationMs)
- Instead: 단일 소스에서 정의하고 임포트. 변경 시 한 곳만 수정

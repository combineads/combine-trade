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

## Signal Pipeline Patterns

### Filter polarity trap: "PASS=차단" 의미 혼동 주의
- Discovered: 2026-04-05, EP-18 (T-18-001, T-18-002)
- Problem: PRD에서 "→ PASS"는 "진입 거부"를 의미하지만, 코드에서 "pass"는 "통과(허용)"로 읽힘. Safety Gate의 wick_ratio와 box range 필터가 gt/lt 반전 + 조건 극성 반전 상태로 EP-05부터 EP-15까지 생존. 테스트가 기존 코드 동작에 맞춰 작성되어 발견하지 못함
- Instead: PRD 게이트 규칙 구현 시, PRD 문장을 테스트 시나리오로 먼저 번역 (RED phase). 기존 코드를 읽기 전에 PRD 기준 테스트를 작성할 것. JSDoc에 "returns non-null (failure) when..." 명시

### 구현된 함수의 호출처 0건 = wiring 버그
- Discovered: 2026-04-05, EP-18 (T-18-005, T-18-006, T-18-007)
- Problem: `resetAllExpired()`, `finalizeLabel()`, `checkAccountDailyLimit()` 모두 구현+단위테스트 완료 상태였지만 daemon/pipeline에서 호출하는 곳이 0건. 기능이 존재하지만 연결되지 않아 사실상 dead code
- Instead: 함수 구현 후 즉시 `grep -r "functionName" src/ --include="*.ts" | grep -v test | grep -v ".d.ts"` 실행. 외부 호출처 0건이면 wiring 버그로 간주

### 타임프레임 duration 같은 도메인 상수를 여러 파일에 인라인하지 말 것
- Discovered: 2026-04-04, EP-04
- Problem: 동일한 상수 매핑이 여러 파일에 중복 정의되면 불일치 위험 (예: collector.ts TIMEFRAME_DURATION_MS vs gap-detection.ts getTimeframeDurationMs)
- Instead: 단일 소스에서 정의하고 임포트. 변경 시 한 곳만 수정

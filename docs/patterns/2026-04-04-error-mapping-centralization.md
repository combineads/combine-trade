# Pattern: Error mapping centralization

- **Observed in**: T-03-001, T-03-002, T-03-003, T-03-004
- **Category**: efficiency
- **Description**: 외부 라이브러리(CCXT) 에러를 각 메서드에서 개별 catch 하지 않고, base 클래스의 `mapError()`에서 한 번만 도메인 에러로 매핑. `withRetry()`가 에러 매핑 후 재시도 판단.
- **Root cause**: 외부 라이브러리가 거래소/상황별로 다른 에러를 던지는데, 메서드마다 try-catch를 넣으면 중복 코드 폭발.
- **Recommendation**: 다른 외부 API 어댑터(경제 캘린더, 알림 채널 등) 구현 시 동일 패턴 적용. 도메인 에러 타입을 먼저 정의하고, 매핑 함수를 어댑터 base에 집중.

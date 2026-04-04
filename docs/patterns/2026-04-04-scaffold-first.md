# Pattern: Scaffold-first for multi-implementation interfaces

- **Observed in**: T-03-007, T-03-008, T-03-009
- **Category**: efficiency
- **Description**: 인터페이스의 여러 구현체 중 1개만 실제 구현하고, 나머지는 `NotImplementedError` stub으로 즉시 정의. 컴파일 타입 안전을 확보하면서 구현 범위를 Phase별로 제한.
- **Root cause**: 모든 구현체를 한 에픽에서 완성하면 범위 폭발. Stub은 인터페이스 준수를 보장하면서 점진적 구현을 허용.
- **Recommendation**: 멀티 어댑터 패턴(거래소, 알림 채널, 데이터 소스 등)에서 Phase 1 구현체 + 나머지 scaffold 접근법을 표준으로 사용.

# Pattern: DI 콜백으로 레이어 규칙 우회

- **Observed in**: T-07-004 (positions/pyramid.ts)
- **Category**: efficiency
- **Description**: pyramid(L5)가 executor(L6)의 executeEntry를 호출해야 하지만, 레이어 규칙(N은 0..N-1만 import)에 의해 L5→L6 import 불가. 해결: 호출자(daemon L9)가 executeEntry 함수를 콜백으로 주입하여 pyramid가 직접 import 없이 실행.
- **Root cause**: 하위 레이어 모듈이 상위 레이어의 실행 기능을 필요로 하는 경우. 데이터 의존성(L1 schema 경유)과 달리 실행 의존성은 콜백 주입으로만 해결 가능.
- **Recommendation**: backtest(L8)에서 동일 파이프라인 호출 시에도 적용 가능. 테스트에서는 mock 콜백으로 교체하여 격리 테스트 용이.

# Pattern: 순수 함수 + DB 사이드이펙트 분리

- **Observed in**: T-05-004 (determineDailyBias/updateDailyBias), T-05-007 (checkEvidence/createSignal), T-05-008 (checkSafety/updateSignalSafety), T-05-013 (makeDecision/updateSignalKnnDecision)
- **Category**: efficiency
- **Description**: 모든 비즈니스 로직 모듈에서 순수 판정 함수와 DB 저장 함수를 분리하는 패턴이 반복됨. 순수 함수는 단위 테스트로 빠르게 검증, DB 함수는 통합 테스트로 별도 검증. 이 분리 덕분에 테스트 작성이 용이하고, 백테스트에서 DB 없이 파이프라인을 실행할 수 있음.
- **Root cause**: Double-BB 전략의 파이프라인 특성상 "판단"과 "기록"이 분리 가능. 판단은 수학적 계산이고 기록은 사이드이펙트.
- **Recommendation**: EP-06(포지션 관리)에서도 동일 패턴 적용. PositionSizer.calculate()(순수) + createTicket()(DB) 분리. 백테스트 재사용을 위해 순수 함수는 DB import 금지.

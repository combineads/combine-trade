# Pattern: Same-Layer Import 회피 — L1 스키마 직접 접근

- **Observed in**: T-06-007 (limits/loss-limit.ts), T-06-008 (limits/loss-limit.ts reset)
- **Category**: efficiency
- **Description**: limits(L5)가 positions(L5)의 SymbolState 데이터를 필요로 하지만, 레이어 규칙(N은 0..N-1만 import)에 의해 같은 L5 모듈을 import할 수 없음. 해결: db/schema.ts(L1)의 symbolStateTable을 직접 접근하여 losses_* 필드를 읽고 쓴다.
- **Root cause**: Pipeline Module Monolith에서 같은 레이어의 모듈이 데이터를 공유해야 하는 상황이 발생. 데이터는 DB 테이블에 있으므로 L1(db) 경유로 우회 가능.
- **Recommendation**: EP-07에서도 동일 패턴 적용 예상. exits(L6)가 positions(L5) 데이터를 필요로 할 때는 정상(L6→L5 허용). 하지만 labeling(L6)이 같은 L6인 exits 데이터를 필요로 하면 이 패턴 적용.

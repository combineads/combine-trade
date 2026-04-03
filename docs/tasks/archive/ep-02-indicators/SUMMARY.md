# EP-02 Indicators — Archive Summary

- **Completed:** 2026-04-03
- **Tasks:** 8 (T-02-001 ~ T-02-008)
- **Key decisions:**
  - @ixjb94/indicators (Float64) 내부 계산 → 결과만 Decimal 변환
  - BB20/BB4 공통 calcBB() 함수, 파라미터 바인딩 편의 함수
  - 스퀴즈 감지: bandwidth 수축/확장 기반 상태 판별
- **Patterns discovered:**
  - Float64 내부 계산 → Decimal 출력 패턴 (지표 계산은 통계 연산)
  - candlesToCloses() 변환 헬퍼 패턴
  - 캔들 부족 시 null 반환 (에러 대신)
- **Outputs produced:**
  - `src/indicators/` — bollinger, ma, rsi, atr, squeeze, types, index
  - 성능 벤치마크: 120캔들 전체 지표 < 1ms

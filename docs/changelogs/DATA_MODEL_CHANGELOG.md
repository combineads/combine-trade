# MRT Change Log

### v1 Initial (2026-04-03)
- 20개 엔티티, 27개 관계 (과잉 설계)

### v2 CommonCode 통합 (2026-04-03)
- Exchange/Timeframe 테이블 제거 → CommonCode 흡수
- 19개 엔티티, 20개 관계

### v3 구조 단순화 (2026-04-03)
- **Symbol 복합 PK**: (symbol, exchange) — 멀티 거래소 기본 전제
- **EconomicEvent 제거** → TradeBlock.reason + source_data로 흡수
- **TradeBlock 고정 패턴**: is_recurring + recurrence_rule로 반복/일회성 통합 관리
- **DailyBiasLog, WatchingState 제거** → EventLog로 통합
- **Label 제거** → Ticket에 result/pnl/MFE/MAE 컬럼 흡수
- **TrainingExample 제거** → Vector에 label/grade/signal_id 복귀
- **BacktestRun + WfoRun 통합** → Backtest 1개 테이블 (run_type + parent_id)
- **ReconciliationLog, CrashRecoveryLog, SlippageEvent 제거** → EventLog로 통합
- **Signal 관측값 분리** → SignalDetail key-value 테이블
- 총 **12개 엔티티** (19→12), **10개 관계** (20→10)
- 변경 근거: 코드값 수준의 데이터를 엔티티로 만들어 복잡도만 증가시킨 구조를 정리. 이력/운영 로그는 범용 EventLog로 통합.

### v4 WatchSession 추가 + PRD 멀티거래소 반영 (2026-04-03)
- **WatchSession 추가** (WatchingState → WatchSession 명칭 변경 및 복귀): 1H 마감 시 시작 → 진입 기회 탐색 → 전제 붕괴 시 종료. "State"가 아닌 "Session"으로 생명주기 표현
- **Signal.watch_session_id FK 추가**: 감시 세션이 항상 시그널에 선행
- **PRD 수정**: "캔들은 primary_exchange에서만 수집" → "거래소별 캔들 수집". 같은 심볼이라도 거래소마다 가격이 다르므로 해당 거래소 캔들로 SL/TP 계산해야 정확
- 총 **13개 엔티티** (12→13), **13개 관계** (10→13)

### v4.1 시나리오 검증 피드백 (2026-04-03)
- **Backtest → Symbol FK 추가**: Backtest.(symbol, exchange) → Symbol 참조 무결성 보장. 관계 #12 추가
- **Order.exchange 정합성 주석**: Ticket이 있는 Order는 코드에서 `Order.exchange === Ticket.exchange` 검증 필수
- **Vector 비정규화 근거 명시**: symbol/exchange는 FK 없이 Candle 값 복사. Candle → Vector CASCADE가 무결성 보장

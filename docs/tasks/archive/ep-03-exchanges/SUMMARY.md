# EP-03 Exchanges — Archive Summary

- **Completed:** 2026-04-04
- **Tasks:** 10 (T-03-001 ~ T-03-010)
- **Key decisions:**
  - CCXT 기반 BaseExchangeAdapter 추상 클래스 패턴 채택
  - 에러 매핑: CCXT 에러를 mapError()에서 한 번만 매핑 (개별 catch 금지)
  - Decimal 변환: CCXT number를 toDecimal()로 문자열 경유 변환
  - UUID v7 clientOrderId로 주문 멱등성 보장
  - WebSocket 관리: WsManager 분리, 자동 재연결 + 지수 백오프
- **Patterns discovered:**
  - CCXT 에러 → ExchangeError 매핑을 base 클래스에 집중
  - toDecimal() 문자열 경유 변환 (부동소수점 회피)
  - withRetry() 재시도 래퍼 패턴
  - OKX/Bitget/MEXC scaffold: 공통 base + 거래소별 오버라이드
- **Outputs produced:**
  - `src/exchanges/` — base, binance, okx, bitget, mexc, ws-manager, errors, index
  - Binance: REST (read + orders + SL/leverage) + WebSocket (kline)
  - OKX/Bitget/MEXC: scaffold (read + orders)

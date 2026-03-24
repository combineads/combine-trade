# Trading Glossary — Korean/English Terminology Reference

This document is the canonical reference for domain term translations used in Combine Trade UI.
All translators and developers must use these translations to ensure consistency across
all i18n message files (`packages/ui/src/i18n/messages/{ko,en}.json`).

The authoritative source is `glossary.ts` in this directory.
This markdown file is generated from it for human readability.

---

## Rules

1. **LONG / SHORT / PASS** are always kept in English in both locales (domain standard).
2. When multiple Korean alternatives exist, use the **primary** (`ko`) in UI translations.
   Alternatives (`koAlt`) are listed for context and search purposes.
3. Technical acronyms (RSI, MACD, OHLCV) are kept as-is in both languages.
4. Notes explain nuances, context, or system-specific meanings.

---

## General Trading (일반 트레이딩)

| English | Korean (primary) | Korean (alternatives) | Note |
|---------|------------------|-----------------------|------|
| Strategy | 전략 | | A named, versioned set of rules that evaluates candles and produces events. |
| Symbol | 심볼 | 종목 | Trading pair, e.g. BTC/USDT. |
| Candle | 캔들 | 봉 | OHLCV price bar. '봉' is used in Korean trading parlance. |
| Backtest | 백테스트 | | Historical simulation of a strategy against past candle data. |
| Paper Trading | 모의매매 | 페이퍼 트레이딩 | Simulated live trading without real funds. |
| Live Trading | 실전매매 | 라이브 트레이딩 | |
| Exchange | 거래소 | | |
| Market | 시장 | | |
| Liquidity | 유동성 | | |
| Volatility | 변동성 | | |
| Trend | 추세 | | |
| Breakout | 돌파 | | |
| Signal | 시그널 | 신호 | |
| Event | 이벤트 | | A structured output from strategy evaluation that gets vectorized. |

---

## Order Types (주문 유형)

| English | Korean (primary) | Korean (alternatives) | Note |
|---------|------------------|-----------------------|------|
| Order | 주문 | | |
| Market Order | 시장가 주문 | | |
| Limit Order | 지정가 주문 | | |
| Stop Order | 스탑 주문 | 조건부 주문 | |
| Stop-Limit Order | 스탑-리밋 주문 | | |
| Trailing Stop | 트레일링 스탑 | 추적 손절 | |
| Take Profit | 익절 | 이익실현, TP | Closing a position at a profit target. |
| Stop Loss | 손절 | 손실제한, SL | Closing a position to limit losses. |
| Entry | 진입 | 매수, 매도 | Opening a new position. |
| Exit | 청산 | 종료 | Closing an existing position. |
| Fill | 체결 | | Order execution at a specific price. |
| Partial Fill | 부분 체결 | | |
| Cancel | 취소 | | |

---

## Risk Management (리스크 관리)

| English | Korean (primary) | Korean (alternatives) | Note |
|---------|------------------|-----------------------|------|
| Kill Switch | 킬 스위치 | 긴급 중지 | Immediate halt of all trading activity. Must trigger within 1 second. |
| Daily Loss Limit | 일일 손실 한도 | 데일리 손실 제한 | Maximum allowed loss per day. Breach suspends auto-trade immediately. |
| Max Drawdown | 최대 낙폭 | MDD | |
| Risk per Trade | 트레이드당 리스크 | 거래당 위험 | |
| Position Sizing | 포지션 사이징 | 수량 결정 | |
| Leverage | 레버리지 | | |
| Margin | 마진 | 증거금 | '증거금' is the formal Korean term; '마진' is common parlance. |
| Liquidation | 청산 | | Forced close of a leveraged position. Context distinguishes from voluntary Exit. |
| Margin Call | 마진콜 | | |
| Isolated Margin | 격리 마진 | | |
| Cross Margin | 교차 마진 | | |

---

## Technical Analysis (기술적 분석)

| English | Korean (primary) | Korean (alternatives) | Note |
|---------|------------------|-----------------------|------|
| Moving Average | 이동평균 | MA | |
| Bollinger Bands | 볼린저 밴드 | BB | |
| RSI | RSI | | Relative Strength Index. Acronym kept in both languages (domain standard). |
| MACD | MACD | | Acronym kept in both languages. |
| Support | 지지 | 지지선 | |
| Resistance | 저항 | 저항선 | |
| Timeframe | 타임프레임 | 시간대 | |
| Volume | 거래량 | | |
| Open | 시가 | | Opening price of a candle. |
| High | 고가 | | Highest price of a candle. |
| Low | 저가 | | Lowest price of a candle. |
| Close | 종가 | | Closing price of a candle. |
| OHLCV | OHLCV | | Open/High/Low/Close/Volume. Acronym kept in both languages. |
| Upper Band | 상단 밴드 | | |
| Lower Band | 하단 밴드 | | |
| Bandwidth | 밴드폭 | | |

---

## Position Management (포지션 관리)

| English | Korean (primary) | Korean (alternatives) | Note |
|---------|------------------|-----------------------|------|
| Position | 포지션 | | |
| Long Position | 롱 포지션 | 매수 포지션 | Buying with expectation of price increase. |
| Short Position | 숏 포지션 | 매도 포지션 | Selling with expectation of price decrease. |
| PnL | 손익 | 수익/손실, P&L | Profit and Loss. |
| Unrealized PnL | 미실현 손익 | 평가손익 | |
| Realized PnL | 실현 손익 | | |
| Open Position | 열린 포지션 | 미결 포지션 | |
| Closed Position | 닫힌 포지션 | 결제 완료 포지션 | |
| Average Entry Price | 평균 진입가 | 평균 매입가 | |
| Holding Period | 보유 기간 | | |
| Quantity | 수량 | | |
| Notional Value | 명목 금액 | | |

---

## System Components (시스템 구성요소)

| English | Korean (primary) | Korean (alternatives) | Note |
|---------|------------------|-----------------------|------|
| Decision Engine | 의사결정 엔진 | | Core system component that produces LONG/SHORT/PASS decisions. |
| Vector Search | 벡터 검색 | | L2 similarity search over historical event vectors. |
| Vectorization | 벡터화 | | |
| Worker | 워커 | | Background Bun process handling a specific pipeline stage. |
| Pipeline | 파이프라인 | | |
| Alert | 알림 | 경고 | |
| Execution | 실행 | 주문 실행 | Order execution against an exchange. |
| Journal | 저널 | 트레이드 일지 | |
| Supervisor | 수퍼바이저 | | Process that monitors and restarts failed workers. |
| Dashboard | 대시보드 | | |
| Settings | 설정 | | |
| API Key | API 키 | | |

---

## Statistics & Performance (통계 및 성과)

| English | Korean (primary) | Korean (alternatives) | Note |
|---------|------------------|-----------------------|------|
| Win Rate | 승률 | | Percentage of profitable trades. |
| Expectancy | 기대값 | | Average expected profit per trade. |
| Profit Factor | 수익 팩터 | | Gross profit divided by gross loss. |
| Sharpe Ratio | 샤프 비율 | | |
| Return | 수익률 | | |
| Trade Count | 거래 횟수 | | |
| Equity Curve | 자산 곡선 | | |
| Match Count | 매칭 수 | | Number of historical vectors matched during L2 search for a decision. |
| Confidence | 신뢰도 | | |
| Sample Size | 샘플 크기 | | |
| Average Return | 평균 수익률 | | |
| Median Return | 중간 수익률 | | |

---

## Domain-Standard Terms — Always English (도메인 표준 용어 — 항상 영어 유지)

These terms are intentionally **not translated**. They appear as-is in both Korean and English UI.

| Term | Rationale |
|------|-----------|
| LONG | Decision engine output. Korean traders use this term directly. |
| SHORT | Decision engine output. Korean traders use this term directly. |
| PASS | Decision engine output. Korean traders use this term directly. |

---

## Usage in i18n Message Files

When writing `packages/ui/src/i18n/messages/ko.json`, use the **Korean (primary)** column.
When writing `packages/ui/src/i18n/messages/en.json`, use the **English** column.

Example:
```json
// ko.json
{
  "risk": {
    "killSwitch": "킬 스위치",
    "dailyLossLimit": "일일 손실 한도",
    "stopLoss": "손절"
  }
}

// en.json
{
  "risk": {
    "killSwitch": "Kill Switch",
    "dailyLossLimit": "Daily Loss Limit",
    "stopLoss": "Stop Loss"
  }
}
```

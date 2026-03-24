/**
 * Trading Glossary — Korean/English Terminology Reference
 *
 * Canonical source of truth for domain term translations used across
 * packages/ui i18n messages. All translators and developers must
 * reference this file to ensure consistency.
 *
 * Rules:
 * - LONG, SHORT, PASS → always English in both locales (domain standard)
 * - Entries have one primary Korean term; alternatives are recorded for clarity
 * - Notes explain nuances or usage context
 */

export interface GlossaryEntry {
  /** English term (canonical key) */
  en: string;
  /** Primary Korean translation */
  ko: string;
  /** Alternative Korean translations, if any */
  koAlt?: string[];
  /** Usage note or context */
  note?: string;
}

export interface GlossaryCategory {
  /** Category identifier */
  id: string;
  /** Category display name (English) */
  label: string;
  /** Category display name (Korean) */
  labelKo: string;
  entries: GlossaryEntry[];
}

// ---------------------------------------------------------------------------
// General Trading Terms
// ---------------------------------------------------------------------------
const general: GlossaryCategory = {
  id: "general",
  label: "General Trading",
  labelKo: "일반 트레이딩",
  entries: [
    {
      en: "Strategy",
      ko: "전략",
      note: "A named, versioned set of rules that evaluates candles and produces events.",
    },
    {
      en: "Symbol",
      ko: "심볼",
      koAlt: ["종목"],
      note: "Trading pair, e.g. BTC/USDT.",
    },
    {
      en: "Candle",
      ko: "캔들",
      koAlt: ["봉"],
      note: "OHLCV price bar. '봉' is used in Korean trading parlance.",
    },
    {
      en: "Backtest",
      ko: "백테스트",
      note: "Historical simulation of a strategy against past candle data.",
    },
    {
      en: "Paper Trading",
      ko: "모의매매",
      koAlt: ["페이퍼 트레이딩"],
      note: "Simulated live trading without real funds.",
    },
    {
      en: "Live Trading",
      ko: "실전매매",
      koAlt: ["라이브 트레이딩"],
    },
    {
      en: "Exchange",
      ko: "거래소",
    },
    {
      en: "Market",
      ko: "시장",
    },
    {
      en: "Liquidity",
      ko: "유동성",
    },
    {
      en: "Volatility",
      ko: "변동성",
    },
    {
      en: "Trend",
      ko: "추세",
    },
    {
      en: "Breakout",
      ko: "돌파",
    },
    {
      en: "Signal",
      ko: "시그널",
      koAlt: ["신호"],
    },
    {
      en: "Event",
      ko: "이벤트",
      note: "A structured output from strategy evaluation that gets vectorized.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Order Types
// ---------------------------------------------------------------------------
const orderTypes: GlossaryCategory = {
  id: "orderTypes",
  label: "Order Types",
  labelKo: "주문 유형",
  entries: [
    {
      en: "Order",
      ko: "주문",
    },
    {
      en: "Market Order",
      ko: "시장가 주문",
    },
    {
      en: "Limit Order",
      ko: "지정가 주문",
    },
    {
      en: "Stop Order",
      ko: "스탑 주문",
      koAlt: ["조건부 주문"],
    },
    {
      en: "Stop-Limit Order",
      ko: "스탑-리밋 주문",
    },
    {
      en: "Trailing Stop",
      ko: "트레일링 스탑",
      koAlt: ["추적 손절"],
    },
    {
      en: "Take Profit",
      ko: "익절",
      koAlt: ["이익실현", "TP"],
      note: "Closing a position at a profit target.",
    },
    {
      en: "Stop Loss",
      ko: "손절",
      koAlt: ["손실제한", "SL"],
      note: "Closing a position to limit losses.",
    },
    {
      en: "Entry",
      ko: "진입",
      koAlt: ["매수", "매도"],
      note: "Opening a new position.",
    },
    {
      en: "Exit",
      ko: "청산",
      koAlt: ["종료"],
      note: "Closing an existing position.",
    },
    {
      en: "Fill",
      ko: "체결",
      note: "Order execution at a specific price.",
    },
    {
      en: "Partial Fill",
      ko: "부분 체결",
    },
    {
      en: "Cancel",
      ko: "취소",
    },
  ],
};

// ---------------------------------------------------------------------------
// Risk Management
// ---------------------------------------------------------------------------
const riskManagement: GlossaryCategory = {
  id: "riskManagement",
  label: "Risk Management",
  labelKo: "리스크 관리",
  entries: [
    {
      en: "Kill Switch",
      ko: "킬 스위치",
      koAlt: ["긴급 중지"],
      note:
        "Immediate halt of all trading activity. Must trigger within 1 second.",
    },
    {
      en: "Daily Loss Limit",
      ko: "일일 손실 한도",
      koAlt: ["데일리 손실 제한"],
      note:
        "Maximum allowed loss per day. Breach suspends auto-trade immediately.",
    },
    {
      en: "Max Drawdown",
      ko: "최대 낙폭",
      koAlt: ["MDD"],
    },
    {
      en: "Risk per Trade",
      ko: "트레이드당 리스크",
      koAlt: ["거래당 위험"],
    },
    {
      en: "Position Sizing",
      ko: "포지션 사이징",
      koAlt: ["수량 결정"],
    },
    {
      en: "Leverage",
      ko: "레버리지",
    },
    {
      en: "Margin",
      ko: "마진",
      koAlt: ["증거금"],
      note: "'증거금' is the formal Korean term; '마진' is common parlance.",
    },
    {
      en: "Liquidation",
      ko: "청산",
      note:
        "Forced close of a leveraged position. Context distinguishes from voluntary Exit.",
    },
    {
      en: "Margin Call",
      ko: "마진콜",
    },
    {
      en: "Isolated Margin",
      ko: "격리 마진",
    },
    {
      en: "Cross Margin",
      ko: "교차 마진",
    },
  ],
};

// ---------------------------------------------------------------------------
// Technical Analysis
// ---------------------------------------------------------------------------
const technicalAnalysis: GlossaryCategory = {
  id: "technicalAnalysis",
  label: "Technical Analysis",
  labelKo: "기술적 분석",
  entries: [
    {
      en: "Moving Average",
      ko: "이동평균",
      koAlt: ["MA"],
    },
    {
      en: "Bollinger Bands",
      ko: "볼린저 밴드",
      koAlt: ["BB"],
    },
    {
      en: "RSI",
      ko: "RSI",
      note:
        "Relative Strength Index. Acronym kept in both languages (domain standard).",
    },
    {
      en: "MACD",
      ko: "MACD",
      note: "Acronym kept in both languages.",
    },
    {
      en: "Support",
      ko: "지지",
      koAlt: ["지지선"],
    },
    {
      en: "Resistance",
      ko: "저항",
      koAlt: ["저항선"],
    },
    {
      en: "Timeframe",
      ko: "타임프레임",
      koAlt: ["시간대"],
    },
    {
      en: "Volume",
      ko: "거래량",
    },
    {
      en: "Open",
      ko: "시가",
      note: "Opening price of a candle.",
    },
    {
      en: "High",
      ko: "고가",
      note: "Highest price of a candle.",
    },
    {
      en: "Low",
      ko: "저가",
      note: "Lowest price of a candle.",
    },
    {
      en: "Close",
      ko: "종가",
      note: "Closing price of a candle.",
    },
    {
      en: "OHLCV",
      ko: "OHLCV",
      note: "Open/High/Low/Close/Volume. Acronym kept in both languages.",
    },
    {
      en: "Upper Band",
      ko: "상단 밴드",
    },
    {
      en: "Lower Band",
      ko: "하단 밴드",
    },
    {
      en: "Bandwidth",
      ko: "밴드폭",
    },
  ],
};

// ---------------------------------------------------------------------------
// Position Management
// ---------------------------------------------------------------------------
const positionManagement: GlossaryCategory = {
  id: "positionManagement",
  label: "Position Management",
  labelKo: "포지션 관리",
  entries: [
    {
      en: "Position",
      ko: "포지션",
    },
    {
      en: "Long Position",
      ko: "롱 포지션",
      koAlt: ["매수 포지션"],
      note: "Buying with expectation of price increase.",
    },
    {
      en: "Short Position",
      ko: "숏 포지션",
      koAlt: ["매도 포지션"],
      note: "Selling with expectation of price decrease.",
    },
    {
      en: "PnL",
      ko: "손익",
      koAlt: ["수익/손실", "P&L"],
      note: "Profit and Loss.",
    },
    {
      en: "Unrealized PnL",
      ko: "미실현 손익",
      koAlt: ["평가손익"],
    },
    {
      en: "Realized PnL",
      ko: "실현 손익",
    },
    {
      en: "Open Position",
      ko: "열린 포지션",
      koAlt: ["미결 포지션"],
    },
    {
      en: "Closed Position",
      ko: "닫힌 포지션",
      koAlt: ["결제 완료 포지션"],
    },
    {
      en: "Average Entry Price",
      ko: "평균 진입가",
      koAlt: ["평균 매입가"],
    },
    {
      en: "Holding Period",
      ko: "보유 기간",
    },
    {
      en: "Quantity",
      ko: "수량",
    },
    {
      en: "Notional Value",
      ko: "명목 금액",
    },
  ],
};

// ---------------------------------------------------------------------------
// System Components
// ---------------------------------------------------------------------------
const systemComponents: GlossaryCategory = {
  id: "systemComponents",
  label: "System Components",
  labelKo: "시스템 구성요소",
  entries: [
    {
      en: "Decision Engine",
      ko: "의사결정 엔진",
      note: "Core system component that produces LONG/SHORT/PASS decisions.",
    },
    {
      en: "Vector Search",
      ko: "벡터 검색",
      note: "L2 similarity search over historical event vectors.",
    },
    {
      en: "Vectorization",
      ko: "벡터화",
    },
    {
      en: "Worker",
      ko: "워커",
      note: "Background Bun process handling a specific pipeline stage.",
    },
    {
      en: "Pipeline",
      ko: "파이프라인",
    },
    {
      en: "Alert",
      ko: "알림",
      koAlt: ["경고"],
    },
    {
      en: "Execution",
      ko: "실행",
      koAlt: ["주문 실행"],
      note: "Order execution against an exchange.",
    },
    {
      en: "Journal",
      ko: "저널",
      koAlt: ["트레이드 일지"],
    },
    {
      en: "Supervisor",
      ko: "수퍼바이저",
      note: "Process that monitors and restarts failed workers.",
    },
    {
      en: "Dashboard",
      ko: "대시보드",
    },
    {
      en: "Settings",
      ko: "설정",
    },
    {
      en: "API Key",
      ko: "API 키",
    },
  ],
};

// ---------------------------------------------------------------------------
// Statistics & Performance
// ---------------------------------------------------------------------------
const statistics: GlossaryCategory = {
  id: "statistics",
  label: "Statistics & Performance",
  labelKo: "통계 및 성과",
  entries: [
    {
      en: "Win Rate",
      ko: "승률",
      note: "Percentage of profitable trades.",
    },
    {
      en: "Expectancy",
      ko: "기대값",
      note: "Average expected profit per trade.",
    },
    {
      en: "Profit Factor",
      ko: "수익 팩터",
      note: "Gross profit divided by gross loss.",
    },
    {
      en: "Sharpe Ratio",
      ko: "샤프 비율",
    },
    {
      en: "Return",
      ko: "수익률",
    },
    {
      en: "Trade Count",
      ko: "거래 횟수",
    },
    {
      en: "Equity Curve",
      ko: "자산 곡선",
    },
    {
      en: "Match Count",
      ko: "매칭 수",
      note:
        "Number of historical vectors matched during L2 search for a decision.",
    },
    {
      en: "Confidence",
      ko: "신뢰도",
    },
    {
      en: "Sample Size",
      ko: "샘플 크기",
    },
    {
      en: "Average Return",
      ko: "평균 수익률",
    },
    {
      en: "Median Return",
      ko: "중간 수익률",
    },
  ],
};

// ---------------------------------------------------------------------------
// Domain-Standard Terms (always kept in English)
// ---------------------------------------------------------------------------
const domainStandard: GlossaryCategory = {
  id: "domainStandard",
  label: "Domain-Standard Terms (always English)",
  labelKo: "도메인 표준 용어 (항상 영어 유지)",
  entries: [
    {
      en: "LONG",
      ko: "LONG",
      note:
        "Decision: enter a long position. Kept as-is in both locales per domain standard.",
    },
    {
      en: "SHORT",
      ko: "SHORT",
      note:
        "Decision: enter a short position. Kept as-is in both locales per domain standard.",
    },
    {
      en: "PASS",
      ko: "PASS",
      note:
        "Decision: no action. Kept as-is in both locales per domain standard.",
    },
    {
      en: "LONG/SHORT/PASS",
      ko: "LONG/SHORT/PASS",
      note: "The three possible decision engine outputs.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Exported glossary
// ---------------------------------------------------------------------------

/** All glossary categories in display order */
export const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
  general,
  orderTypes,
  riskManagement,
  technicalAnalysis,
  positionManagement,
  systemComponents,
  statistics,
  domainStandard,
];

/** Flat map of all glossary entries, keyed by English term */
export const GLOSSARY_BY_ENGLISH: Readonly<Record<string, GlossaryEntry>> =
  Object.freeze(
    GLOSSARY_CATEGORIES.flatMap((cat) => cat.entries).reduce(
      (acc, entry) => {
        acc[entry.en] = entry;
        return acc;
      },
      {} as Record<string, GlossaryEntry>,
    ),
  );

/**
 * Look up the Korean translation for an English term.
 * Returns the English term unchanged if not found (safe fallback).
 */
export function lookupKo(en: string): string {
  return GLOSSARY_BY_ENGLISH[en]?.ko ?? en;
}

/**
 * Look up the English term for a Korean translation (reverse lookup).
 * Searches both primary and alternative Korean terms.
 * Returns undefined if not found.
 */
export function lookupEn(ko: string): string | undefined {
  for (const entry of Object.values(GLOSSARY_BY_ENGLISH)) {
    if (entry.ko === ko || entry.koAlt?.includes(ko)) {
      return entry.en;
    }
  }
  return undefined;
}

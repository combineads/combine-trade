/**
 * Trading glossary — authoritative term mapping for ko/en translations.
 *
 * Rules:
 * - Domain terms that are used as-is in both languages stay in English (LONG, SHORT, PASS, PnL, etc.)
 * - Korean translations must use these exact terms for consistency.
 * - This file is the single source of truth for term translation choices.
 */

/** Terms that remain in English in both ko and en locales (domain standard). */
export const UNTRANSLATED_TERMS = [
  "LONG",
  "SHORT",
  "PASS",
  "PnL",
  "PnL%",
  "PAPER",
  "RSI",
  "MACD",
  "ATR",
  "BB",
  "VWAP",
  "OBV",
  "ADX",
] as const;

/** Korean translations for trading domain terms. */
export const KO_TERMS = {
  // Core trading concepts
  strategy: "전략",
  position: "포지션",
  order: "주문",
  balance: "잔고",
  symbol: "심볼",
  price: "가격",
  quantity: "수량",
  leverage: "레버리지",
  margin: "증거금",
  fee: "수수료",
  fundingRate: "펀딩 비율",

  // P&L
  pnl: "PnL",
  unrealizedPnl: "미실현 PnL",
  realizedPnl: "실현 PnL",
  roi: "수익률",
  winRate: "승률",
  profitFactor: "수익 팩터",
  maxDrawdown: "최대 낙폭",

  // Order types
  marketOrder: "시장가 주문",
  limitOrder: "지정가 주문",
  stopLoss: "손절",
  takeProfit: "익절",
  trailingStop: "트레일링 스탑",

  // Directions (kept in English — domain standard)
  long: "LONG",
  short: "SHORT",
  pass: "PASS",

  // Status labels
  active: "활성",
  inactive: "비활성",
  pending: "대기 중",
  running: "실행 중",
  stopped: "중지됨",
  error: "오류",
  success: "성공",
  warning: "경고",
  draft: "초안",
  filled: "체결됨",
  cancelled: "취소됨",
  partiallyFilled: "부분 체결",

  // Risk management
  killSwitch: "킬 스위치",
  dailyLossLimit: "일일 손실 한도",
  positionSize: "포지션 크기",
  riskManagement: "리스크 관리",

  // Navigation
  dashboard: "대시보드",
  strategies: "전략",
  orders: "주문",
  alerts: "알림",
  settings: "설정",
  journal: "저널",
  backtest: "백테스트",
  charts: "차트",
  events: "이벤트",
  risk: "리스크",

  // Backtest
  backtestReport: "백테스트 보고서",
  totalTrades: "총 거래 수",
  winningTrades: "수익 거래",
  losingTrades: "손실 거래",
  annualReturn: "연간 수익률",
  sharpeRatio: "샤프 비율",

  // Paper trading
  paperTrading: "페이퍼 트레이딩",
  liveTrading: "실거래",

  // Workers
  worker: "워커",
  workerStatus: "워커 상태",
  connected: "연결됨",
  disconnected: "연결 해제됨",

  // Time
  timeframe: "타임프레임",
  candle: "캔들",
  timestamp: "타임스탬프",
} as const;

/** English display terms for the same concepts. */
export const EN_TERMS = {
  strategy: "Strategy",
  position: "Position",
  order: "Order",
  balance: "Balance",
  symbol: "Symbol",
  price: "Price",
  quantity: "Quantity",
  leverage: "Leverage",
  margin: "Margin",
  fee: "Fee",
  fundingRate: "Funding Rate",

  pnl: "PnL",
  unrealizedPnl: "Unrealized PnL",
  realizedPnl: "Realized PnL",
  roi: "ROI",
  winRate: "Win Rate",
  profitFactor: "Profit Factor",
  maxDrawdown: "Max Drawdown",

  marketOrder: "Market Order",
  limitOrder: "Limit Order",
  stopLoss: "Stop Loss",
  takeProfit: "Take Profit",
  trailingStop: "Trailing Stop",

  long: "LONG",
  short: "SHORT",
  pass: "PASS",

  active: "Active",
  inactive: "Inactive",
  pending: "Pending",
  running: "Running",
  stopped: "Stopped",
  error: "Error",
  success: "Success",
  warning: "Warning",
  draft: "Draft",
  filled: "Filled",
  cancelled: "Cancelled",
  partiallyFilled: "Partially Filled",

  killSwitch: "Kill Switch",
  dailyLossLimit: "Daily Loss Limit",
  positionSize: "Position Size",
  riskManagement: "Risk Management",

  dashboard: "Dashboard",
  strategies: "Strategies",
  orders: "Orders",
  alerts: "Alerts",
  settings: "Settings",
  journal: "Journal",
  backtest: "Backtest",
  charts: "Charts",
  events: "Events",
  risk: "Risk",

  backtestReport: "Backtest Report",
  totalTrades: "Total Trades",
  winningTrades: "Winning Trades",
  losingTrades: "Losing Trades",
  annualReturn: "Annual Return",
  sharpeRatio: "Sharpe Ratio",

  paperTrading: "Paper Trading",
  liveTrading: "Live Trading",

  worker: "Worker",
  workerStatus: "Worker Status",
  connected: "Connected",
  disconnected: "Disconnected",

  timeframe: "Timeframe",
  candle: "Candle",
  timestamp: "Timestamp",
} as const;

export type GlossaryKey = keyof typeof KO_TERMS;

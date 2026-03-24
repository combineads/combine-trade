/**
 * Trading domain glossary — consistent term mapping between Korean and English.
 * LONG, SHORT, PASS remain in English in both locales (domain standard).
 */
export const GLOSSARY = {
	// Directions — always English (trading domain standard)
	LONG: "LONG",
	SHORT: "SHORT",
	PASS: "PASS",

	// Core terms
	ko: {
		strategy: "전략",
		stopLoss: "손절",
		takeProfit: "익절",
		position: "포지션",
		order: "주문",
		candle: "캔들",
		winrate: "승률",
		event: "이벤트",
		balance: "잔고",
		pnl: "손익",
		dailyPnl: "일간 손익",
		totalBalance: "총 잔고",
		activePositions: "활성 포지션",
		activeStrategies: "활성 전략",
		killSwitch: "킬 스위치",
		worker: "워커",
		pipeline: "파이프라인",
	},
	en: {
		strategy: "Strategy",
		stopLoss: "Stop Loss",
		takeProfit: "Take Profit",
		position: "Position",
		order: "Order",
		candle: "Candle",
		winrate: "Win Rate",
		event: "Event",
		balance: "Balance",
		pnl: "PnL",
		dailyPnl: "Daily PnL",
		totalBalance: "Total Balance",
		activePositions: "Active Positions",
		activeStrategies: "Active Strategies",
		killSwitch: "Kill Switch",
		worker: "Worker",
		pipeline: "Pipeline",
	},
} as const;

export type Locale = "ko" | "en";
export type GlossaryTerm = keyof (typeof GLOSSARY)["ko"];

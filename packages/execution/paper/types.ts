export type PaperDirection = "LONG" | "SHORT";

export interface PaperOrderConfig {
	/** Slippage percentage, e.g. 0.05 for 0.05%. Default: 0.05 */
	slippagePct: number;
}

export const DEFAULT_PAPER_CONFIG: PaperOrderConfig = {
	slippagePct: 0.05,
};

export interface PaperFill {
	direction: PaperDirection;
	fillPrice: string;
	slippageApplied: string;
}

export interface PaperCandle {
	open: string;
	high: string;
	low: string;
	close: string;
}

export type PaperExitReason = "TP" | "SL" | "TIME_EXIT";

export interface PaperExitResult {
	reason: PaperExitReason;
	exitPrice: string;
	exitBar: number;
	slHitFirst: boolean;
}

export interface PaperBalance {
	available: string;
	initial: string;
	realizedPnl: string;
}

export interface PaperPosition {
	direction: PaperDirection;
	entryPrice: string;
	quantity: string;
	margin: string;
	leverage: number;
}

export interface PeriodSummary {
	totalPnl: string;
	winCount: number;
	lossCount: number;
	winRate: number;
	tradeCount: number;
}

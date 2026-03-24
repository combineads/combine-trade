export type KillSwitchScope = "global" | "exchange" | "strategy";
export type KillSwitchTrigger = "manual" | "loss_limit" | "api_error" | "system";

export interface KillSwitchState {
	id: string;
	scope: KillSwitchScope;
	scopeTarget: string | null;
	active: boolean;
	triggeredBy: KillSwitchTrigger;
	triggeredAt: Date;
	requiresAcknowledgment: boolean;
	acknowledgedAt: Date | null;
}

export interface DailyLossConfig {
	dailyLimitPct: number;
	weeklyLimitPct: number;
	maxConsecutiveSl: number;
}

export interface PnlRecord {
	id: string;
	pnl: string;
	closedAt: Date;
}

export interface LimitCheckResult {
	breached: boolean;
	reason?: string;
}

export interface PositionSizeConfig {
	riskPct: number;
	stepSize: string;
	minQty: string;
	maxQty: string;
	maxExposureUsd: string;
	maxLeverage: number;
}

export interface PositionSizeResult {
	quantity: string;
	notionalUsd: string;
	effectiveLeverage: string;
}

export interface LiquidationPriceInput {
	side: "LONG" | "SHORT";
	entryPrice: string;
	leverage: number;
	maintenanceMarginRate: string;
	marginType: "isolated" | "cross";
}

export interface LiquidationPriceResult {
	price: string | null;
	source: "exchange" | "estimate";
}

export interface LiquidationPriceProvider {
	fetchLiquidationPrice(input: LiquidationPriceInput): Promise<string | null>;
}

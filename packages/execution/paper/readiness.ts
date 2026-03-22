export interface BacktestInput {
	tradeCount: number;
	expectancy: number;
	sharpeRatio: number;
	maxDrawdownPct: number;
}

export interface PaperInput {
	durationDays: number;
	tradeCount: number;
	zTestPass: boolean;
	lossLimitBreaches: number;
}

export interface RiskInput {
	dailyLossLimitConfigured: boolean;
	positionSizingConfigured: boolean;
	killSwitchTestedWithin24h: boolean;
	exchangeCredentialsValid: boolean;
}

export interface ManualInput {
	riskAcknowledged: boolean;
	goLiveConfirmed: boolean;
}

export interface ReadinessInput {
	backtest: BacktestInput;
	paper: PaperInput;
	risk: RiskInput;
	manual: ManualInput;
	resetTriggered: boolean;
}

export type GateStatus = "LOCKED" | "CAUTION" | "READY";

export interface ReadinessScore {
	total: number;
	gate: GateStatus;
	breakdown: {
		backtest: number;
		paper: number;
		risk: number;
		manual: number;
	};
	resetReason: string | null;
	recommendExtendDays: number | null;
}

function scoreBacktest(input: BacktestInput): number {
	let score = 0;
	if (input.tradeCount >= 100) score += 10;
	if (input.expectancy > 0) score += 10;
	if (input.sharpeRatio > 1.0) score += 10;
	if (input.maxDrawdownPct < 20) score += 5;
	return score;
}

function scorePaper(input: PaperInput): number {
	let score = 0;
	if (input.durationDays >= 7) score += 8;
	if (input.tradeCount >= 10) score += 7;
	if (input.zTestPass) score += 12;
	if (input.lossLimitBreaches === 0) score += 8;
	return score;
}

function scoreRisk(input: RiskInput): number {
	let score = 0;
	if (input.dailyLossLimitConfigured) score += 5;
	if (input.positionSizingConfigured) score += 5;
	if (input.killSwitchTestedWithin24h) score += 5;
	if (input.exchangeCredentialsValid) score += 5;
	return score;
}

function scoreManual(input: ManualInput): number {
	let score = 0;
	if (input.riskAcknowledged) score += 5;
	if (input.goLiveConfirmed) score += 5;
	return score;
}

function classifyGate(total: number): GateStatus {
	if (total >= 90) return "READY";
	if (total >= 70) return "CAUTION";
	return "LOCKED";
}

/** Calculate composite readiness score (0-100) for paper→live gate. */
export function calculateReadinessScore(input: ReadinessInput): ReadinessScore {
	if (input.resetTriggered) {
		return {
			total: 0,
			gate: "LOCKED",
			breakdown: { backtest: 0, paper: 0, risk: 0, manual: 0 },
			resetReason: "reset_triggered",
			recommendExtendDays: null,
		};
	}

	const backtest = scoreBacktest(input.backtest);
	const paper = scorePaper(input.paper);
	const risk = scoreRisk(input.risk);
	const manual = scoreManual(input.manual);
	const total = backtest + paper + risk + manual;

	const recommendExtendDays =
		input.paper.durationDays >= 7 && input.paper.tradeCount < 10 ? 14 : null;

	return {
		total,
		gate: classifyGate(total),
		breakdown: { backtest, paper, risk, manual },
		resetReason: null,
		recommendExtendDays,
	};
}

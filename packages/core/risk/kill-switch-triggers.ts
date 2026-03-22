export interface TriggerResult {
	shouldActivate: boolean;
	scope: "global" | "strategy";
	scopeTarget?: string;
	reason: string;
}

// --- Financial triggers (instant, no grace) ---

export interface FinancialState {
	dailyLossBreached: boolean;
	balanceDeviationPct: number;
	hasUntrackedPositions: boolean;
	consecutiveRejections: Record<string, number>;
}

export function evaluateFinancialTriggers(state: FinancialState): TriggerResult[] {
	const results: TriggerResult[] = [];

	results.push({
		shouldActivate: state.dailyLossBreached,
		scope: "global",
		reason: "daily loss limit breached",
	});

	results.push({
		shouldActivate: state.balanceDeviationPct > 5,
		scope: "global",
		reason: `balance deviation ${state.balanceDeviationPct}% exceeds 5% threshold`,
	});

	results.push({
		shouldActivate: state.hasUntrackedPositions,
		scope: "global",
		reason: "untracked positions detected",
	});

	for (const [strategyId, count] of Object.entries(state.consecutiveRejections)) {
		results.push({
			shouldActivate: count >= 3,
			scope: "strategy",
			scopeTarget: strategyId,
			reason: `${count} consecutive order rejection(s) for ${strategyId}`,
		});
	}

	return results;
}

// --- Infrastructure triggers (grace period, position check) ---

export interface InfrastructureState {
	exchangeUnreachableSecs: Record<string, number>;
	dbUnreachableSecs: number;
	workerUnresponsiveSecs: Record<string, number>;
	hasOpenPositions: boolean;
}

export function evaluateInfrastructureTriggers(state: InfrastructureState): TriggerResult[] {
	const results: TriggerResult[] = [];

	for (const [exchange, secs] of Object.entries(state.exchangeUnreachableSecs)) {
		results.push({
			shouldActivate: secs > 30 && state.hasOpenPositions,
			scope: "global",
			reason: `exchange ${exchange} unreachable for ${secs}s with open positions`,
		});
	}

	results.push({
		shouldActivate: state.dbUnreachableSecs > 15 && state.hasOpenPositions,
		scope: "global",
		reason: `DB unreachable for ${state.dbUnreachableSecs}s with open positions`,
	});

	for (const [worker, secs] of Object.entries(state.workerUnresponsiveSecs)) {
		results.push({
			shouldActivate: secs > 60,
			scope: "global",
			reason: `worker ${worker} unresponsive for ${secs}s`,
		});
	}

	return results;
}

// --- Sandbox triggers (instant, per-strategy) ---

export interface SandboxState {
	oomStrategies: string[];
	timeoutStrategies: string[];
	crashCounts: Record<string, number>;
}

export function evaluateSandboxTriggers(state: SandboxState): TriggerResult[] {
	const results: TriggerResult[] = [];

	for (const strategyId of state.oomStrategies) {
		results.push({
			shouldActivate: true,
			scope: "strategy",
			scopeTarget: strategyId,
			reason: `OOM detected for strategy ${strategyId}`,
		});
	}

	for (const strategyId of state.timeoutStrategies) {
		results.push({
			shouldActivate: true,
			scope: "strategy",
			scopeTarget: strategyId,
			reason: `timeout detected for strategy ${strategyId}`,
		});
	}

	for (const [strategyId, count] of Object.entries(state.crashCounts)) {
		results.push({
			shouldActivate: count >= 3,
			scope: "strategy",
			scopeTarget: strategyId,
			reason: `${count} consecutive crashes for strategy ${strategyId}`,
		});
	}

	return results;
}

// --- Data integrity triggers (instant, position check) ---

export interface DataIntegrityState {
	candleGapCounts: Record<string, number>;
	vectorSearchTimeouts: Record<string, number>;
	hasOpenPositions: boolean;
}

export function evaluateDataIntegrityTriggers(state: DataIntegrityState): TriggerResult[] {
	const results: TriggerResult[] = [];

	for (const [symbol, gaps] of Object.entries(state.candleGapCounts)) {
		results.push({
			shouldActivate: gaps >= 3 && state.hasOpenPositions,
			scope: "global",
			reason: `${gaps} candle gaps for ${symbol} with open positions`,
		});
	}

	for (const [strategyId, count] of Object.entries(state.vectorSearchTimeouts)) {
		results.push({
			shouldActivate: count >= 3,
			scope: "strategy",
			scopeTarget: strategyId,
			reason: `vector search timeout ${count}x for strategy ${strategyId}`,
		});
	}

	return results;
}

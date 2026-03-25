/**
 * ReadinessResetService
 *
 * Handles automated score resets triggered by adverse events:
 * - Loss limit breach → reset paper score to 0 for affected strategy
 * - Kill switch activation → reset risk score to 0 for all strategies under the user
 * - Strategy code change → reset backtest score to 0 for the strategy
 *
 * All resets are idempotent: calling them multiple times has no additional
 * negative effect — the underlying storage layer is expected to insert a new
 * zero-score record rather than deleting history.
 */

export interface ReadinessResetDeps {
	/** Insert a zero paper-score record for the given strategyId */
	resetPaperScore: (strategyId: string) => Promise<void>;
	/** Insert a zero risk-score record for the given strategyId */
	resetRiskScore: (strategyId: string) => Promise<void>;
	/** Insert a zero backtest-score record for the given strategyId */
	resetBacktestScore: (strategyId: string) => Promise<void>;
	/** Return all strategy ids that belong to the given userId */
	listStrategiesForUser: (userId: string) => Promise<Array<{ id: string }>>;
}

export interface LossLimitBreachEvent {
	strategyId: string;
	userId: string;
}

export interface KillSwitchActivatedEvent {
	userId: string;
}

export interface StrategyCodeChangedEvent {
	strategyId: string;
}

export class ReadinessResetService {
	constructor(private readonly deps: ReadinessResetDeps) {}

	/**
	 * Called when a loss limit breach is detected.
	 * Resets the paper score component for the affected strategy.
	 */
	async onLossLimitBreach(event: LossLimitBreachEvent): Promise<void> {
		await this.deps.resetPaperScore(event.strategyId);
	}

	/**
	 * Called when the kill switch is activated for a user.
	 * Resets the risk score component for ALL strategies owned by that user.
	 */
	async onKillSwitchActivated(event: KillSwitchActivatedEvent): Promise<void> {
		const strategies = await this.deps.listStrategiesForUser(event.userId);
		await Promise.all(strategies.map((s) => this.deps.resetRiskScore(s.id)));
	}

	/**
	 * Called when a strategy's code changes (new version deployed).
	 * Resets the backtest score component for that strategy.
	 */
	async onStrategyCodeChanged(event: StrategyCodeChangedEvent): Promise<void> {
		await this.deps.resetBacktestScore(event.strategyId);
	}
}

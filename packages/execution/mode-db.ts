import type { ExecutionMode, ExecutionModeDeps, SafetyGateStatus } from "./types.js";

export interface ExecutionModeDbDeps {
	loadStrategyMode: (strategyId: string) => Promise<string | null>;
	saveStrategyMode: (strategyId: string, mode: string) => Promise<void>;
	hasActiveKillSwitch: () => Promise<boolean>;
	hasDailyLossLimit: () => Promise<boolean>;
}

export class ExecutionModeDbService implements ExecutionModeDeps {
	constructor(private readonly deps: ExecutionModeDbDeps) {}

	async loadMode(strategyId: string): Promise<ExecutionMode> {
		const mode = await this.deps.loadStrategyMode(strategyId);
		if (!mode) return "analysis";
		return mode as ExecutionMode;
	}

	async saveMode(strategyId: string, mode: ExecutionMode): Promise<void> {
		await this.deps.saveStrategyMode(strategyId, mode);
	}

	async getSafetyGateStatus(): Promise<SafetyGateStatus> {
		const [killSwitchEnabled, dailyLossLimitConfigured] = await Promise.all([
			this.deps.hasActiveKillSwitch(),
			this.deps.hasDailyLossLimit(),
		]);
		return { killSwitchEnabled, dailyLossLimitConfigured };
	}
}

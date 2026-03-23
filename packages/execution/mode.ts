import { type ExecutionMode, type ExecutionModeDeps, ModeTransitionError } from "./types.js";

/** Determines whether a mode should trigger alerts. */
export function isActionable(mode: ExecutionMode): boolean {
	return mode !== "analysis";
}

/** Determines whether a mode should create orders. */
export function requiresOrder(mode: ExecutionMode): boolean {
	return mode === "paper" || mode === "live";
}

/** Per-strategy execution mode management with safety gates. */
export class ExecutionModeService {
	constructor(private readonly deps: ExecutionModeDeps) {}

	async getMode(strategyId: string): Promise<ExecutionMode> {
		return this.deps.loadMode(strategyId);
	}

	async setMode(strategyId: string, mode: ExecutionMode): Promise<void> {
		if (mode === "live") {
			const status = await this.deps.getSafetyGateStatus();
			if (!status.killSwitchEnabled) {
				const current = await this.deps.loadMode(strategyId);
				throw new ModeTransitionError(current, "live", "kill switch is not enabled");
			}
			if (!status.dailyLossLimitConfigured) {
				const current = await this.deps.loadMode(strategyId);
				throw new ModeTransitionError(current, "live", "daily loss limit is not configured");
			}
		}

		await this.deps.saveMode(strategyId, mode);
	}
}

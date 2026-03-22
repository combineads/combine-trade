export type ExecutionMode = "analysis" | "alert" | "paper" | "live";

export interface SafetyGateStatus {
	killSwitchEnabled: boolean;
	dailyLossLimitConfigured: boolean;
}

export class ModeTransitionError extends Error {
	constructor(
		public readonly from: ExecutionMode,
		public readonly to: ExecutionMode,
		reason: string,
	) {
		super(`Cannot transition from ${from} to ${to}: ${reason}`);
		this.name = "ModeTransitionError";
	}
}

export interface ExecutionModeDeps {
	loadMode: (strategyId: string) => Promise<ExecutionMode>;
	saveMode: (strategyId: string, mode: ExecutionMode) => Promise<void>;
	getSafetyGateStatus: () => Promise<SafetyGateStatus>;
}

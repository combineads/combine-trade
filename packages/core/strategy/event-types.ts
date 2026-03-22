import type { Timeframe } from "@combine/shared";
import type { SandboxFeature } from "./sandbox.js";

export interface StrategyEvent {
	id: string;
	strategyId: string;
	strategyVersion: number;
	exchange: string;
	symbol: string;
	timeframe: Timeframe;
	openTime: Date;
	direction: "long" | "short";
	features: SandboxFeature[];
	entryPrice: string;
	status: "active" | "labeled" | "expired";
	createdAt: Date;
}

export interface CreateStrategyEventInput {
	strategyId: string;
	strategyVersion: number;
	exchange: string;
	symbol: string;
	timeframe: Timeframe;
	openTime: Date;
	direction: "long" | "short";
	features: SandboxFeature[];
	entryPrice: string;
}

import type { Timeframe } from "@combine/shared";
import type { CreateStrategyEventInput, StrategyEvent } from "./event-types.js";

/**
 * Strategy event repository interface.
 * Concrete implementations live in workers.
 */
export interface StrategyEventRepository {
	insert(input: CreateStrategyEventInput): Promise<StrategyEvent>;
	findByStrategy(
		strategyId: string,
		strategyVersion: number,
		symbol: string,
		timeframe: Timeframe,
	): Promise<StrategyEvent[]>;
	findByRange(strategyId: string, from: Date, to: Date): Promise<StrategyEvent[]>;
}

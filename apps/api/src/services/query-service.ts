import type { StrategyEvent } from "../../../../packages/core/strategy/event-types.js";
import type { PatternStatistics } from "../../../../packages/core/vector/types.js";
import type { Candle } from "../../../../packages/candle/types.js";
import type { EventQueryOptions } from "../routes/events.js";
import type { CandleQueryOptions } from "../routes/candles.js";
import type { Order, OrderQueryOptions } from "../routes/orders.js";
import type { Alert, AlertQueryOptions } from "../routes/alerts.js";

type StrategyStats = PatternStatistics & {
	totalEvents: number;
	longCount: number;
	shortCount: number;
};

export interface QueryServiceDeps {
	findEventById: (id: string) => Promise<StrategyEvent | null>;
	findEventsByStrategy: (opts: EventQueryOptions) => Promise<{ items: StrategyEvent[]; total: number }>;
	getStrategyStatistics: (strategyId: string) => Promise<StrategyStats>;
	strategyExists: (id: string) => Promise<boolean>;
	findCandles: (opts: CandleQueryOptions) => Promise<{ items: Candle[]; total: number }>;
	findOrders: (opts: OrderQueryOptions) => Promise<{ items: Order[]; total: number }>;
	findAlerts: (opts: AlertQueryOptions) => Promise<{ items: Alert[]; total: number }>;
}

export class ApiQueryService {
	constructor(private readonly deps: QueryServiceDeps) {}

	async findEventById(id: string): Promise<StrategyEvent | null> {
		return this.deps.findEventById(id);
	}

	async findEventsByStrategy(
		opts: EventQueryOptions,
	): Promise<{ items: StrategyEvent[]; total: number }> {
		return this.deps.findEventsByStrategy(opts);
	}

	async getStrategyStatistics(strategyId: string): Promise<StrategyStats> {
		return this.deps.getStrategyStatistics(strategyId);
	}

	async strategyExists(id: string): Promise<boolean> {
		return this.deps.strategyExists(id);
	}

	async findCandles(
		opts: CandleQueryOptions,
	): Promise<{ items: Candle[]; total: number }> {
		return this.deps.findCandles(opts);
	}

	async findOrders(
		opts: OrderQueryOptions,
	): Promise<{ items: Order[]; total: number }> {
		return this.deps.findOrders(opts);
	}

	async findAlerts(
		opts: AlertQueryOptions,
	): Promise<{ items: Alert[]; total: number }> {
		return this.deps.findAlerts(opts);
	}
}

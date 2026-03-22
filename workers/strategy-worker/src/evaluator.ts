import type { CandleRepository } from "@combine/candle";
import type {
	CandleData,
	CreateStrategyEventInput,
	Strategy,
	StrategyEventRepository,
	StrategyExecutor,
} from "@combine/core/strategy";
import type { Timeframe } from "@combine/shared";
import { createLogger } from "@combine/shared";
import { Channels } from "@combine/shared/event-bus/channels.js";
import type { EventPublisher } from "@combine/shared/event-bus/types.js";

const logger = createLogger("strategy-evaluator");

export interface StrategyEvaluatorDeps {
	executor: StrategyExecutor;
	strategyEventRepo: StrategyEventRepository;
	candleRepo: CandleRepository;
	publisher: EventPublisher;
	findActiveStrategies: (symbol: string, timeframe: Timeframe) => Promise<Strategy[]>;
}

export interface EvaluationResult {
	strategyId: string;
	strategyName: string;
	success: boolean;
	eventsCreated: number;
	error?: string;
}

/**
 * Evaluates all active strategies for a given candle close event.
 * Each strategy is evaluated independently — one failure doesn't block others.
 */
export class StrategyEvaluator {
	private _lastEvaluationTime: Date | null = null;
	private _activeCount = 0;

	constructor(private readonly deps: StrategyEvaluatorDeps) {}

	get lastEvaluationTime(): Date | null {
		return this._lastEvaluationTime;
	}

	get activeStrategyCount(): number {
		return this._activeCount;
	}

	async evaluate(
		exchange: string,
		symbol: string,
		timeframe: Timeframe,
		openTime: Date,
	): Promise<EvaluationResult[]> {
		const strategies = await this.deps.findActiveStrategies(symbol, timeframe);
		this._activeCount = strategies.length;

		if (strategies.length === 0) {
			logger.info(
				{ exchange, symbol, timeframe },
				"No active strategies for this symbol/timeframe",
			);
			return [];
		}

		// Load candle data for all strategies
		const candles = await this.loadCandleData(exchange, symbol, timeframe);

		const results: EvaluationResult[] = [];

		for (const strategy of strategies) {
			try {
				const result = await this.evaluateStrategy(
					strategy,
					exchange,
					symbol,
					timeframe,
					openTime,
					candles,
				);
				results.push(result);
			} catch (err) {
				const errorMsg = (err as Error).message;
				logger.warn(
					{ strategyId: strategy.id, strategyName: strategy.name, error: errorMsg },
					"Strategy evaluation failed",
				);
				results.push({
					strategyId: strategy.id,
					strategyName: strategy.name,
					success: false,
					eventsCreated: 0,
					error: errorMsg,
				});
			}
		}

		this._lastEvaluationTime = new Date();
		return results;
	}

	private async evaluateStrategy(
		strategy: Strategy,
		exchange: string,
		symbol: string,
		timeframe: Timeframe,
		openTime: Date,
		candles: CandleData,
	): Promise<EvaluationResult> {
		const sandboxResult = await this.deps.executor.execute({
			code: strategy.code,
			symbol,
			timeframe,
			candles,
			barIndex: candles.close.length - 1,
		});

		let eventsCreated = 0;

		// If features were defined, create a strategy event
		if (sandboxResult.features.length > 0) {
			const input: CreateStrategyEventInput = {
				strategyId: strategy.id,
				strategyVersion: strategy.version,
				exchange,
				symbol,
				timeframe,
				openTime,
				direction: strategy.direction === "both" ? "long" : strategy.direction,
				features: sandboxResult.features,
				entryPrice: candles.close[candles.close.length - 1]!.toString(),
			};

			const event = await this.deps.strategyEventRepo.insert(input);
			eventsCreated = 1;

			// Publish strategy_event_created
			await this.deps.publisher.publish(Channels.strategyEventCreated, {
				strategyId: strategy.id,
				strategyVersion: strategy.version,
				eventId: event.id,
				symbol,
				timeframe,
				openTime: openTime.toISOString(),
			});
		}

		return {
			strategyId: strategy.id,
			strategyName: strategy.name,
			success: true,
			eventsCreated,
		};
	}

	private async loadCandleData(
		exchange: string,
		symbol: string,
		timeframe: Timeframe,
	): Promise<CandleData> {
		// Load the last 300 candles for indicator computation
		const candles = await this.deps.candleRepo.findLatest(exchange, symbol, timeframe, 300);

		const open: number[] = [];
		const high: number[] = [];
		const low: number[] = [];
		const close: number[] = [];
		const volume: number[] = [];

		for (const c of candles) {
			open.push(Number(c.open));
			high.push(Number(c.high));
			low.push(Number(c.low));
			close.push(Number(c.close));
			volume.push(Number(c.volume));
		}

		return { open, high, low, close, volume };
	}
}

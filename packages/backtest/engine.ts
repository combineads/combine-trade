import type { Candle } from "@combine/candle";
import type {
	BacktestCheckpoint,
	BacktestConfig,
	BacktestEngineDeps,
	BacktestEvent,
	BacktestResult,
} from "./types.js";

let eventCounter = 0;

function generateEventId(): string {
	return `bt-evt-${Date.now()}-${++eventCounter}`;
}

function sortCandles(candles: Candle[]): Candle[] {
	return [...candles].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
}

function shouldCheckpoint(eventCount: number, checkpointEveryN: number): boolean {
	return eventCount > 0 && eventCount % checkpointEveryN === 0;
}

/** Run a full backtest from the beginning. */
export async function runBacktest(
	candles: Candle[],
	deps: BacktestEngineDeps,
	config?: BacktestConfig,
): Promise<BacktestResult> {
	const sorted = sortCandles(candles);
	const checkpointEveryN = config?.checkpointEveryN ?? 1000;
	const startedAt = Date.now();
	const events: BacktestEvent[] = [];

	for (let i = 0; i < sorted.length; i++) {
		const candle = sorted[i]!;
		const output = await deps.executeStrategy(candle);

		if (output) {
			events.push({
				eventId: generateEventId(),
				strategyId: deps.strategyId,
				version: deps.version,
				symbol: candle.symbol,
				exchange: candle.exchange,
				timeframe: candle.timeframe,
				entryPrice: output.entryPrice,
				direction: output.direction,
				openTime: candle.openTime,
				candleIndex: i,
			});

			if (shouldCheckpoint(events.length, checkpointEveryN)) {
				await deps.saveCheckpoint({
					lastCandleIndex: i,
					events: [...events],
					startedAt,
				});
			}
		}

		config?.onProgress?.(i + 1, sorted.length);
	}

	return {
		events,
		totalCandles: candles.length,
		durationMs: Date.now() - startedAt,
	};
}

/** Resume a backtest from a previously saved checkpoint. */
export async function resumeFromCheckpoint(
	candles: Candle[],
	checkpoint: BacktestCheckpoint,
	deps: BacktestEngineDeps,
	config?: BacktestConfig,
): Promise<BacktestResult> {
	const sorted = sortCandles(candles);
	const checkpointEveryN = config?.checkpointEveryN ?? 1000;
	const events: BacktestEvent[] = [...checkpoint.events];
	const startIndex = checkpoint.lastCandleIndex + 1;

	for (let i = startIndex; i < sorted.length; i++) {
		const candle = sorted[i]!;
		const output = await deps.executeStrategy(candle);

		if (output) {
			events.push({
				eventId: generateEventId(),
				strategyId: deps.strategyId,
				version: deps.version,
				symbol: candle.symbol,
				exchange: candle.exchange,
				timeframe: candle.timeframe,
				entryPrice: output.entryPrice,
				direction: output.direction,
				openTime: candle.openTime,
				candleIndex: i,
			});

			if (shouldCheckpoint(events.length, checkpointEveryN)) {
				await deps.saveCheckpoint({
					lastCandleIndex: i,
					events: [...events],
					startedAt: checkpoint.startedAt,
				});
			}
		}

		config?.onProgress?.(i + 1, sorted.length);
	}

	return {
		events,
		totalCandles: candles.length,
		durationMs: Date.now() - checkpoint.startedAt,
	};
}

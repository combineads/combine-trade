import { TIMEFRAME_MS, validateContinuity } from "@combine/candle";
import type { Candle, CandleGap } from "@combine/candle";
import type { ExchangeAdapter, ExchangeCandle } from "@combine/exchange";
import type { Exchange, Timeframe } from "@combine/shared";
import { createLogger } from "@combine/shared";

const logger = createLogger("gap-repair");
const PAGE_SIZE = 1000;

export interface RepairResult {
	gapsFound: number;
	candlesRepaired: number;
	remainingGaps: number;
	durationMs: number;
}

/** Interface for repository operations needed by gap repair */
export interface GapRepairRepository {
	findByRange(
		exchange: Exchange,
		symbol: string,
		timeframe: Timeframe,
		from: Date,
		to: Date,
	): Promise<Candle[]>;
	findLatestOpenTime(
		exchange: Exchange,
		symbol: string,
		timeframe: Timeframe,
	): Promise<Date | null>;
	upsertBatch(candles: Candle[], source?: string): Promise<void>;
}

/**
 * Detects and repairs continuity gaps in candle data using REST API backfill.
 * Injected with adapter and repository interfaces for testability.
 */
export class GapRepairService {
	constructor(
		private readonly adapter: ExchangeAdapter,
		private readonly repository: GapRepairRepository,
	) {}

	/** Detect gaps in stored candles for a given range */
	async detectGaps(
		exchange: Exchange,
		symbol: string,
		timeframe: Timeframe,
		from: Date,
		to: Date,
	): Promise<CandleGap[]> {
		const candles = await this.repository.findByRange(exchange, symbol, timeframe, from, to);
		return validateContinuity(candles);
	}

	/** Repair a specific gap by fetching missing candles via REST */
	async repairGap(
		symbol: string,
		timeframe: Timeframe,
		gapStart: Date,
		gapEnd: Date,
	): Promise<number> {
		const intervalMs = TIMEFRAME_MS[timeframe];
		let since = gapStart.getTime();
		const endMs = gapEnd.getTime();
		let totalRepaired = 0;

		while (since < endMs) {
			const remaining = Math.ceil((endMs - since) / intervalMs);
			const limit = Math.min(remaining, PAGE_SIZE);

			let rawCandles: ExchangeCandle[];
			try {
				rawCandles = await this.adapter.fetchOHLCV(symbol, timeframe, since, limit);
			} catch (err) {
				logger.warn(
					{ symbol, timeframe, since, error: (err as Error).message },
					"Exchange fetch failed during gap repair",
				);
				break;
			}

			if (rawCandles.length === 0) {
				logger.warn({ symbol, timeframe, since }, "Exchange returned no data for gap repair");
				break;
			}

			const candles: Candle[] = rawCandles.map((rc) => ({
				exchange: this.adapter.exchange,
				symbol,
				timeframe,
				openTime: new Date(rc.timestamp),
				open: rc.open.toString(),
				high: rc.high.toString(),
				low: rc.low.toString(),
				close: rc.close.toString(),
				volume: rc.volume.toString(),
				isClosed: true,
			}));

			await this.repository.upsertBatch(candles, "rest");
			totalRepaired += candles.length;

			// Advance since past the last fetched candle
			const lastTimestamp = rawCandles[rawCandles.length - 1]!.timestamp;
			since = lastTimestamp + intervalMs;
		}

		return totalRepaired;
	}

	/** Entry point for startup recovery: find gap, repair, re-validate */
	async repairAll(exchange: Exchange, symbol: string, timeframe: Timeframe): Promise<RepairResult> {
		const start = performance.now();
		const latestTime = await this.repository.findLatestOpenTime(exchange, symbol, timeframe);

		if (!latestTime) {
			return { gapsFound: 0, candlesRepaired: 0, remainingGaps: 0, durationMs: 0 };
		}

		const now = new Date();
		const gapStart = new Date(latestTime.getTime() + TIMEFRAME_MS[timeframe]);
		if (gapStart.getTime() >= now.getTime()) {
			return { gapsFound: 0, candlesRepaired: 0, remainingGaps: 0, durationMs: 0 };
		}

		// Detect initial gaps
		const initialGaps = await this.detectGaps(exchange, symbol, timeframe, latestTime, now);
		const gapsFound = initialGaps.length;

		if (gapsFound === 0) {
			return {
				gapsFound: 0,
				candlesRepaired: 0,
				remainingGaps: 0,
				durationMs: Math.round(performance.now() - start),
			};
		}

		// Repair
		const candlesRepaired = await this.repairGap(symbol, timeframe, gapStart, now);

		// Re-validate
		const remainingGaps = await this.detectGaps(exchange, symbol, timeframe, latestTime, now);

		if (remainingGaps.length > 0) {
			logger.warn(
				{
					exchange,
					symbol,
					timeframe,
					remainingGaps: remainingGaps.length,
					gapsFound,
					candlesRepaired,
				},
				"Gap repair incomplete — some gaps remain after repair attempt",
			);
		}

		return {
			gapsFound,
			candlesRepaired,
			remainingGaps: remainingGaps.length,
			durationMs: Math.round(performance.now() - start),
		};
	}
}

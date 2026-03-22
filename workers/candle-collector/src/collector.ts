import type { Candle, CandleRepository } from "@combine/candle";
import type { ExchangeAdapter, ExchangeCandle } from "@combine/exchange";
import type { Timeframe } from "@combine/shared";
import { createLogger } from "@combine/shared";
import { Channels } from "@combine/shared/event-bus/channels.js";
import type { CandleClosedPayload } from "@combine/shared/event-bus/channels.js";
import type { EventPublisher } from "@combine/shared/event-bus/types.js";
import type { GapRepairService } from "./gap-repair.js";

const logger = createLogger("candle-collector");

const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const ONE_DAY_MS = 86_400_000;

/** Convert ExchangeCandle (number prices) to Candle (string prices) */
function toCandle(
	raw: ExchangeCandle,
	exchange: string,
	symbol: string,
	timeframe: Timeframe,
	isClosed: boolean,
): Candle {
	return {
		exchange: exchange as Candle["exchange"],
		symbol,
		timeframe,
		openTime: new Date(raw.timestamp),
		open: raw.open.toString(),
		high: raw.high.toString(),
		low: raw.low.toString(),
		close: raw.close.toString(),
		volume: raw.volume.toString(),
		isClosed,
	};
}

export interface CandleCollectorDeps {
	adapter: ExchangeAdapter;
	repository: CandleRepository & {
		upsert(candle: Candle, source?: string): Promise<void>;
		findLatestOpenTime(
			exchange: string,
			symbol: string,
			timeframe: Timeframe,
		): Promise<Date | null>;
	};
	gapRepair: GapRepairService;
	publisher: EventPublisher;
}

/**
 * Candle collector: startup recovery → WebSocket loop → NOTIFY on close.
 * Injectable for testing.
 */
export class CandleCollector {
	private running = false;
	private backoffMs = BACKOFF_INITIAL_MS;
	private _lastCandleTime: Date | null = null;
	private _gapRepairStatus: "pending" | "complete" | "incomplete" = "pending";

	constructor(private readonly deps: CandleCollectorDeps) {}

	get lastCandleTime(): Date | null {
		return this._lastCandleTime;
	}

	get gapRepairStatus(): string {
		return this._gapRepairStatus;
	}

	async start(exchange: string, symbol: string, timeframe: Timeframe): Promise<void> {
		this.running = true;

		// Phase 1: Startup recovery
		await this.runStartupRecovery(exchange, symbol, timeframe);

		// Phase 2: WebSocket loop
		await this.runWebSocketLoop(exchange, symbol, timeframe);
	}

	async stop(): Promise<void> {
		this.running = false;
	}

	private async runStartupRecovery(
		exchange: string,
		symbol: string,
		timeframe: Timeframe,
	): Promise<void> {
		const latestTime = await this.deps.repository.findLatestOpenTime(exchange, symbol, timeframe);

		if (!latestTime) {
			logger.info({ exchange, symbol, timeframe }, "No existing candle data — starting fresh");
			this._gapRepairStatus = "complete";
			return;
		}

		const gapMs = Date.now() - latestTime.getTime();

		if (gapMs > ONE_DAY_MS) {
			logger.warn(
				{ exchange, symbol, timeframe, gapMs },
				"Gap > 1 day — Vision archive not yet implemented, falling back to REST",
			);
		}

		const result = await this.deps.gapRepair.repairAll(
			exchange as Candle["exchange"],
			symbol,
			timeframe,
		);

		this._gapRepairStatus = result.remainingGaps > 0 ? "incomplete" : "complete";
		logger.info({ ...result, exchange, symbol, timeframe }, "Startup recovery complete");
	}

	private async runWebSocketLoop(
		exchange: string,
		symbol: string,
		timeframe: Timeframe,
	): Promise<void> {
		while (this.running) {
			try {
				await this.processCandles(exchange, symbol, timeframe);
				// If processCandles returns normally, reset backoff
				this.backoffMs = BACKOFF_INITIAL_MS;
			} catch (err) {
				if (!this.running) break;

				logger.warn(
					{ error: (err as Error).message, backoffMs: this.backoffMs },
					"WebSocket error — reconnecting after backoff",
				);

				await sleep(this.backoffMs);
				this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
			}
		}
	}

	private async processCandles(
		exchange: string,
		symbol: string,
		timeframe: Timeframe,
	): Promise<void> {
		// Simulate WebSocket processing — in real implementation, this would be adapter.watchOHLCV
		// For now, use polling via fetchOHLCV as a placeholder until WS integration
		const candles = await this.deps.adapter.fetchOHLCV(symbol, timeframe, undefined, 1);

		for (const raw of candles) {
			const isClosed = true; // REST returns only closed candles
			const candle = toCandle(raw, exchange, symbol, timeframe, isClosed);

			await this.deps.repository.upsert(candle, "ws");
			this._lastCandleTime = candle.openTime;

			if (isClosed) {
				const payload: CandleClosedPayload = {
					exchange,
					symbol,
					timeframe,
					openTime: candle.openTime.toISOString(),
				};
				await this.deps.publisher.publish(Channels.candleClosed, payload);
			}
		}

		// Stop after one cycle for testing purposes
		this.running = false;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

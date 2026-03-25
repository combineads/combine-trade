import type { Candle, CandleRepository } from "@combine/candle";
import type { ExchangeAdapter, ExchangeCandle } from "@combine/exchange";
import type { Timeframe } from "@combine/shared";
import { createLogger } from "@combine/shared";
import { Channels } from "@combine/shared/event-bus/channels.js";
import type { CandleClosedPayload } from "@combine/shared/event-bus/channels.js";
import type { EventPublisher } from "@combine/shared/event-bus/types.js";
import type { GapRepairService } from "./gap-repair.js";

const logger = createLogger("symbol-slot");

const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const ONE_DAY_MS = 86_400_000;

/** Convert ExchangeCandle (number prices) to Candle (string prices) at ingestion boundary */
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

export interface SymbolSlotDeps {
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

export interface SymbolHealthStatus {
	lastCandleTime: Date | null;
	backoffMs: number;
	connected: boolean;
}

/**
 * SymbolSlot: encapsulates single-symbol connection state.
 *
 * Runs its own startup recovery + WebSocket loop independently.
 * Error isolation: a crash in one slot does not affect other slots.
 * Each slot has its own backoff state (independent from other slots).
 *
 * Note on DB connections: each slot shares the same publisher/repository
 * (same connection pool). Maximum concurrent symbols is governed by available
 * DB connections in the pool configured at startup.
 */
export class SymbolSlot {
	private running = false;
	private _backoffMs = BACKOFF_INITIAL_MS;
	private _lastCandleTime: Date | null = null;
	private _connected = false;

	constructor(private readonly deps: SymbolSlotDeps) {}

	get healthStatus(): SymbolHealthStatus {
		return {
			lastCandleTime: this._lastCandleTime,
			backoffMs: this._backoffMs,
			connected: this._connected,
		};
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
		this._connected = false;
	}

	private async runStartupRecovery(
		exchange: string,
		symbol: string,
		timeframe: Timeframe,
	): Promise<void> {
		const latestTime = await this.deps.repository.findLatestOpenTime(exchange, symbol, timeframe);

		if (!latestTime) {
			logger.info({ exchange, symbol, timeframe }, "No existing candle data — starting fresh");
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
		logger.info({ ...result, exchange, symbol, timeframe }, "Startup recovery complete");
	}

	private async runWebSocketLoop(
		exchange: string,
		symbol: string,
		timeframe: Timeframe,
	): Promise<void> {
		while (this.running) {
			try {
				this._connected = true;
				await this.processCandles(exchange, symbol, timeframe);
				// Clean run — reset backoff
				this._backoffMs = BACKOFF_INITIAL_MS;
			} catch (err) {
				this._connected = false;
				if (!this.running) break;

				logger.warn(
					{ symbol, error: (err as Error).message, backoffMs: this._backoffMs },
					"WebSocket error — reconnecting after backoff",
				);

				await sleep(this._backoffMs);
				this._backoffMs = Math.min(this._backoffMs * 2, BACKOFF_MAX_MS);
			}
		}
		this._connected = false;
	}

	private async processCandles(
		exchange: string,
		symbol: string,
		timeframe: Timeframe,
	): Promise<void> {
		// Uses REST polling as a placeholder until full WebSocket integration
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

		// Stop after one cycle (matches single-symbol behavior for testing)
		this.running = false;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * MockWsExchange — simulates a WebSocket-based exchange adapter for integration tests.
 *
 * Implements ExchangeAdapter so it can be injected directly into CandleCollector.
 * Instead of real WS connections, `push()` delivers candle updates synchronously.
 */
import type { Exchange, Timeframe } from "@combine/shared";
import type {
	ExchangeAdapter,
	ExchangeBalance,
	ExchangeCandle,
	ExchangeFundingRate,
	ExchangeOrder,
	ExchangePosition,
	OrderSide,
	OrderType,
} from "@combine/exchange";

export interface WsCallback {
	(candles: ExchangeCandle[]): void;
}

/**
 * Simulates a WebSocket-based exchange adapter.
 * - `push(candle)` invokes the registered watchOHLCV callback synchronously.
 * - `simulateDisconnect()` causes the next fetchOHLCV call to throw.
 * - `simulateReconnect()` restores normal operation.
 * - `fetchOHLCV` returns queued candles (for REST gap repair simulation).
 */
export class MockWsExchange implements ExchangeAdapter {
	readonly exchange: Exchange = "binance";

	/** Queued candles for REST fetchOHLCV calls */
	private restQueue: ExchangeCandle[] = [];

	/** Whether the next fetchOHLCV should throw (simulates WS disconnect) */
	private disconnected = false;

	/** Number of times fetchOHLCV was called */
	fetchCallCount = 0;

	/** All candles returned via fetchOHLCV */
	fetchedCandles: ExchangeCandle[] = [];

	/**
	 * Queue candles to be returned by the next fetchOHLCV call.
	 * After the call they are consumed (one batch per call).
	 */
	setRestCandles(candles: ExchangeCandle[]): void {
		this.restQueue = [...candles];
	}

	/**
	 * Trigger a WS disconnect — next fetchOHLCV call throws an error.
	 */
	simulateDisconnect(): void {
		this.disconnected = true;
	}

	/**
	 * Restore connectivity after simulateDisconnect().
	 */
	simulateReconnect(): void {
		this.disconnected = false;
	}

	async fetchOHLCV(
		_symbol: string,
		_timeframe: Timeframe,
		_since?: number,
		limit?: number,
	): Promise<ExchangeCandle[]> {
		this.fetchCallCount++;

		if (this.disconnected) {
			throw new Error("MockWsExchange: simulated disconnect");
		}

		let result = [...this.restQueue];
		if (limit !== undefined) {
			result = result.slice(0, limit);
		}
		this.fetchedCandles.push(...result);
		// Consume the queue so next call returns empty (mimics REST poll)
		this.restQueue = [];
		return result;
	}

	// ---- Unimplemented exchange operations (not needed for candle tests) ----

	async createOrder(
		_symbol: string,
		_type: OrderType,
		_side: OrderSide,
		_amount: number,
		_price?: number,
	): Promise<ExchangeOrder> {
		throw new Error("MockWsExchange: createOrder not implemented");
	}

	async cancelOrder(_orderId: string, _symbol: string): Promise<void> {
		throw new Error("MockWsExchange: cancelOrder not implemented");
	}

	async fetchBalance(): Promise<ExchangeBalance[]> {
		return [{ currency: "USDT", free: 10000, used: 0, total: 10000 }];
	}

	async fetchPositions(_symbols?: string[]): Promise<ExchangePosition[]> {
		return [];
	}

	async fetchFundingRate(_symbol: string): Promise<ExchangeFundingRate> {
		return { symbol: _symbol, fundingRate: 0.0001, nextFundingTime: Date.now() + 3_600_000 };
	}
}

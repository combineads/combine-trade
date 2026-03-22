import type { Exchange, Timeframe } from "@combine/shared";
import type { Candle } from "./types.js";

/** Repository interface for candle CRUD operations. Implementation is in apps/workers layer. */
export interface CandleRepository {
	insert(candle: Candle): Promise<void>;
	upsert(candle: Candle): Promise<void>;
	findByRange(
		exchange: Exchange,
		symbol: string,
		timeframe: Timeframe,
		from: Date,
		to: Date,
	): Promise<Candle[]>;
	findLatest(
		exchange: Exchange,
		symbol: string,
		timeframe: Timeframe,
		limit?: number,
	): Promise<Candle[]>;
}

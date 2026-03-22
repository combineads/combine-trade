import type { CandleRepository } from "@combine/candle";
import type { StrategyRepository } from "@combine/core/strategy";
import { createToken } from "./types.js";

/**
 * Service tokens for the IoC container.
 * Actual service types will be refined as domain services are implemented.
 */
export const Tokens = {
	Logger: createToken<{ info: (msg: string) => void }>("Logger"),
	Database: createToken<{ query: (sql: string) => Promise<unknown> }>("Database"),
	EventBus: createToken<{ publish: (event: string, data: unknown) => void }>("EventBus"),
	CandleRepository: createToken<CandleRepository>("CandleRepository"),
	StrategyRepository: createToken<StrategyRepository>("StrategyRepository"),
} as const;

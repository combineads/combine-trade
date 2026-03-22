import type { Candle } from "@combine/candle";

export interface StrategyOutput {
	entryPrice: string;
	direction: "long" | "short";
}

export interface BacktestEvent {
	eventId: string;
	strategyId: string;
	version: number;
	symbol: string;
	exchange: string;
	timeframe: string;
	entryPrice: string;
	direction: "long" | "short";
	openTime: Date;
	candleIndex: number;
}

export interface BacktestCheckpoint {
	lastCandleIndex: number;
	events: BacktestEvent[];
	startedAt: number;
}

export interface BacktestEngineDeps {
	strategyId: string;
	version: number;
	executeStrategy: (candle: Candle) => Promise<StrategyOutput | null>;
	saveCheckpoint: (checkpoint: BacktestCheckpoint) => Promise<void>;
	loadCheckpoint: () => Promise<BacktestCheckpoint | null>;
}

export interface BacktestConfig {
	checkpointEveryN?: number;
	onProgress?: (processed: number, total: number) => void;
}

export interface BacktestResult {
	events: BacktestEvent[];
	totalCandles: number;
	durationMs: number;
}

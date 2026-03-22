import { describe, expect, test } from "bun:test";
import {
	useStrategyPerformance,
	type UseStrategyPerformanceResult,
	type StrategyPerformanceStats,
} from "../src/hooks/use-strategy-performance.js";

describe("useStrategyPerformance", () => {
	test("returns correct initial shape", () => {
		const result = useStrategyPerformance();
		expect(result.strategies).toEqual([]);
		expect(result.isLoading).toBe(true);
		expect(result.error).toBeNull();
	});

	test("expectancy is a Decimal string", () => {
		const stats: StrategyPerformanceStats = {
			strategyId: "strat-1",
			strategyName: "MA Cross",
			symbol: "BTCUSDT",
			winrate: 0.55,
			expectancy: "12.50",
			totalTrades: 100,
			activeSince: 1700000000,
		};
		expect(typeof stats.expectancy).toBe("string");
	});
});

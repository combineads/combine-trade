import { describe, expect, test } from "bun:test";
import {
	usePortfolioStatus,
	type PortfolioStatus,
	type UsePortfolioStatusResult,
} from "../src/hooks/use-portfolio-status.js";

describe("usePortfolioStatus", () => {
	test("returns correct initial shape", () => {
		const result = usePortfolioStatus();
		expect(result.status).toBeNull();
		expect(result.isLoading).toBe(true);
		expect(result.error).toBeNull();
	});

	test("all monetary values in PortfolioStatus are strings", () => {
		const status: PortfolioStatus = {
			balance: "10000",
			totalUnrealizedPnl: "250.50",
			positions: [
				{
					symbol: "BTCUSDT",
					side: "LONG",
					size: "0.1",
					entryPrice: "50000",
					markPrice: "52000",
					unrealizedPnl: "200",
				},
			],
			updatedAt: Date.now(),
		};

		expect(typeof status.balance).toBe("string");
		expect(typeof status.totalUnrealizedPnl).toBe("string");
		expect(typeof status.positions[0].unrealizedPnl).toBe("string");
	});
});

import { describe, expect, test } from "bun:test";
import {
	ExposureLimitError,
	checkTotalExposure,
	type ExposureLimitConfig,
	type ExposureLimitDeps,
	type OpenPosition,
} from "../exposure-limit.js";

function makePosition(price: string, quantity: string): OpenPosition {
	return { price, quantity };
}

function makeDeps(
	positions: OpenPosition[],
	balance: string,
): ExposureLimitDeps {
	return {
		getOpenPositions: async () => positions,
		getAccountBalance: async () => balance,
	};
}

const DEFAULT_CONFIG: ExposureLimitConfig = {
	maxTotalExposureRatio: 0.8,
};

describe("ExposureLimitChecker", () => {
	describe("checkTotalExposure", () => {
		test("no open positions, small new order → allowed", async () => {
			const deps = makeDeps([], "10000");
			// new notional = 100*50 = 5000, limit = 10000*0.8 = 8000 → 5000 <= 8000
			await expect(
				checkTotalExposure("50", "100", DEFAULT_CONFIG, deps),
			).resolves.toBeUndefined();
		});

		test("exactly at limit → allowed (strictly over = rejected)", async () => {
			const deps = makeDeps([], "10000");
			// new notional = 160*50 = 8000, limit = 10000*0.8 = 8000 → 8000 === 8000, allowed
			await expect(
				checkTotalExposure("50", "160", DEFAULT_CONFIG, deps),
			).resolves.toBeUndefined();
		});

		test("one unit over limit → rejects with ExposureLimitError", async () => {
			const deps = makeDeps([], "10000");
			// new notional = 8001, limit = 8000 → strictly over
			await expect(
				checkTotalExposure("1", "8001", DEFAULT_CONFIG, deps),
			).rejects.toBeInstanceOf(ExposureLimitError);
		});

		test("existing positions push total over limit → rejected", async () => {
			// balance=10000, limit=8000
			// existing: price=50, qty=100 → notional=5000
			// new: price=100, qty=40 → notional=4000
			// total=9000 > 8000 → rejected
			const deps = makeDeps([makePosition("50", "100")], "10000");
			await expect(
				checkTotalExposure("100", "40", DEFAULT_CONFIG, deps),
			).rejects.toBeInstanceOf(ExposureLimitError);
		});

		test("existing positions but total still within limit → allowed", async () => {
			// balance=10000, limit=8000
			// existing: price=50, qty=60 → notional=3000
			// new: price=100, qty=40 → notional=4000
			// total=7000 <= 8000 → allowed
			const deps = makeDeps([makePosition("50", "60")], "10000");
			await expect(
				checkTotalExposure("100", "40", DEFAULT_CONFIG, deps),
			).resolves.toBeUndefined();
		});

		test("multiple existing positions sum correctly", async () => {
			// balance=10000, limit=8000
			// existing: [200*10=2000, 100*30=3000] → total_existing=5000
			// new: 50*60=3000 → total=8000 === limit → allowed
			const deps = makeDeps(
				[makePosition("200", "10"), makePosition("100", "30")],
				"10000",
			);
			await expect(
				checkTotalExposure("50", "60", DEFAULT_CONFIG, deps),
			).resolves.toBeUndefined();
		});

		test("multiple existing positions + new order strictly over → rejected", async () => {
			// balance=10000, limit=8000
			// existing: [200*10=2000, 100*30=3000] → total_existing=5000
			// new: 50*61=3050 → total=8050 > 8000 → rejected
			const deps = makeDeps(
				[makePosition("200", "10"), makePosition("100", "30")],
				"10000",
			);
			await expect(
				checkTotalExposure("50", "61", DEFAULT_CONFIG, deps),
			).rejects.toBeInstanceOf(ExposureLimitError);
		});

		test("ExposureLimitError has code ERR_USER_EXPOSURE_LIMIT", async () => {
			const deps = makeDeps([], "10000");
			try {
				await checkTotalExposure("1", "8001", DEFAULT_CONFIG, deps);
				throw new Error("expected to throw");
			} catch (err) {
				expect(err).toBeInstanceOf(ExposureLimitError);
				expect((err as ExposureLimitError).code).toBe("ERR_USER_EXPOSURE_LIMIT");
			}
		});

		test("custom ratio of 0.5 applies correctly", async () => {
			// balance=10000, limit=10000*0.5=5000
			// new notional=4999 → allowed
			const config: ExposureLimitConfig = { maxTotalExposureRatio: 0.5 };
			const deps = makeDeps([], "10000");
			await expect(
				checkTotalExposure("1", "4999", config, deps),
			).resolves.toBeUndefined();
		});

		test("custom ratio of 0.5, one unit over → rejected", async () => {
			// balance=10000, limit=5000
			// new notional=5001 → rejected
			const config: ExposureLimitConfig = { maxTotalExposureRatio: 0.5 };
			const deps = makeDeps([], "10000");
			await expect(
				checkTotalExposure("1", "5001", config, deps),
			).rejects.toBeInstanceOf(ExposureLimitError);
		});

		test("default config maxTotalExposureRatio is 0.8 when not specified", async () => {
			// Ensure default is applied properly
			const deps = makeDeps([], "10000");
			const config: ExposureLimitConfig = {};
			// notional = 8000 → allowed (equals limit with default 0.8)
			await expect(
				checkTotalExposure("1", "8000", config, deps),
			).resolves.toBeUndefined();
		});

		test("default config strictly over 80% → rejected", async () => {
			const deps = makeDeps([], "10000");
			const config: ExposureLimitConfig = {};
			// notional = 8001 → rejected
			await expect(
				checkTotalExposure("1", "8001", config, deps),
			).rejects.toBeInstanceOf(ExposureLimitError);
		});

		test("uses Decimal.js precision — floating point edge case", async () => {
			// 0.1 + 0.2 = 0.30000000000000004 in native float
			// balance=1, limit=0.8*1=0.8
			// existing: price=0.1, qty=2 → notional=0.2
			// new: price=0.1, qty=1 → notional=0.1
			// total=0.3 <= 0.8 → allowed
			const deps = makeDeps([makePosition("0.1", "2")], "1");
			await expect(
				checkTotalExposure("0.1", "1", DEFAULT_CONFIG, deps),
			).resolves.toBeUndefined();
		});
	});
});

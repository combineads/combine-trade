import { describe, expect, mock, test } from "bun:test";
import {
	type OrderRequest,
	type OrderResult,
	type PaperOrderMatcher,
	type PaperOrderResult,
	PaperRouter,
	type RealOrderExecutor,
	formatAlertMessage,
} from "../paper-router.js";

function makeOrderRequest(): OrderRequest {
	return {
		symbol: "BTCUSDT",
		side: "BUY",
		size: "0.1",
		price: "50000",
	};
}

function makePaperResult(): PaperOrderResult {
	return {
		type: "paper",
		paperId: "paper-1",
		symbol: "BTCUSDT",
		side: "BUY",
		size: "0.1",
		filledPrice: "50000",
		filledAt: Date.now(),
	};
}

function makeRealResult(): OrderResult {
	return {
		type: "real",
		orderId: "real-1",
		symbol: "BTCUSDT",
		side: "BUY",
		size: "0.1",
		filledPrice: "50000",
		filledAt: Date.now(),
	};
}

describe("PaperRouter", () => {
	test("paper mode routes to paper matcher, not real executor", async () => {
		const paperMatcher: PaperOrderMatcher = {
			matchOrder: mock(() => Promise.resolve(makePaperResult())),
		};
		const realExecutor: RealOrderExecutor = {
			executeOrder: mock(() => Promise.resolve(makeRealResult())),
		};
		const router = new PaperRouter(realExecutor, paperMatcher);
		const result = await router.execute(makeOrderRequest(), "paper");

		expect(result.type).toBe("paper");
		expect(paperMatcher.matchOrder).toHaveBeenCalledTimes(1);
		expect(realExecutor.executeOrder).not.toHaveBeenCalled();
	});

	test("live mode routes to real executor, not paper matcher", async () => {
		const paperMatcher: PaperOrderMatcher = {
			matchOrder: mock(() => Promise.resolve(makePaperResult())),
		};
		const realExecutor: RealOrderExecutor = {
			executeOrder: mock(() => Promise.resolve(makeRealResult())),
		};
		const router = new PaperRouter(realExecutor, paperMatcher);
		const result = await router.execute(makeOrderRequest(), "live");

		expect(result.type).toBe("real");
		expect(realExecutor.executeOrder).toHaveBeenCalledTimes(1);
		expect(paperMatcher.matchOrder).not.toHaveBeenCalled();
	});

	test("paper result has type: paper discriminator", async () => {
		const paperMatcher: PaperOrderMatcher = {
			matchOrder: mock(() => Promise.resolve(makePaperResult())),
		};
		const realExecutor: RealOrderExecutor = {
			executeOrder: mock(() => Promise.resolve(makeRealResult())),
		};
		const router = new PaperRouter(realExecutor, paperMatcher);
		const result = await router.execute(makeOrderRequest(), "paper");

		expect((result as PaperOrderResult).type).toBe("paper");
		expect((result as PaperOrderResult).paperId).toBe("paper-1");
	});
});

describe("formatAlertMessage", () => {
	test("paper mode alert starts with [PAPER]", () => {
		const msg = formatAlertMessage("BUY BTCUSDT", "paper");
		expect(msg).toStartWith("[PAPER] ");
		expect(msg).toContain("BUY BTCUSDT");
	});

	test("live mode alert has no [PAPER] prefix", () => {
		const msg = formatAlertMessage("BUY BTCUSDT", "live");
		expect(msg).not.toContain("[PAPER]");
		expect(msg).toBe("BUY BTCUSDT");
	});

	test("analysis mode alert has no prefix", () => {
		const msg = formatAlertMessage("Signal detected", "analysis");
		expect(msg).not.toContain("[PAPER]");
	});
});

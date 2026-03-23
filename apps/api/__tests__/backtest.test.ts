import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import type { BacktestReport } from "@combine/backtest/report.js";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import { type BacktestRouteDeps, backtestRoutes } from "../src/routes/backtest.js";

const MOCK_REPORT: BacktestReport = {
	totalEvents: 10,
	winCount: 6,
	lossCount: 4,
	timeExitCount: 1,
	winrate: 0.6,
	expectancy: 0.42,
	avgWin: 2.1,
	avgLoss: 1.5,
	maxConsecutiveLoss: 2,
	maxDrawdownPct: 3.5,
	simultaneousTpSlRatio: 0.1,
	coldStartEvents: 10,
	coldStartEndTime: null,
	monthlyBreakdown: [],
	slippageStats: null,
};

function createMockDeps(overrides: Partial<BacktestRouteDeps> = {}): BacktestRouteDeps {
	return {
		runBacktest: async () => MOCK_REPORT,
		strategyExists: async (id: string) => id === "strat-1",
		...overrides,
	};
}

function createApp(deps?: BacktestRouteDeps) {
	return new Elysia().use(errorHandlerPlugin).use(backtestRoutes(deps ?? createMockDeps()));
}

const BASE = "http://localhost/api/v1/backtest";

function postJson(body: Record<string, unknown>) {
	return new Request(BASE, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

const VALID_BODY = {
	strategyId: "strat-1",
	symbol: "BTC/USDT",
	timeframe: "1h",
	from: "2025-01-01T00:00:00Z",
	to: "2025-06-01T00:00:00Z",
};

describe("Backtest route", () => {
	test("POST /backtest with valid config → 200 with report", async () => {
		const app = createApp();
		const res = await app.handle(postJson(VALID_BODY));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.totalEvents).toBe(10);
		expect(body.data.winrate).toBe(0.6);
		expect(body.data.expectancy).toBe(0.42);
	});

	test("POST /backtest missing strategyId → 422", async () => {
		const app = createApp();
		const { strategyId: _, ...noStrategy } = VALID_BODY;
		const res = await app.handle(postJson(noStrategy));
		expect(res.status).toBe(422);
	});

	test("POST /backtest from equal to to → 422", async () => {
		const app = createApp();
		const res = await app.handle(
			postJson({ ...VALID_BODY, from: "2025-01-01T00:00:00Z", to: "2025-01-01T00:00:00Z" }),
		);
		expect(res.status).toBe(422);
		const body = JSON.parse(await res.text());
		expect(body.error.code).toBe("VALIDATION_ERROR");
	});

	test("POST /backtest from after to → 422", async () => {
		const app = createApp();
		const res = await app.handle(
			postJson({ ...VALID_BODY, from: "2025-06-01T00:00:00Z", to: "2025-01-01T00:00:00Z" }),
		);
		expect(res.status).toBe(422);
	});

	test("POST /backtest unknown strategy → 404", async () => {
		const app = createApp();
		const res = await app.handle(postJson({ ...VALID_BODY, strategyId: "nonexistent" }));
		expect(res.status).toBe(404);
		const body = JSON.parse(await res.text());
		expect(body.error.code).toBe("NOT_FOUND");
	});

	test("POST /backtest engine failure → 500 BACKTEST_FAILED", async () => {
		const deps = createMockDeps({
			runBacktest: async () => {
				throw new Error("engine crashed");
			},
		});
		const app = createApp(deps);
		const res = await app.handle(postJson(VALID_BODY));
		expect(res.status).toBe(500);
		const body = JSON.parse(await res.text());
		expect(body.error.code).toBe("BACKTEST_FAILED");
	});
});

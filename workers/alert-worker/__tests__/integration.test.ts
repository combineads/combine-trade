import { describe, expect, test, mock } from "bun:test";
import { createAlertWorkerEntryDeps, type AlertWorkerEntryDeps } from "../src/entry.js";

function makeDeps(overrides: Partial<AlertWorkerEntryDeps> = {}): AlertWorkerEntryDeps {
	return {
		subscribe: mock((_channel: string, _handler: (payload: unknown) => void) => {
			return { unsubscribe: mock(() => {}) };
		}),
		loadExecutionMode: mock(() => Promise.resolve("alert" as const)),
		isAlertSent: mock(() => Promise.resolve(false)),
		saveAlert: mock(() => Promise.resolve()),
		sendSlackWebhook: mock(() => Promise.resolve()),
		loadAlertContext: mock(() =>
			Promise.resolve({
				strategyName: "Double-BB-LONG",
				symbol: "BTCUSDT",
				timeframe: "5m",
				entryPrice: "50000",
				tp: "51000",
				sl: "49500",
				topSimilarity: 0.95,
			}),
		),
		loadDecisionResult: mock(() =>
			Promise.resolve({
				decision: "LONG" as const,
				reason: "criteria_met" as const,
				statistics: { winrate: 0.6, avgWin: 0.02, avgLoss: 0.01, expectancy: 0.008, sampleCount: 50 },
				ciLower: 0.45,
				ciUpper: 0.75,
				confidenceTier: "medium" as const,
			}),
		),
		...overrides,
	};
}

describe("Alert Worker Entry", () => {
	test("createAlertWorkerEntryDeps returns all required deps", () => {
		const deps = makeDeps();
		expect(deps.subscribe).toBeDefined();
		expect(deps.loadExecutionMode).toBeDefined();
		expect(deps.isAlertSent).toBeDefined();
		expect(deps.saveAlert).toBeDefined();
		expect(deps.sendSlackWebhook).toBeDefined();
		expect(deps.loadAlertContext).toBeDefined();
		expect(deps.loadDecisionResult).toBeDefined();
	});

	test("subscribe function accepts channel and handler", () => {
		const deps = makeDeps();
		const handler = mock(() => {});
		const sub = deps.subscribe("decision_completed", handler);
		expect(sub.unsubscribe).toBeDefined();
		expect(deps.subscribe).toHaveBeenCalledTimes(1);
	});

	test("deps functions return expected types", async () => {
		const deps = makeDeps();
		const mode = await deps.loadExecutionMode("strategy-1");
		expect(mode).toBe("alert");

		const sent = await deps.isAlertSent("event-1");
		expect(sent).toBe(false);

		const result = await deps.loadDecisionResult("decision-1");
		expect(result.decision).toBe("LONG");
	});
});

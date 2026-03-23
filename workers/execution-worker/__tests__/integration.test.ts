import { describe, expect, mock, test } from "bun:test";
import type { ExecutionMode } from "@combine/execution";
import { type ExecutionWorkerEntryDeps, startExecutionWorker } from "../src/entry.js";

function makeDeps(overrides: Partial<ExecutionWorkerEntryDeps> = {}): ExecutionWorkerEntryDeps {
	return {
		subscribe: mock((_channel: string, _handler: (payload: unknown) => void) => {
			return { unsubscribe: mock(() => {}) };
		}),
		loadExecutionMode: mock(() => Promise.resolve("live" as ExecutionMode)),
		isOrderExists: mock(() => Promise.resolve(false)),
		validateRiskGate: mock(() => Promise.resolve({ allowed: true, rejections: [] })),
		buildAndSaveOrder: mock(() =>
			Promise.resolve({
				clientOrderId: "ct-strat-event-123",
				symbol: "BTC/USDT:USDT",
				side: "buy" as const,
				type: "market" as const,
				quantity: "0.001",
				entryPrice: "50000",
				tpPrice: "51000",
				slPrice: "49500",
			}),
		),
		submitOrder: mock(() =>
			Promise.resolve({
				id: "exchange-order-123",
				symbol: "BTC/USDT:USDT",
				side: "buy" as const,
				type: "market" as const,
				price: 50000,
				amount: 0.001,
				filled: 0.001,
				status: "closed" as const,
				timestamp: Date.now(),
			}),
		),
		saveOrderResult: mock(() => Promise.resolve()),
		loadDecisionResult: mock(() =>
			Promise.resolve({
				decision: "LONG" as const,
				reason: "criteria_met" as const,
				statistics: {
					winrate: 0.6,
					avgWin: 0.02,
					avgLoss: 0.01,
					expectancy: 0.008,
					sampleCount: 50,
				},
				ciLower: 0.45,
				ciUpper: 0.75,
				confidenceTier: "medium" as const,
			}),
		),
		...overrides,
	};
}

describe("Execution Worker Entry", () => {
	test("startExecutionWorker subscribes to decision_completed", () => {
		const deps = makeDeps();
		const sub = startExecutionWorker(deps);
		expect(deps.subscribe).toHaveBeenCalledTimes(1);
		expect(sub.unsubscribe).toBeDefined();
	});

	test("subscribe is called with decision_completed channel", () => {
		const deps = makeDeps();
		startExecutionWorker(deps);
		const call = (deps.subscribe as ReturnType<typeof mock>).mock.calls[0];
		expect(call[0]).toBe("decision_completed");
	});

	test("deps functions return expected types", async () => {
		const deps = makeDeps();
		const mode = await deps.loadExecutionMode("strategy-1");
		expect(mode).toBe("live");

		const exists = await deps.isOrderExists("ct-123");
		expect(exists).toBe(false);

		const gate = await deps.validateRiskGate("strategy-1");
		expect(gate.allowed).toBe(true);

		const result = await deps.loadDecisionResult("decision-1");
		expect(result.decision).toBe("LONG");
	});
});

import { describe, expect, mock, test } from "bun:test";
import type { DecisionResult } from "@combine/core/decision";
import type { ExecutionMode } from "@combine/execution";
import { type ExecutionWorkerDeps, ExecutionWorkerHandler } from "../src/handler.js";

function makeDecisionResult(decision: "LONG" | "SHORT" | "PASS"): DecisionResult {
	return {
		decision,
		reason: decision === "PASS" ? "low_winrate" : "criteria_met",
		statistics: { winrate: 0.6, avgWin: 0.02, avgLoss: 0.01, expectancy: 0.008, sampleCount: 50 },
		ciLower: 0.45,
		ciUpper: 0.75,
		confidenceTier: "medium",
	};
}

function makeDeps(overrides: Partial<ExecutionWorkerDeps> = {}): ExecutionWorkerDeps {
	return {
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
		...overrides,
	};
}

describe("ExecutionWorkerHandler", () => {
	test("skips PASS decisions", async () => {
		const deps = makeDeps();
		const handler = new ExecutionWorkerHandler(deps);

		await handler.handle("event-1", "strategy-1", makeDecisionResult("PASS"));

		expect(deps.loadExecutionMode).not.toHaveBeenCalled();
		expect(deps.submitOrder).not.toHaveBeenCalled();
	});

	test("skips when mode is analysis", async () => {
		const deps = makeDeps({
			loadExecutionMode: mock(() => Promise.resolve("analysis" as ExecutionMode)),
		});
		const handler = new ExecutionWorkerHandler(deps);

		await handler.handle("event-1", "strategy-1", makeDecisionResult("LONG"));

		expect(deps.submitOrder).not.toHaveBeenCalled();
	});

	test("skips when mode is alert (no order needed)", async () => {
		const deps = makeDeps({
			loadExecutionMode: mock(() => Promise.resolve("alert" as ExecutionMode)),
		});
		const handler = new ExecutionWorkerHandler(deps);

		await handler.handle("event-1", "strategy-1", makeDecisionResult("LONG"));

		expect(deps.submitOrder).not.toHaveBeenCalled();
	});

	test("skips duplicate orders (clientOrderId exists)", async () => {
		const deps = makeDeps({
			isOrderExists: mock(() => Promise.resolve(true)),
		});
		const handler = new ExecutionWorkerHandler(deps);

		await handler.handle("event-1", "strategy-1", makeDecisionResult("LONG"));

		expect(deps.validateRiskGate).not.toHaveBeenCalled();
		expect(deps.submitOrder).not.toHaveBeenCalled();
	});

	test("skips when risk gate rejects", async () => {
		const deps = makeDeps({
			validateRiskGate: mock(() =>
				Promise.resolve({ allowed: false, rejections: ["kill switch active: global"] }),
			),
		});
		const handler = new ExecutionWorkerHandler(deps);

		await handler.handle("event-1", "strategy-1", makeDecisionResult("LONG"));

		expect(deps.submitOrder).not.toHaveBeenCalled();
	});

	test("submits order for LONG decision in live mode", async () => {
		const deps = makeDeps();
		const handler = new ExecutionWorkerHandler(deps);

		await handler.handle("event-1", "strategy-1", makeDecisionResult("LONG"));

		expect(deps.loadExecutionMode).toHaveBeenCalledTimes(1);
		expect(deps.validateRiskGate).toHaveBeenCalledTimes(1);
		expect(deps.buildAndSaveOrder).toHaveBeenCalledTimes(1);
		expect(deps.submitOrder).toHaveBeenCalledTimes(1);
		expect(deps.saveOrderResult).toHaveBeenCalledTimes(1);
	});

	test("submits order for SHORT decision in paper mode", async () => {
		const deps = makeDeps({
			loadExecutionMode: mock(() => Promise.resolve("paper" as ExecutionMode)),
		});
		const handler = new ExecutionWorkerHandler(deps);

		await handler.handle("event-1", "strategy-1", makeDecisionResult("SHORT"));

		expect(deps.submitOrder).toHaveBeenCalledTimes(1);
	});

	test("saves rejected status on exchange error", async () => {
		const deps = makeDeps({
			submitOrder: mock(() => Promise.reject(new Error("Exchange unavailable"))),
		});
		const handler = new ExecutionWorkerHandler(deps);

		await handler.handle("event-1", "strategy-1", makeDecisionResult("LONG"));

		expect(deps.saveOrderResult).toHaveBeenCalledTimes(1);
		const call = (deps.saveOrderResult as ReturnType<typeof mock>).mock.calls[0];
		expect(call[1]).toBe("rejected");
	});

	test("handles buildAndSaveOrder error gracefully", async () => {
		const deps = makeDeps({
			buildAndSaveOrder: mock(() => Promise.reject(new Error("Invalid order params"))),
		});
		const handler = new ExecutionWorkerHandler(deps);

		// Should not throw
		await handler.handle("event-1", "strategy-1", makeDecisionResult("LONG"));

		expect(deps.submitOrder).not.toHaveBeenCalled();
	});
});

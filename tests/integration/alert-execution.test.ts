import { describe, expect, test } from "bun:test";
import { formatAlertMessage } from "@combine/alert";
import type { AlertContext, SlackMessage } from "@combine/alert";
import type { DecisionResult } from "@combine/core/decision";
import { ExecutionModeService, buildOrder, isActionable, requiresOrder } from "@combine/execution";
import type { ExecutionMode, ExecutionModeDeps } from "@combine/execution";

function makeDecisionResult(overrides: Partial<DecisionResult> = {}): DecisionResult {
	return {
		decision: "LONG",
		reason: "criteria_met",
		statistics: {
			winrate: 0.6,
			avgWin: 2.0,
			avgLoss: 1.0,
			expectancy: 0.8,
			sampleCount: 50,
			status: "SUFFICIENT",
		},
		ciLower: 0.45,
		ciUpper: 0.74,
		confidenceTier: "low",
		...overrides,
	};
}

const alertCtx: AlertContext = {
	strategyName: "Test Strategy",
	symbol: "BTCUSDT",
	timeframe: "1m",
	entryPrice: "50000",
	tp: "51000",
	sl: "49500",
	topSimilarity: 0.9,
};

function makeModeDeps(mode: ExecutionMode): ExecutionModeDeps {
	const modes: Record<string, ExecutionMode> = { "strat-1": mode };
	return {
		loadMode: async (id) => modes[id] ?? "analysis",
		saveMode: async (id, m) => { modes[id] = m; },
		getSafetyGateStatus: async () => ({
			killSwitchEnabled: true,
			dailyLossLimitConfigured: true,
		}),
	};
}

describe("Alert-execution integration", () => {
	test("analysis mode → no alert, no order", async () => {
		const svc = new ExecutionModeService(makeModeDeps("analysis"));
		const mode = await svc.getMode("strat-1");

		expect(isActionable(mode)).toBe(false);
		expect(requiresOrder(mode)).toBe(false);
	});

	test("alert mode → alert sent, no order", async () => {
		const svc = new ExecutionModeService(makeModeDeps("alert"));
		const mode = await svc.getMode("strat-1");
		const result = makeDecisionResult();

		expect(isActionable(mode)).toBe(true);
		expect(requiresOrder(mode)).toBe(false);

		// Format alert succeeds
		const msg = formatAlertMessage(result, alertCtx);
		expect(msg.blocks).toHaveLength(4);
	});

	test("live mode → alert + order built", async () => {
		const svc = new ExecutionModeService(makeModeDeps("live"));
		const mode = await svc.getMode("strat-1");
		const result = makeDecisionResult();

		expect(isActionable(mode)).toBe(true);
		expect(requiresOrder(mode)).toBe(true);

		// Alert formatted
		const msg = formatAlertMessage(result, alertCtx);
		expect(msg.blocks).toHaveLength(4);

		// Order built
		const order = buildOrder({
			strategyId: "strat-1",
			eventId: "evt-1",
			symbol: "BTCUSDT",
			direction: "LONG",
			entryPrice: "50000",
			tpPct: 2,
			slPct: 1,
			quantity: "0.01",
		}, 1704067200000);

		expect(order.side).toBe("buy");
		expect(order.tpPrice).toBe("51000");
		expect(order.slPrice).toBe("49500");
		expect(order.clientOrderId).toContain("ct-strat-1");
	});

	test("PASS decision → formatter throws, no alert", () => {
		const result = makeDecisionResult({ decision: "PASS" });
		expect(() => formatAlertMessage(result, alertCtx)).toThrow();
	});

	test("order builder is deterministic with same inputs", () => {
		const input = {
			strategyId: "strat-1",
			eventId: "evt-1",
			symbol: "BTCUSDT",
			direction: "LONG" as const,
			entryPrice: "50000",
			tpPct: 2,
			slPct: 1,
			quantity: "0.01",
		};

		const order1 = buildOrder(input, 1704067200000);
		const order2 = buildOrder(input, 1704067200000);

		expect(order1.clientOrderId).toBe(order2.clientOrderId);
		expect(order1.tpPrice).toBe(order2.tpPrice);
		expect(order1.slPrice).toBe(order2.slPrice);
	});

	test("formatter output includes all required statistics", () => {
		const result = makeDecisionResult({ decision: "SHORT" });
		const msg = formatAlertMessage(result, alertCtx);

		const statsText = (msg.blocks[2] as { text: { text: string } }).text.text;
		expect(statsText).toContain("60.0%"); // winrate
		expect(statsText).toContain("0.8000"); // expectancy
		expect(statsText).toContain("50"); // sampleCount
		expect(statsText).toContain("low"); // confidenceTier
	});
});

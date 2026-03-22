import { describe, expect, test } from "bun:test";
import type { DecisionResult } from "@combine/core/decision";
import type { AlertContext, SlackMessage } from "@combine/alert";
import type { ExecutionMode } from "@combine/execution";
import { AlertWorkerHandler, type AlertWorkerDeps } from "../src/handler.js";

function makeDecisionResult(overrides: Partial<DecisionResult> = {}): DecisionResult {
	return {
		decision: "LONG",
		reason: "criteria_met",
		statistics: {
			winrate: 0.6,
			avgWin: 2,
			avgLoss: 1,
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

interface MockDeps extends AlertWorkerDeps {
	sentWebhooks: SlackMessage[];
	savedAlerts: Array<{ eventId: string; status: string }>;
}

function makeDeps(overrides: Partial<AlertWorkerDeps> = {}): MockDeps {
	const sentWebhooks: SlackMessage[] = [];
	const savedAlerts: Array<{ eventId: string; status: string }> = [];

	return {
		sentWebhooks,
		savedAlerts,
		loadExecutionMode:
			overrides.loadExecutionMode ?? (async () => "alert" as ExecutionMode),
		isAlertSent: overrides.isAlertSent ?? (async () => false),
		saveAlert:
			overrides.saveAlert ??
			(async (eventId, status) => {
				savedAlerts.push({ eventId, status });
			}),
		sendSlackWebhook:
			overrides.sendSlackWebhook ??
			(async (msg) => {
				sentWebhooks.push(msg);
			}),
		loadAlertContext:
			overrides.loadAlertContext ??
			(async () => ({
				strategyName: "SMA Cross",
				symbol: "BTCUSDT",
				timeframe: "1m",
				entryPrice: "50000",
				tp: "51000",
				sl: "49500",
				topSimilarity: 0.9,
			})),
	};
}

describe("AlertWorkerHandler", () => {
	test("LONG decision in alert mode → sends Slack webhook", async () => {
		const deps = makeDeps();
		const handler = new AlertWorkerHandler(deps);

		await handler.handle("evt-1", makeDecisionResult());

		expect(deps.sentWebhooks).toHaveLength(1);
		expect(deps.savedAlerts).toHaveLength(1);
		expect(deps.savedAlerts[0]!.status).toBe("sent");
	});

	test("PASS decision → no alert sent", async () => {
		const deps = makeDeps();
		const handler = new AlertWorkerHandler(deps);

		await handler.handle("evt-1", makeDecisionResult({ decision: "PASS" }));

		expect(deps.sentWebhooks).toHaveLength(0);
		expect(deps.savedAlerts).toHaveLength(0);
	});

	test("analysis mode → no alert sent", async () => {
		const deps = makeDeps({
			loadExecutionMode: async () => "analysis" as ExecutionMode,
		});
		const handler = new AlertWorkerHandler(deps);

		await handler.handle("evt-1", makeDecisionResult());

		expect(deps.sentWebhooks).toHaveLength(0);
	});

	test("duplicate eventId → skipped", async () => {
		const deps = makeDeps({
			isAlertSent: async () => true,
		});
		const handler = new AlertWorkerHandler(deps);

		await handler.handle("evt-1", makeDecisionResult());

		expect(deps.sentWebhooks).toHaveLength(0);
	});

	test("webhook failure → retries 3 times then marks failed", async () => {
		let attempts = 0;
		const deps = makeDeps({
			sendSlackWebhook: async () => {
				attempts++;
				throw new Error("webhook failed");
			},
		});
		const handler = new AlertWorkerHandler(deps);

		await handler.handle("evt-1", makeDecisionResult());

		expect(attempts).toBe(3);
		expect(deps.savedAlerts[0]!.status).toBe("failed");
	});

	test("SHORT decision also sends alert", async () => {
		const deps = makeDeps();
		const handler = new AlertWorkerHandler(deps);

		await handler.handle("evt-1", makeDecisionResult({ decision: "SHORT" }));

		expect(deps.sentWebhooks).toHaveLength(1);
	});
});

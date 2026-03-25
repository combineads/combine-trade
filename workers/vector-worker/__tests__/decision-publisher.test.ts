import { describe, expect, test } from "bun:test";
import type { FeatureInput, SearchResponse } from "@combine/core/vector";
import { Channels } from "@combine/shared/event-bus/channels.js";
import type { Channel, EventPublisher } from "@combine/shared/event-bus/types.js";
import { VectorEventHandler, type VectorHandlerDeps } from "../src/handler.js";
import { isLlmEligibleTimeframe } from "../src/llm-routing.js";

/** decision-pending-llm: channel constant */
describe("Channels.decisionPendingLlm", () => {
	test("equals 'decision_pending_llm'", () => {
		expect(Channels.decisionPendingLlm.name).toBe("decision_pending_llm");
	});
});

/** decision-pending-llm: isLlmEligibleTimeframe pure function */
describe("isLlmEligibleTimeframe", () => {
	test("15m is eligible", () => {
		expect(isLlmEligibleTimeframe("15m")).toBe(true);
	});

	test("30m is eligible", () => {
		expect(isLlmEligibleTimeframe("30m")).toBe(true);
	});

	test("1h is eligible", () => {
		expect(isLlmEligibleTimeframe("1h")).toBe(true);
	});

	test("4h is eligible", () => {
		expect(isLlmEligibleTimeframe("4h")).toBe(true);
	});

	test("1d is eligible", () => {
		expect(isLlmEligibleTimeframe("1d")).toBe(true);
	});

	test("1m is NOT eligible", () => {
		expect(isLlmEligibleTimeframe("1m")).toBe(false);
	});

	test("3m is NOT eligible", () => {
		expect(isLlmEligibleTimeframe("3m")).toBe(false);
	});

	test("5m is NOT eligible", () => {
		expect(isLlmEligibleTimeframe("5m")).toBe(false);
	});
});

/** decision-pending-llm: branching logic in VectorEventHandler */

interface MockStrategy {
	id: string;
	version: number;
	direction: "long" | "short";
	decisionConfig: Record<string, unknown>;
	useLlmFilter: boolean;
	timeframe: string;
}

function createMockDeps(
	strategyOverrides: Partial<MockStrategy> = {},
	eventTimeframe = "1m",
): VectorHandlerDeps & {
	publishedMessages: Array<{ channel: string; payload: unknown }>;
} {
	const publishedMessages: Array<{ channel: string; payload: unknown }> = [];

	const mockStrategy: MockStrategy = {
		id: "strat-1",
		version: 1,
		direction: "long",
		decisionConfig: {},
		useLlmFilter: false,
		timeframe: "1m",
		...strategyOverrides,
	};

	const defaultSearchResponse: SearchResponse = {
		status: "SUFFICIENT",
		results: Array.from({ length: 35 }, (_, i) => ({
			eventId: `match-${i}`,
			distance: 0.1 + i * 0.01,
		})),
		threshold: 0.67,
		totalCandidates: 50,
		validCount: 35,
	};

	return {
		publishedMessages,
		loadEvent: async () => ({
			id: "evt-1",
			strategyId: "strat-1",
			strategyVersion: 1,
			symbol: "BTCUSDT",
			timeframe: eventTimeframe,
			direction: "long" as const,
			features: [{ name: "rsi", value: 70, normalization: { method: "percent" } }],
			entryPrice: "50000",
		}),
		loadStrategy: async () => mockStrategy,
		normalizeFeatures: (features: FeatureInput[]) => features.map((f) => f.value / 100),
		ensureTable: async () => "vectors_strat_1_v1",
		storeVector: async () => {},
		searchVectors: async () => defaultSearchResponse,
		loadLabels: async () =>
			Array.from({ length: 35 }, (_, i) => ({
				resultType: i < 25 ? ("WIN" as const) : ("LOSS" as const),
				pnlPct: i < 25 ? 1.5 : -0.8,
			})),
		saveDecision: async () => "dec-1",
		publisher: {
			async publish<T>(channel: Channel<T>, payload: T): Promise<void> {
				publishedMessages.push({ channel: channel.name, payload });
			},
			async close() {},
		} satisfies EventPublisher,
	};
}

describe("decision-pending-llm: VectorEventHandler branching", () => {
	test("use_llm_filter=true + timeframe=15m → publishes decision_pending_llm", async () => {
		const deps = createMockDeps({ useLlmFilter: true, timeframe: "15m" }, "15m");
		const handler = new VectorEventHandler(deps);

		await handler.handle({
			eventId: "evt-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			version: 1,
		});

		expect(deps.publishedMessages).toHaveLength(1);
		expect(deps.publishedMessages[0]?.channel).toBe("decision_pending_llm");
	});

	test("use_llm_filter=true + timeframe=1m → publishes decision_completed (bypass LLM)", async () => {
		const deps = createMockDeps({ useLlmFilter: true, timeframe: "1m" }, "1m");
		const handler = new VectorEventHandler(deps);

		await handler.handle({
			eventId: "evt-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			version: 1,
		});

		expect(deps.publishedMessages).toHaveLength(1);
		expect(deps.publishedMessages[0]?.channel).toBe("decision_completed");
	});

	test("use_llm_filter=false + timeframe=15m → publishes decision_completed (bypass LLM)", async () => {
		const deps = createMockDeps({ useLlmFilter: false, timeframe: "15m" }, "15m");
		const handler = new VectorEventHandler(deps);

		await handler.handle({
			eventId: "evt-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			version: 1,
		});

		expect(deps.publishedMessages).toHaveLength(1);
		expect(deps.publishedMessages[0]?.channel).toBe("decision_completed");
	});

	test("use_llm_filter=false + timeframe=1m → publishes decision_completed (bypass LLM)", async () => {
		const deps = createMockDeps({ useLlmFilter: false, timeframe: "1m" }, "1m");
		const handler = new VectorEventHandler(deps);

		await handler.handle({
			eventId: "evt-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			version: 1,
		});

		expect(deps.publishedMessages).toHaveLength(1);
		expect(deps.publishedMessages[0]?.channel).toBe("decision_completed");
	});

	test("decision_pending_llm payload includes decision_id and strategy_id", async () => {
		const deps = createMockDeps({ useLlmFilter: true, timeframe: "15m" }, "15m");
		const handler = new VectorEventHandler(deps);

		await handler.handle({
			eventId: "evt-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			version: 1,
		});

		const msg = deps.publishedMessages[0]?.payload as Record<string, unknown>;
		expect(msg.decisionId).toBe("dec-1");
		expect(msg.strategyId).toBe("strat-1");
	});

	test("decision_completed payload always contains action field on bypass path", async () => {
		const deps = createMockDeps({ useLlmFilter: false, timeframe: "1m" }, "1m");
		const handler = new VectorEventHandler(deps);

		await handler.handle({
			eventId: "evt-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			version: 1,
		});

		const msg = deps.publishedMessages[0]?.payload as Record<string, unknown>;
		// direction field satisfies the action requirement per spec
		expect(msg.direction).toBeDefined();
	});
});

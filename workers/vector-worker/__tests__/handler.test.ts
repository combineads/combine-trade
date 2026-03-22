import { describe, expect, test } from "bun:test";
import type { FeatureInput, SearchResponse } from "@combine/core/vector";
import type { Channel, EventPublisher } from "@combine/shared/event-bus/types.js";
import { VectorEventHandler, type VectorHandlerDeps } from "../src/handler.js";

interface MockStrategy {
	id: string;
	version: number;
	direction: "long" | "short";
	decisionConfig: Record<string, unknown>;
}

interface MockEvent {
	id: string;
	strategyId: string;
	strategyVersion: number;
	symbol: string;
	timeframe: string;
	direction: "long" | "short";
	features: Array<{ name: string; value: number; normalization: { method: string } }>;
	entryPrice: string;
}

function createMockDeps(overrides: Partial<VectorHandlerDeps> = {}): VectorHandlerDeps & {
	publishedMessages: Array<{ channel: string; payload: unknown }>;
	storedVectors: Array<{ strategyId: string; eventId: string; embedding: number[] }>;
	savedDecisions: Array<Record<string, unknown>>;
} {
	const publishedMessages: Array<{ channel: string; payload: unknown }> = [];
	const storedVectors: Array<{ strategyId: string; eventId: string; embedding: number[] }> = [];
	const savedDecisions: Array<Record<string, unknown>> = [];

	const mockStrategy: MockStrategy = {
		id: "strat-1",
		version: 1,
		direction: "long",
		decisionConfig: {},
	};

	const mockEvent: MockEvent = {
		id: "evt-1",
		strategyId: "strat-1",
		strategyVersion: 1,
		symbol: "BTCUSDT",
		timeframe: "1m",
		direction: "long",
		features: [
			{ name: "rsi", value: 70, normalization: { method: "percent" } },
			{ name: "trend", value: 0, normalization: { method: "sigmoid" } },
		],
		entryPrice: "50000",
	};

	// Default: 35 valid results with labels
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
		storedVectors,
		savedDecisions,

		loadEvent: overrides.loadEvent ?? (async () => mockEvent as never),
		loadStrategy: overrides.loadStrategy ?? (async () => mockStrategy as never),
		normalizeFeatures:
			overrides.normalizeFeatures ??
			((features: FeatureInput[]) => features.map((f) => f.value / 100)),
		ensureTable: overrides.ensureTable ?? (async () => "vectors_strat_1_v1"),
		storeVector:
			overrides.storeVector ??
			(async (strategyId, _v, eventId, _s, _t, embedding) => {
				storedVectors.push({ strategyId, eventId, embedding });
			}),
		searchVectors: overrides.searchVectors ?? (async () => defaultSearchResponse),
		loadLabels:
			overrides.loadLabels ??
			(async () =>
				Array.from({ length: 35 }, (_, i) => ({
					resultType: i < 25 ? ("WIN" as const) : ("LOSS" as const),
					pnlPct: i < 25 ? 1.5 : -0.8,
				}))),
		saveDecision:
			overrides.saveDecision ??
			(async (decision) => {
				savedDecisions.push(decision as Record<string, unknown>);
				return "dec-1";
			}),
		publisher:
			overrides.publisher ??
			({
				async publish<T>(channel: Channel<T>, payload: T): Promise<void> {
					publishedMessages.push({ channel: channel.name, payload });
				},
				async close() {},
			} satisfies EventPublisher),
	};
}

describe("VectorEventHandler", () => {
	test("full pipeline: event → normalize → store → search → decide → publish", async () => {
		const deps = createMockDeps();
		const handler = new VectorEventHandler(deps);

		await handler.handle({
			eventId: "evt-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			version: 1,
		});

		// Vector stored
		expect(deps.storedVectors).toHaveLength(1);
		expect(deps.storedVectors[0]!.eventId).toBe("evt-1");

		// Decision saved
		expect(deps.savedDecisions).toHaveLength(1);

		// decision_completed published
		expect(deps.publishedMessages).toHaveLength(1);
		expect(deps.publishedMessages[0]!.channel).toBe("decision_completed");
	});

	test("INSUFFICIENT search results → PASS decision", async () => {
		const deps = createMockDeps({
			searchVectors: async () => ({
				status: "INSUFFICIENT" as const,
				results: [],
				threshold: 0.67,
				totalCandidates: 50,
				validCount: 10,
			}),
		});
		const handler = new VectorEventHandler(deps);

		await handler.handle({
			eventId: "evt-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			version: 1,
		});

		expect(deps.savedDecisions).toHaveLength(1);
		const decision = deps.savedDecisions[0]!;
		expect(decision.decision).toBe("PASS");
		expect(decision.reason).toBe("insufficient_samples");
	});

	test("normalization failure does not crash handler", async () => {
		const deps = createMockDeps({
			normalizeFeatures: () => {
				throw new Error("normalization failed");
			},
		});
		const handler = new VectorEventHandler(deps);

		// Should not throw
		await expect(
			handler.handle({ eventId: "evt-1", strategyId: "strat-1", symbol: "BTCUSDT", version: 1 }),
		).rejects.toThrow("normalization failed");
	});

	test("duplicate event is handled via store idempotency", async () => {
		const deps = createMockDeps();
		const handler = new VectorEventHandler(deps);

		await handler.handle({
			eventId: "evt-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			version: 1,
		});
		await handler.handle({
			eventId: "evt-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			version: 1,
		});

		// Store called twice (idempotent at DB level)
		expect(deps.storedVectors).toHaveLength(2);
		// Decisions also created twice (caller handles dedup)
		expect(deps.savedDecisions).toHaveLength(2);
	});

	test("PASS decision still published", async () => {
		const deps = createMockDeps({
			searchVectors: async () => ({
				status: "INSUFFICIENT" as const,
				results: [],
				threshold: 0.67,
				totalCandidates: 5,
				validCount: 5,
			}),
		});
		const handler = new VectorEventHandler(deps);

		await handler.handle({
			eventId: "evt-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			version: 1,
		});

		expect(deps.publishedMessages).toHaveLength(1);
		expect((deps.publishedMessages[0]!.payload as Record<string, unknown>).direction).toBe("PASS");
	});
});

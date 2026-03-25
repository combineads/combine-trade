import { describe, expect, mock, test } from "bun:test";
import type { LlmDecision } from "@combine/core/macro/decision-prompt-builder.js";
import { type LlmDecisionRepository, LlmDecisionWorker } from "../src/index.js";

interface KnnDecisionRecord {
	id: string;
	strategyId: string;
	direction: string;
	winrate: number;
	expectancy: number;
	sampleCount: number;
	confidenceTier: string;
	features: Record<string, number>;
}

function makeKnnDecision(overrides: Partial<KnnDecisionRecord> = {}): KnnDecisionRecord {
	return {
		id: "dec-1",
		strategyId: "strat-1",
		direction: "LONG",
		winrate: 0.62,
		expectancy: 0.42,
		sampleCount: 47,
		confidenceTier: "HIGH",
		features: { RSI: 38, ATR: 2.1 },
		...overrides,
	};
}

function createMockRepo(
	knnDecision: KnnDecisionRecord | null = makeKnnDecision(),
): LlmDecisionRepository & {
	updatedDecisions: { id: string; llmResult: LlmDecision; finalDirection: string }[];
	publishedMessages: {
		channel: string;
		decisionId: string;
		direction: string;
		sizeModifier?: number;
	}[];
} {
	const updatedDecisions: {
		id: string;
		llmResult: LlmDecision;
		finalDirection: string;
	}[] = [];
	const publishedMessages: {
		channel: string;
		decisionId: string;
		direction: string;
		sizeModifier?: number;
	}[] = [];

	return {
		getKnnDecision: mock(async () => knnDecision),
		getRecentTrades: mock(async () => []),
		getMacroContext: mock(async () => ({
			upcomingEvents: [],
			recentNews: [],
			highImpactNext24h: 0,
		})),
		updateWithLlmResult: mock(async (id: string, llmResult: LlmDecision) => {
			// finalDirection is now determined by the worker, not stored in direction column
			updatedDecisions.push({ id, llmResult, finalDirection: "" });
		}),
		publishDecisionCompleted: mock(
			async (decisionId: string, direction: string, sizeModifier?: number) => {
				publishedMessages.push({
					channel: "decision_completed",
					decisionId,
					direction,
					sizeModifier,
				});
			},
		),
		updatedDecisions,
		publishedMessages,
	};
}

function mockEvaluator(decision: LlmDecision) {
	return mock(async () => decision);
}

describe("LlmDecisionWorker", () => {
	test("CONFIRM preserves original direction in published message", async () => {
		const repo = createMockRepo();
		const evaluate = mockEvaluator({
			action: "CONFIRM",
			reason: "Signal looks good",
			confidence: 0.8,
			risk_factors: [],
		});
		const worker = new LlmDecisionWorker({ repository: repo, evaluate });

		await worker.processDecision("dec-1");

		expect(repo.updatedDecisions).toHaveLength(1);
		// updateWithLlmResult now only stores LLM columns — llmResult is persisted
		expect(repo.updatedDecisions[0].llmResult.action).toBe("CONFIRM");
		expect(repo.publishedMessages).toHaveLength(1);
		// Published direction must still be the kNN direction (LONG) for CONFIRM
		expect(repo.publishedMessages[0].direction).toBe("LONG");
		expect(repo.publishedMessages[0].sizeModifier).toBeUndefined();
	});

	test("PASS: publishDecisionCompleted emits PASS direction", async () => {
		const repo = createMockRepo();
		const evaluate = mockEvaluator({
			action: "PASS",
			reason: "FOMC imminent",
			confidence: 0.9,
			risk_factors: ["fomc"],
		});
		const worker = new LlmDecisionWorker({ repository: repo, evaluate });

		await worker.processDecision("dec-1");

		// LLM action stored in llm_* columns (not direction)
		expect(repo.updatedDecisions[0].llmResult.action).toBe("PASS");
		// Published direction is PASS so downstream workers suppress alert/order
		expect(repo.publishedMessages[0].direction).toBe("PASS");
	});

	test("REDUCE_SIZE preserves direction with size_modifier=0.5", async () => {
		const repo = createMockRepo();
		const evaluate = mockEvaluator({
			action: "REDUCE_SIZE",
			reason: "Uncertain but valid",
			confidence: 0.55,
			risk_factors: ["uncertainty"],
		});
		const worker = new LlmDecisionWorker({ repository: repo, evaluate });

		await worker.processDecision("dec-1");

		expect(repo.updatedDecisions[0].llmResult.action).toBe("REDUCE_SIZE");
		expect(repo.publishedMessages[0].direction).toBe("LONG");
		expect(repo.publishedMessages[0].sizeModifier).toBe(0.5);
	});

	test("skips when kNN decision not found", async () => {
		const repo = createMockRepo(null);
		const evaluate = mockEvaluator({
			action: "CONFIRM",
			reason: "",
			confidence: 0,
			risk_factors: [],
		});
		const worker = new LlmDecisionWorker({ repository: repo, evaluate });

		await worker.processDecision("nonexistent");

		expect(evaluate).toHaveBeenCalledTimes(0);
		expect(repo.updatedDecisions).toHaveLength(0);
	});

	test("persists LLM result to repository", async () => {
		const repo = createMockRepo();
		const llmResult: LlmDecision = {
			action: "PASS",
			reason: "High risk",
			confidence: 0.92,
			risk_factors: ["geopolitical", "fomc"],
		};
		const evaluate = mockEvaluator(llmResult);
		const worker = new LlmDecisionWorker({ repository: repo, evaluate });

		await worker.processDecision("dec-1");

		expect(repo.updatedDecisions[0].llmResult.action).toBe("PASS");
		expect(repo.updatedDecisions[0].llmResult.confidence).toBe(0.92);
		expect(repo.updatedDecisions[0].llmResult.risk_factors).toEqual(["geopolitical", "fomc"]);
	});
});

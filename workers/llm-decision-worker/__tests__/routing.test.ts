import { describe, expect, mock, test } from "bun:test";
import type { LlmDecision } from "@combine/core/macro/decision-prompt-builder.js";
import { type LlmDecisionRepository, LlmDecisionWorker } from "../src/index.js";

/** decision-pending-llm: llm-decision-worker routing */

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
		updateWithLlmResult: mock(
			async (id: string, llmResult: LlmDecision, finalDirection: string) => {
				updatedDecisions.push({ id, llmResult, finalDirection });
			},
		),
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

describe("decision-pending-llm: llm-decision-worker routing", () => {
	test("worker invokes LLM evaluation when processDecision is called", async () => {
		const repo = createMockRepo();
		const evaluate = mock(
			async (): Promise<LlmDecision> => ({
				action: "CONFIRM",
				reason: "Signal looks good",
				confidence: 0.8,
				risk_factors: [],
			}),
		);
		const worker = new LlmDecisionWorker({ repository: repo, evaluate });

		await worker.processDecision("dec-1");

		expect(evaluate).toHaveBeenCalledTimes(1);
	});

	test("after evaluation, publishDecisionCompleted is called with decision_completed channel", async () => {
		const repo = createMockRepo();
		const evaluate = mock(
			async (): Promise<LlmDecision> => ({
				action: "CONFIRM",
				reason: "Confirmed",
				confidence: 0.85,
				risk_factors: [],
			}),
		);
		const worker = new LlmDecisionWorker({ repository: repo, evaluate });

		await worker.processDecision("dec-1");

		expect(repo.publishedMessages).toHaveLength(1);
		expect(repo.publishedMessages[0]?.channel).toBe("decision_completed");
	});

	test("after LLM eval PASS: publishDecisionCompleted is called with PASS direction", async () => {
		const repo = createMockRepo();
		const evaluate = mock(
			async (): Promise<LlmDecision> => ({
				action: "PASS",
				reason: "FOMC imminent",
				confidence: 0.9,
				risk_factors: ["fomc"],
			}),
		);
		const worker = new LlmDecisionWorker({ repository: repo, evaluate });

		await worker.processDecision("dec-1");

		expect(repo.publishedMessages[0]?.direction).toBe("PASS");
	});

	test("LLM columns are written to DB before decision_completed is emitted", async () => {
		const callOrder: string[] = [];

		const repo = createMockRepo();

		const originalUpdateWithLlmResult = repo.updateWithLlmResult;
		repo.updateWithLlmResult = mock(
			async (id: string, llmResult: LlmDecision, finalDirection: string) => {
				callOrder.push("updateWithLlmResult");
				return originalUpdateWithLlmResult(id, llmResult, finalDirection);
			},
		);

		const originalPublish = repo.publishDecisionCompleted;
		repo.publishDecisionCompleted = mock(
			async (decisionId: string, direction: string, sizeModifier?: number) => {
				callOrder.push("publishDecisionCompleted");
				return originalPublish(decisionId, direction, sizeModifier);
			},
		);

		const evaluate = mock(
			async (): Promise<LlmDecision> => ({
				action: "CONFIRM",
				reason: "Ok",
				confidence: 0.75,
				risk_factors: [],
			}),
		);
		const worker = new LlmDecisionWorker({ repository: repo, evaluate });

		await worker.processDecision("dec-1");

		expect(callOrder).toEqual(["updateWithLlmResult", "publishDecisionCompleted"]);
	});

	test("decision_completed direction is LLM action when CONFIRM", async () => {
		const repo = createMockRepo(makeKnnDecision({ direction: "SHORT" }));
		const evaluate = mock(
			async (): Promise<LlmDecision> => ({
				action: "CONFIRM",
				reason: "Valid",
				confidence: 0.9,
				risk_factors: [],
			}),
		);
		const worker = new LlmDecisionWorker({ repository: repo, evaluate });

		await worker.processDecision("dec-1");

		// CONFIRM preserves kNN direction (SHORT)
		expect(repo.publishedMessages[0]?.direction).toBe("SHORT");
	});
});

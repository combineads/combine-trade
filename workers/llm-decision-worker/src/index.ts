import {
	type DecisionMacroContext,
	type DecisionPromptInput,
	type LlmDecision,
	type RecentTrade,
	buildDecisionPrompt,
} from "../../../packages/core/macro/decision-prompt-builder.js";

export interface LlmDecisionRepository {
	getKnnDecision(
		decisionId: string,
	): Promise<{
		id: string;
		strategyId: string;
		direction: string;
		winrate: number;
		expectancy: number;
		sampleCount: number;
		confidenceTier: string;
		features: Record<string, number>;
	} | null>;
	getRecentTrades(strategyId: string): Promise<RecentTrade[]>;
	getMacroContext(strategyId: string): Promise<DecisionMacroContext>;
	updateWithLlmResult(
		decisionId: string,
		llmResult: LlmDecision,
		finalDirection: string,
	): Promise<void>;
	publishDecisionCompleted(
		decisionId: string,
		direction: string,
		sizeModifier?: number,
	): Promise<void>;
}

export type LlmEvaluateFunction = (prompt: string) => Promise<LlmDecision>;

export interface LlmDecisionWorkerDeps {
	repository: LlmDecisionRepository;
	evaluate: LlmEvaluateFunction;
}

export class LlmDecisionWorker {
	private readonly repo: LlmDecisionRepository;
	private readonly evaluate: LlmEvaluateFunction;

	constructor(deps: LlmDecisionWorkerDeps) {
		this.repo = deps.repository;
		this.evaluate = deps.evaluate;
	}

	async processDecision(decisionId: string): Promise<void> {
		const knn = await this.repo.getKnnDecision(decisionId);
		if (!knn) {
			console.warn(`Decision ${decisionId} not found, skipping LLM evaluation`);
			return;
		}

		const [recentTrades, macroContext] = await Promise.all([
			this.repo.getRecentTrades(knn.strategyId),
			this.repo.getMacroContext(knn.strategyId),
		]);

		const promptInput: DecisionPromptInput = {
			knnResult: {
				direction: knn.direction,
				winrate: knn.winrate,
				expectancy: knn.expectancy,
				sampleCount: knn.sampleCount,
				confidenceTier: knn.confidenceTier,
			},
			currentFeatures: knn.features,
			recentTrades,
			macroContext,
		};

		const prompt = buildDecisionPrompt(promptInput);
		const llmResult = await this.evaluate(prompt);

		let finalDirection: string;
		let sizeModifier: number | undefined;

		switch (llmResult.action) {
			case "PASS":
				finalDirection = "PASS";
				break;
			case "REDUCE_SIZE":
				finalDirection = knn.direction;
				sizeModifier = 0.5;
				break;
			default:
				finalDirection = knn.direction;
				break;
		}

		await this.repo.updateWithLlmResult(decisionId, llmResult, finalDirection);
		await this.repo.publishDecisionCompleted(
			decisionId,
			finalDirection,
			sizeModifier,
		);
	}
}

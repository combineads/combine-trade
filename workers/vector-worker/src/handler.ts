import type { DecisionResult } from "@combine/core/decision";
import { judge } from "@combine/core/decision";
import type { FeatureInput, SearchResponse } from "@combine/core/vector";
import { type EventLabel, computeStatistics } from "@combine/core/vector/statistics.js";
import { createLogger } from "@combine/shared";
import { Channels } from "@combine/shared/event-bus/channels.js";
import type { EventPublisher } from "@combine/shared/event-bus/types.js";
import { isLlmEligibleTimeframe } from "./llm-routing.js";

const logger = createLogger("vector-worker");

export interface StrategyEventPayload {
	eventId: string;
	strategyId: string;
	symbol: string;
	version: number;
}

export interface VectorHandlerDeps {
	loadEvent: (eventId: string) => Promise<{
		id: string;
		strategyId: string;
		strategyVersion: number;
		symbol: string;
		timeframe: string;
		direction: "long" | "short";
		features: Array<{ name: string; value: number; normalization: { method: string } }>;
		entryPrice: string;
	}>;
	loadStrategy: (strategyId: string) => Promise<{
		id: string;
		version: number;
		direction: "long" | "short";
		decisionConfig: Record<string, unknown>;
		useLlmFilter: boolean;
		timeframe: string;
	}>;
	normalizeFeatures: (features: FeatureInput[]) => number[];
	ensureTable: (strategyId: string, version: number, dimension: number) => Promise<string>;
	storeVector: (
		strategyId: string,
		version: number,
		eventId: string,
		symbol: string,
		timeframe: string,
		embedding: number[],
	) => Promise<void>;
	searchVectors: (
		strategyId: string,
		version: number,
		symbol: string,
		queryVector: number[],
	) => Promise<SearchResponse>;
	loadLabels: (eventIds: string[]) => Promise<EventLabel[]>;
	saveDecision: (decision: Record<string, unknown>) => Promise<string>;
	publisher: EventPublisher;
}

/**
 * Handles strategy_event_created: normalize → store → search → stats → decide → publish
 */
export class VectorEventHandler {
	constructor(private readonly deps: VectorHandlerDeps) {}

	async handle(payload: StrategyEventPayload): Promise<void> {
		const { eventId, strategyId } = payload;

		logger.info({ eventId, strategyId }, "Processing strategy event");

		// 1. Load event and strategy
		const event = await this.deps.loadEvent(eventId);
		const strategy = await this.deps.loadStrategy(strategyId);

		// 2. Normalize features → embedding vector
		const features: FeatureInput[] = event.features.map((f) => ({
			name: f.name,
			value: f.value,
			normalization: f.normalization as FeatureInput["normalization"],
		}));
		const embedding = this.deps.normalizeFeatures(features);
		const dimension = embedding.length;

		// 3. Ensure vector table exists
		await this.deps.ensureTable(strategyId, event.strategyVersion, dimension);

		// 4. Store vector (idempotent)
		await this.deps.storeVector(
			strategyId,
			event.strategyVersion,
			eventId,
			event.symbol,
			event.timeframe,
			embedding,
		);

		// 5. L2 search for similar vectors
		const searchResult = await this.deps.searchVectors(
			strategyId,
			event.strategyVersion,
			event.symbol,
			embedding,
		);

		let decisionResult: DecisionResult;

		if (searchResult.status === "INSUFFICIENT") {
			// Not enough similar patterns — PASS
			decisionResult = judge(
				{ winrate: 0, avgWin: 0, avgLoss: 0, expectancy: 0, sampleCount: searchResult.validCount },
				strategy.direction,
			);
		} else {
			// 6. Load labels for matched events and compute statistics
			const matchedEventIds = searchResult.results.map((r) => r.eventId);
			const labels = await this.deps.loadLabels(matchedEventIds);
			const stats = computeStatistics(labels);

			// 7. Run decision engine
			decisionResult = judge(
				{
					winrate: stats.winrate,
					avgWin: stats.avgWin,
					avgLoss: stats.avgLoss,
					expectancy: stats.expectancy,
					sampleCount: stats.sampleCount,
				},
				strategy.direction,
				strategy.decisionConfig as import("@combine/core/decision").DecisionConfig | undefined,
			);
		}

		// 8. Persist decision
		const decisionId = await this.deps.saveDecision({
			eventId,
			strategyId,
			strategyVersion: event.strategyVersion,
			symbol: event.symbol,
			direction: decisionResult.decision,
			sampleCount: decisionResult.statistics.sampleCount,
			winrate: decisionResult.statistics.winrate,
			expectancy: decisionResult.statistics.expectancy,
			avgWin: decisionResult.statistics.avgWin,
			avgLoss: decisionResult.statistics.avgLoss,
			ciLower: decisionResult.ciLower,
			ciUpper: decisionResult.ciUpper,
			confidenceTier: decisionResult.confidenceTier,
			decision: decisionResult.decision,
			reason: decisionResult.reason,
		});

		// 9. Route to LLM filter or publish decision_completed directly
		const routeToLlm = strategy.useLlmFilter && isLlmEligibleTimeframe(strategy.timeframe);

		if (routeToLlm) {
			await this.deps.publisher.publish(Channels.decisionPendingLlm, {
				decisionId,
				strategyId,
			});

			logger.info(
				{ eventId, strategyId, decisionId, decision: decisionResult.decision },
				"Decision routed to LLM filter",
			);
		} else {
			await this.deps.publisher.publish(Channels.decisionCompleted, {
				decisionId,
				strategyId,
				symbol: event.symbol,
				direction: decisionResult.decision,
			});

			logger.info(
				{ eventId, strategyId, decision: decisionResult.decision, reason: decisionResult.reason },
				"Decision completed",
			);
		}
	}
}

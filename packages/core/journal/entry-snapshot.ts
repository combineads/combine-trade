import type { DecisionResult } from "../decision/types.js";
import type { SearchResult } from "../vector/types.js";
import type { EntrySnapshot, SnapshotDecision, SnapshotPattern } from "./types.js";

export interface EntrySnapshotInput {
	eventId: string;
	strategyId: string;
	symbol: string;
	entryPrice: string;
	tpPrice: string;
	slPrice: string;
	decision: DecisionResult;
	matchedPatterns: Array<SearchResult & { resultType?: string | null }>;
	featureVector: Record<string, number>;
}

/** Build an entry snapshot from decision context. Pure function. */
export function buildEntrySnapshot(input: EntrySnapshotInput): EntrySnapshot {
	const snapshotDecision: SnapshotDecision = {
		direction: input.decision.decision,
		winrate: input.decision.statistics.winrate,
		expectancy: input.decision.statistics.expectancy,
		sampleCount: input.decision.statistics.sampleCount,
		ciLower: input.decision.ciLower,
		ciUpper: input.decision.ciUpper,
		confidenceTier: input.decision.confidenceTier,
	};

	const patterns: SnapshotPattern[] = input.matchedPatterns.map((p) => ({
		eventId: p.eventId,
		distance: p.distance,
		resultType: (p.resultType as SnapshotPattern["resultType"]) ?? null,
	}));

	return {
		id: crypto.randomUUID(),
		eventId: input.eventId,
		strategyId: input.strategyId,
		symbol: input.symbol,
		entryPrice: input.entryPrice,
		tpPrice: input.tpPrice,
		slPrice: input.slPrice,
		decision: snapshotDecision,
		matchedPatterns: patterns,
		featureVector: { ...input.featureVector },
		capturedAt: new Date(),
	};
}

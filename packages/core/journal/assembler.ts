import type { LabelResult } from "../label/types.js";
import type { BacktestComparison, EntrySnapshot, MarketContext, TradeJournal } from "./types.js";

export interface AssemblerInput {
	entrySnapshot: EntrySnapshot;
	labelResult: LabelResult;
	strategyVersion: number;
	timeframe: string;
	entryTime: Date;
	exitTime: Date;
	exitMarketContext?: MarketContext | null;
	backtestComparison?: BacktestComparison | null;
}

/** Assemble a trade journal from entry snapshot and label result. Pure function. */
export function assembleJournal(input: AssemblerInput): TradeJournal {
	return {
		id: crypto.randomUUID(),
		eventId: input.entrySnapshot.eventId,
		strategyId: input.entrySnapshot.strategyId,
		strategyVersion: input.strategyVersion,
		symbol: input.entrySnapshot.symbol,
		timeframe: input.timeframe,
		direction: input.entrySnapshot.decision.direction,
		entryPrice: input.entrySnapshot.entryPrice,
		exitPrice: input.labelResult.exitPrice,
		entryTime: input.entryTime,
		exitTime: input.exitTime,
		resultType: input.labelResult.resultType,
		pnlPct: input.labelResult.pnlPct,
		mfePct: input.labelResult.mfePct,
		maePct: input.labelResult.maePct,
		holdBars: input.labelResult.holdBars,
		entrySnapshot: input.entrySnapshot,
		exitMarketContext: input.exitMarketContext ?? null,
		backtestComparison: input.backtestComparison ?? null,
		autoTags: [],
		createdAt: new Date(),
	};
}

import type { ConfidenceTier, Direction } from "../decision/types.js";
import type { ResultType } from "../label/types.js";
import type { MacroContext } from "../macro/types.js";

export interface SnapshotPattern {
	eventId: string;
	distance: number;
	resultType: ResultType | null;
}

export interface SnapshotDecision {
	direction: Direction;
	winrate: number;
	expectancy: number;
	sampleCount: number;
	ciLower: number;
	ciUpper: number;
	confidenceTier: ConfidenceTier;
}

export interface EntrySnapshot {
	id: string;
	eventId: string;
	strategyId: string;
	symbol: string;
	entryPrice: string;
	tpPrice: string;
	slPrice: string;
	decision: SnapshotDecision;
	matchedPatterns: SnapshotPattern[];
	featureVector: Record<string, number>;
	capturedAt: Date;
}

export type TrendDirection = "up" | "down" | "neutral";

export interface MarketContext {
	trend1h: TrendDirection | null;
	trend4h: TrendDirection | null;
	trend1d: TrendDirection | null;
	volatilityRatio: string | null;
	volumeRatio: string | null;
	fundingRate: string | null;
}

export interface TradeJournal {
	id: string;
	eventId: string;
	strategyId: string;
	strategyVersion: number;
	symbol: string;
	timeframe: string;
	direction: Direction;
	entryPrice: string;
	exitPrice: string;
	entryTime: Date;
	exitTime: Date;
	resultType: ResultType;
	pnlPct: number;
	mfePct: number;
	maePct: number;
	holdBars: number;
	entrySnapshot: EntrySnapshot;
	exitMarketContext: MarketContext | null;
	backtestComparison: BacktestComparison | null;
	entryMacroContext: MacroContext | null;
	autoTags: string[];
	isPaper: boolean;
	createdAt: Date;
}

export interface BacktestComparison {
	backtestWinrate: number;
	liveWinrate: number;
	backtestExpectancy: number;
	liveExpectancy: number;
}

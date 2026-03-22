import { describe, expect, test } from "bun:test";
import type { DecisionResult } from "../../packages/core/decision/types.js";
import { type AssemblerInput, assembleJournal } from "../../packages/core/journal/assembler.js";
import {
	type EntrySnapshotInput,
	buildEntrySnapshot,
} from "../../packages/core/journal/entry-snapshot.js";
import {
	type MarketContextInput,
	buildMarketContext,
} from "../../packages/core/journal/market-context.js";
import { generateTags } from "../../packages/core/journal/tagger.js";
import type { LabelResult } from "../../packages/core/label/types.js";

const DECISION_LONG: DecisionResult = {
	decision: "LONG",
	reason: "criteria_met",
	statistics: {
		winrate: 0.65,
		avgWin: 2.0,
		avgLoss: 1.0,
		expectancy: 1.2,
		sampleCount: 50,
	},
	ciLower: 0.52,
	ciUpper: 0.78,
	confidenceTier: "high",
};

const DECISION_SHORT: DecisionResult = {
	...DECISION_LONG,
	decision: "SHORT",
};

const MATCHED_PATTERNS = [
	{ eventId: "p-1", distance: 0.1, resultType: "WIN" },
	{ eventId: "p-2", distance: 0.15, resultType: "WIN" },
	{ eventId: "p-3", distance: 0.2, resultType: "WIN" },
	{ eventId: "p-4", distance: 0.25, resultType: "LOSS" },
	{ eventId: "p-5", distance: 0.3 },
];

const FEATURES = { rsi: 35, macd_histogram: -0.5, atr: 150, volume: 1500000 };

const LABEL_WIN: LabelResult = {
	resultType: "WIN",
	pnlPct: 1.8,
	mfePct: 2.1,
	maePct: 0.4,
	holdBars: 12,
	exitPrice: "66170",
	slHitFirst: false,
};

const LABEL_LOSS: LabelResult = {
	resultType: "LOSS",
	pnlPct: -0.9,
	mfePct: 0.3,
	maePct: 1.0,
	holdBars: 45,
	exitPrice: "64415",
	slHitFirst: true,
};

const EXIT_MARKET_DATA: MarketContextInput = {
	sma1h: { sma: 65500, price: 66000 },
	sma4h: { sma: 64800, price: 65500 },
	sma1d: { sma: 63200, price: 65500 },
	volatility: { currentAtr: "180", avgAtr: "100" },
	volume: { current: "2500000", average: "1000000" },
	fundingRate: "0.0002",
};

const BACKTEST_COMPARISON = {
	backtestWinrate: 0.6,
	liveWinrate: 0.55,
	backtestExpectancy: 1.0,
	liveExpectancy: 0.8,
};

function buildSnapshotInput(decision: DecisionResult): EntrySnapshotInput {
	return {
		eventId: "evt-100",
		strategyId: "strat-1",
		symbol: "BTCUSDT",
		entryPrice: "65000",
		tpPrice: "66300",
		slPrice: "64350",
		decision,
		matchedPatterns: MATCHED_PATTERNS,
		featureVector: FEATURES,
	};
}

describe("Trade Journal Integration", () => {
	test("A: full winning trade lifecycle", () => {
		const snapshot = buildEntrySnapshot(buildSnapshotInput(DECISION_LONG));
		const exitCtx = buildMarketContext(EXIT_MARKET_DATA);

		const journal = assembleJournal({
			entrySnapshot: snapshot,
			labelResult: LABEL_WIN,
			strategyVersion: 1,
			timeframe: "15m",
			entryTime: new Date("2026-03-22T10:00:00Z"),
			exitTime: new Date("2026-03-22T13:00:00Z"),
			exitMarketContext: exitCtx,
			backtestComparison: BACKTEST_COMPARISON,
		});

		const tags = generateTags(journal, 100, 2.0);

		expect(journal.direction).toBe("LONG");
		expect(journal.resultType).toBe("WIN");
		expect(journal.entryPrice).toBe("65000");
		expect(journal.exitPrice).toBe("66170");
		expect(journal.entrySnapshot.matchedPatterns).toHaveLength(5);
		expect(journal.backtestComparison).not.toBeNull();
		expect(journal.backtestComparison?.backtestWinrate).toBe(0.6);
		expect(tags).toContain("trending_up");
		expect(tags).toContain("with_trend");
		expect(tags).toContain("high_volatility");
		expect(tags).toContain("high_volume");
		expect(tags).toContain("quick_win");
		const sorted = [...tags].sort();
		expect(tags).toEqual(sorted);
	});

	test("B: full losing trade lifecycle", () => {
		const snapshot = buildEntrySnapshot(buildSnapshotInput(DECISION_LONG));
		const exitCtx = buildMarketContext(EXIT_MARKET_DATA);

		const journal = assembleJournal({
			entrySnapshot: snapshot,
			labelResult: LABEL_LOSS,
			strategyVersion: 1,
			timeframe: "15m",
			entryTime: new Date("2026-03-22T10:00:00Z"),
			exitTime: new Date("2026-03-22T14:15:00Z"),
			exitMarketContext: exitCtx,
			backtestComparison: BACKTEST_COMPARISON,
		});

		const tags = generateTags(journal, 100, 2.0);

		expect(journal.resultType).toBe("LOSS");
		expect(journal.pnlPct).toBeLessThan(0);
		expect(tags).toContain("slow_loss");
		expect(tags).not.toContain("quick_loss");
		expect(tags).not.toContain("quick_win");
		expect(tags).not.toContain("slow_win");
	});

	test("C: MFE high loss (gave back gains)", () => {
		const snapshot = buildEntrySnapshot(buildSnapshotInput(DECISION_LONG));
		const exitCtx = buildMarketContext(EXIT_MARKET_DATA);

		const mfeHighLabel: LabelResult = {
			...LABEL_LOSS,
			mfePct: 1.5,
			holdBars: 60,
		};

		const journal = assembleJournal({
			entrySnapshot: snapshot,
			labelResult: mfeHighLabel,
			strategyVersion: 1,
			timeframe: "15m",
			entryTime: new Date("2026-03-22T10:00:00Z"),
			exitTime: new Date("2026-03-22T16:00:00Z"),
			exitMarketContext: exitCtx,
		});

		const tags = generateTags(journal, 100, 2.0);
		expect(tags).toContain("mfe_high");
	});

	test("D: SHORT trade against trend", () => {
		const snapshot = buildEntrySnapshot(buildSnapshotInput(DECISION_SHORT));
		// Exit context with up trends → SHORT is against trend
		const upCtx = buildMarketContext(EXIT_MARKET_DATA);

		const journal = assembleJournal({
			entrySnapshot: snapshot,
			labelResult: LABEL_WIN,
			strategyVersion: 1,
			timeframe: "15m",
			entryTime: new Date("2026-03-22T10:00:00Z"),
			exitTime: new Date("2026-03-22T13:00:00Z"),
			exitMarketContext: upCtx,
		});

		const tags = generateTags(journal, 100, 2.0);
		expect(journal.direction).toBe("SHORT");
		expect(tags).toContain("against_trend");
	});

	test("E: minimal context (empty patterns, no backtest, no funding)", () => {
		const snapshot = buildEntrySnapshot({
			eventId: "evt-200",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			entryPrice: "65000",
			tpPrice: "66300",
			slPrice: "64350",
			decision: DECISION_LONG,
			matchedPatterns: [],
			featureVector: {},
		});

		const emptyCtx = buildMarketContext({});

		const journal = assembleJournal({
			entrySnapshot: snapshot,
			labelResult: LABEL_WIN,
			strategyVersion: 1,
			timeframe: "15m",
			entryTime: new Date("2026-03-22T10:00:00Z"),
			exitTime: new Date("2026-03-22T13:00:00Z"),
			exitMarketContext: emptyCtx,
		});

		const tags = generateTags(journal, 100, 2.0);
		expect(journal.entrySnapshot.matchedPatterns).toEqual([]);
		expect(journal.backtestComparison).toBeNull();
		expect(tags).toContain("ranging");
		expect(tags).not.toContain("high_funding");
		expect(tags).not.toContain("low_funding");
	});

	test("F: pipeline output types are correct", () => {
		const snapshot = buildEntrySnapshot(buildSnapshotInput(DECISION_LONG));
		const exitCtx = buildMarketContext(EXIT_MARKET_DATA);

		const journal = assembleJournal({
			entrySnapshot: snapshot,
			labelResult: LABEL_WIN,
			strategyVersion: 1,
			timeframe: "15m",
			entryTime: new Date("2026-03-22T10:00:00Z"),
			exitTime: new Date("2026-03-22T13:00:00Z"),
			exitMarketContext: exitCtx,
		});

		const tags = generateTags(journal, 100, 2.0);

		// Snapshot fields
		expect(snapshot.decision).toBeDefined();
		expect(snapshot.matchedPatterns).toBeDefined();
		expect(snapshot.featureVector).toBeDefined();
		expect(snapshot.entryPrice).toBe("65000");
		expect(snapshot.tpPrice).toBe("66300");
		expect(snapshot.slPrice).toBe("64350");
		expect(snapshot.capturedAt).toBeInstanceOf(Date);

		// Market context fields
		expect(exitCtx.trend1h).toBeDefined();
		expect(exitCtx.volatilityRatio).toBeDefined();
		expect(exitCtx.volumeRatio).toBeDefined();
		expect(exitCtx.fundingRate).toBeDefined();

		// Journal fields
		expect(journal.id).toBeDefined();
		expect(journal.eventId).toBeDefined();
		expect(journal.entryTime).toBeInstanceOf(Date);
		expect(journal.exitTime).toBeInstanceOf(Date);
		expect(journal.createdAt).toBeInstanceOf(Date);

		// Tags
		expect(Array.isArray(tags)).toBe(true);
		expect(tags.length).toBeGreaterThanOrEqual(2);
	});

	test("G: deterministic pipeline", () => {
		const input = buildSnapshotInput(DECISION_LONG);
		const snap1 = buildEntrySnapshot(input);
		const snap2 = buildEntrySnapshot(input);

		const exitCtx = buildMarketContext(EXIT_MARKET_DATA);

		const base: Omit<AssemblerInput, "entrySnapshot"> = {
			labelResult: LABEL_WIN,
			strategyVersion: 1,
			timeframe: "15m",
			entryTime: new Date("2026-03-22T10:00:00Z"),
			exitTime: new Date("2026-03-22T13:00:00Z"),
			exitMarketContext: exitCtx,
		};

		const j1 = assembleJournal({ ...base, entrySnapshot: snap1 });
		const j2 = assembleJournal({ ...base, entrySnapshot: snap2 });

		// Deterministic fields (ids are random, so compare everything else)
		expect(j1.direction).toBe(j2.direction);
		expect(j1.resultType).toBe(j2.resultType);
		expect(j1.entryPrice).toBe(j2.entryPrice);
		expect(j1.exitPrice).toBe(j2.exitPrice);
		expect(j1.pnlPct).toBe(j2.pnlPct);

		const tags1 = generateTags(j1, 100, 2.0);
		const tags2 = generateTags(j2, 100, 2.0);
		expect(tags1).toEqual(tags2);
	});
});

import { describe, expect, test } from "bun:test";
import { type AssemblerInput, assembleJournal } from "../assembler.js";
import type { EntrySnapshot, MarketContext } from "../types.js";

function makeSnapshot(overrides: Partial<EntrySnapshot> = {}): EntrySnapshot {
	return {
		id: "snap-1",
		eventId: "evt-1",
		strategyId: "strat-1",
		symbol: "BTCUSDT",
		entryPrice: "50000",
		tpPrice: "51000",
		slPrice: "49500",
		decision: {
			direction: "LONG",
			winrate: 0.65,
			expectancy: 0.95,
			sampleCount: 50,
			ciLower: 0.52,
			ciUpper: 0.78,
			confidenceTier: "high",
		},
		matchedPatterns: [],
		featureVector: { rsi: 55 },
		capturedAt: new Date("2026-03-22T10:00:00Z"),
		...overrides,
	};
}

function makeInput(overrides: Partial<AssemblerInput> = {}): AssemblerInput {
	return {
		entrySnapshot: makeSnapshot(),
		labelResult: {
			resultType: "WIN",
			pnlPct: 2.0,
			mfePct: 2.5,
			maePct: 0.3,
			holdBars: 12,
			exitPrice: "51000",
			slHitFirst: false,
		},
		strategyVersion: 1,
		timeframe: "15m",
		entryTime: new Date("2026-03-22T10:00:00Z"),
		exitTime: new Date("2026-03-22T13:00:00Z"),
		...overrides,
	};
}

describe("JournalAssembler", () => {
	test("assembles journal with all core fields", () => {
		const journal = assembleJournal(makeInput());
		expect(journal.eventId).toBe("evt-1");
		expect(journal.strategyId).toBe("strat-1");
		expect(journal.symbol).toBe("BTCUSDT");
		expect(journal.direction).toBe("LONG");
		expect(journal.entryPrice).toBe("50000");
		expect(journal.exitPrice).toBe("51000");
		expect(journal.resultType).toBe("WIN");
		expect(journal.pnlPct).toBe(2.0);
		expect(journal.holdBars).toBe(12);
	});

	test("includes MFE/MAE from label result", () => {
		const journal = assembleJournal(makeInput());
		expect(journal.mfePct).toBe(2.5);
		expect(journal.maePct).toBe(0.3);
	});

	test("generates unique id", () => {
		const j1 = assembleJournal(makeInput());
		const j2 = assembleJournal(makeInput());
		expect(j1.id).not.toBe(j2.id);
	});

	test("includes exit market context when provided", () => {
		const exitCtx: MarketContext = {
			trend1h: "up",
			trend4h: "down",
			trend1d: "neutral",
			volatilityRatio: "1.5",
			volumeRatio: "2.0",
			fundingRate: "0.0001",
		};
		const journal = assembleJournal(makeInput({ exitMarketContext: exitCtx }));
		expect(journal.exitMarketContext).toEqual(exitCtx);
	});

	test("null exit context when not provided", () => {
		const journal = assembleJournal(makeInput());
		expect(journal.exitMarketContext).toBeNull();
	});

	test("includes backtest comparison when provided", () => {
		const comparison = {
			backtestWinrate: 0.65,
			liveWinrate: 0.58,
			backtestExpectancy: 0.95,
			liveExpectancy: 0.72,
		};
		const journal = assembleJournal(makeInput({ backtestComparison: comparison }));
		expect(journal.backtestComparison).toEqual(comparison);
	});

	test("autoTags starts empty", () => {
		const journal = assembleJournal(makeInput());
		expect(journal.autoTags).toEqual([]);
	});

	test("preserves entry snapshot reference", () => {
		const snap = makeSnapshot({ eventId: "evt-99" });
		const journal = assembleJournal(makeInput({ entrySnapshot: snap }));
		expect(journal.entrySnapshot.eventId).toBe("evt-99");
	});
});

import { describe, expect, test } from "bun:test";
import { DEFAULT_TAGGER_CONFIG, type TaggerConfig, generateTags } from "../tagger.js";
import type { TradeJournal } from "../types.js";

function makeJournal(overrides: Partial<TradeJournal> = {}): TradeJournal {
	return {
		id: "j-1",
		eventId: "evt-1",
		strategyId: "strat-1",
		strategyVersion: 1,
		symbol: "BTCUSDT",
		timeframe: "15m",
		direction: "LONG",
		entryPrice: "65000",
		exitPrice: "66170",
		entryTime: new Date("2026-03-22T10:00:00Z"),
		exitTime: new Date("2026-03-22T13:00:00Z"),
		resultType: "WIN",
		pnlPct: 1.8,
		mfePct: 2.1,
		maePct: 0.3,
		holdBars: 12,
		entrySnapshot: {
			id: "snap-1",
			eventId: "evt-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			entryPrice: "65000",
			tpPrice: "66300",
			slPrice: "64350",
			decision: {
				direction: "LONG",
				winrate: 0.65,
				expectancy: 1.2,
				sampleCount: 50,
				ciLower: 0.52,
				ciUpper: 0.78,
				confidenceTier: "high",
			},
			matchedPatterns: [],
			featureVector: { rsi: 55 },
			capturedAt: new Date("2026-03-22T10:00:00Z"),
		},
		exitMarketContext: {
			trend1h: "up",
			trend4h: "up",
			trend1d: "up",
			volatilityRatio: "1.8",
			volumeRatio: "1.0",
			fundingRate: "0.0001",
		},
		backtestComparison: null,
		autoTags: [],
		createdAt: new Date("2026-03-22T13:00:00Z"),
		...overrides,
	};
}

describe("Auto-tagger", () => {
	test("A: trending up, high volatility, LONG win with trend", () => {
		const journal = makeJournal();
		const tags = generateTags(journal, 100, 2.0);
		expect(tags).toContain("trending_up");
		expect(tags).toContain("with_trend");
		expect(tags).toContain("high_volatility");
		expect(tags).toContain("quick_win");
		expect(tags).toContain("clean_win");
		expect(tags).toContain("low_funding");
	});

	test("B: trending down, SHORT win with trend", () => {
		const journal = makeJournal({
			direction: "SHORT",
			exitMarketContext: {
				trend1h: "down",
				trend4h: "down",
				trend1d: "down",
				volatilityRatio: "0.5",
				volumeRatio: "1.0",
				fundingRate: "0.0001",
			},
		});
		const tags = generateTags(journal, 100, 2.0);
		expect(tags).toContain("trending_down");
		expect(tags).toContain("with_trend");
		expect(tags).toContain("low_volatility");
	});

	test("C: against trend LONG loss", () => {
		const journal = makeJournal({
			resultType: "LOSS",
			pnlPct: -0.9,
			holdBars: 80,
			exitMarketContext: {
				trend1h: "up",
				trend4h: "down",
				trend1d: "down",
				volatilityRatio: "1.0",
				volumeRatio: "1.0",
				fundingRate: "0.0001",
			},
		});
		const tags = generateTags(journal, 100, 2.0);
		expect(tags).toContain("against_trend");
		expect(tags).toContain("slow_loss");
		expect(tags).toContain("trending_down");
	});

	test("D: MFE high loss (gave back gains)", () => {
		const journal = makeJournal({
			resultType: "LOSS",
			pnlPct: -0.5,
			mfePct: 1.5,
			maePct: 0.8,
		});
		const tags = generateTags(journal, 100, 2.0);
		expect(tags).toContain("mfe_high");
	});

	test("E: no trends → ranging", () => {
		const journal = makeJournal({
			exitMarketContext: {
				trend1h: null,
				trend4h: null,
				trend1d: null,
				volatilityRatio: null,
				volumeRatio: null,
				fundingRate: null,
			},
		});
		const tags = generateTags(journal, 100, 2.0);
		expect(tags).toContain("ranging");
	});

	test("F: null funding rate → no funding tag", () => {
		const journal = makeJournal({
			exitMarketContext: {
				trend1h: "up",
				trend4h: "up",
				trend1d: "up",
				volatilityRatio: "1.0",
				volumeRatio: "1.0",
				fundingRate: null,
			},
		});
		const tags = generateTags(journal, 100, 2.0);
		expect(tags).not.toContain("high_funding");
		expect(tags).not.toContain("low_funding");
	});

	test("G: high funding", () => {
		const journal = makeJournal({
			exitMarketContext: {
				trend1h: "up",
				trend4h: "up",
				trend1d: "up",
				volatilityRatio: "1.0",
				volumeRatio: "1.0",
				fundingRate: "0.001",
			},
		});
		const tags = generateTags(journal, 100, 2.0);
		expect(tags).toContain("high_funding");
	});

	test("H: low funding", () => {
		const journal = makeJournal({
			exitMarketContext: {
				trend1h: "up",
				trend4h: "up",
				trend1d: "up",
				volatilityRatio: "1.0",
				volumeRatio: "1.0",
				fundingRate: "0.0001",
			},
		});
		const tags = generateTags(journal, 100, 2.0);
		expect(tags).toContain("low_funding");
	});

	test("I: high volume", () => {
		const journal = makeJournal({
			exitMarketContext: {
				trend1h: "up",
				trend4h: "up",
				trend1d: "up",
				volatilityRatio: "1.0",
				volumeRatio: "2.0",
				fundingRate: "0.0001",
			},
		});
		const tags = generateTags(journal, 100, 2.0);
		expect(tags).toContain("high_volume");
	});

	test("J: tags are sorted alphabetically", () => {
		const journal = makeJournal();
		const tags = generateTags(journal, 100, 2.0);
		const sorted = [...tags].sort();
		expect(tags).toEqual(sorted);
	});

	test("K: deterministic output", () => {
		const journal = makeJournal();
		const tags1 = generateTags(journal, 100, 2.0);
		const tags2 = generateTags(journal, 100, 2.0);
		expect(tags1).toEqual(tags2);
	});

	test("L: TIME_EXIT with positive pnl treated as win", () => {
		const journal = makeJournal({ resultType: "TIME_EXIT", pnlPct: 0.5 });
		const tags = generateTags(journal, 100, 2.0);
		expect(tags).not.toContain("quick_loss");
		expect(tags).not.toContain("slow_loss");
	});

	test("M: custom config overrides defaults", () => {
		const journal = makeJournal();
		const config: TaggerConfig = {
			...DEFAULT_TAGGER_CONFIG,
			volatilityHighThreshold: "2.0",
		};
		const tags = generateTags(journal, 100, 2.0, config);
		// volatilityRatio="1.8" < 2.0 so no high_volatility
		expect(tags).not.toContain("high_volatility");
	});

	test("null exitMarketContext → ranging, no market tags", () => {
		const journal = makeJournal({ exitMarketContext: null });
		const tags = generateTags(journal, 100, 2.0);
		expect(tags).toContain("ranging");
		expect(tags).not.toContain("high_volatility");
		expect(tags).not.toContain("high_volume");
		expect(tags).not.toContain("high_funding");
	});
});

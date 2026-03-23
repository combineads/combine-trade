import { describe, expect, test } from "bun:test";
import { type RetrospectivePromptInput, buildRetrospectivePrompt } from "../prompt-builder.js";

function makeInput(overrides: Partial<RetrospectivePromptInput> = {}): RetrospectivePromptInput {
	return {
		strategyName: "BTC-RSI-Mean-Reversion",
		symbol: "BTCUSDT",
		direction: "LONG",
		timeframe: "1h",
		entryPrice: 65000,
		exitPrice: 64200,
		pnlPercent: -1.23,
		result: "LOSS",
		holdBars: 5,
		winrate: 0.62,
		expectancy: 0.42,
		sampleCount: 47,
		confidenceTier: "HIGH",
		features: { RSI: 38, ATR: 2.1, OBV: 1500 },
		mfePercent: 0.8,
		maePercent: -1.5,
		macroContext: {
			entryEvents: [
				{
					id: "evt-1",
					externalId: "ext-1",
					title: "★★★ FOMC Rate Decision",
					eventName: "FOMC Rate Decision",
					impact: "HIGH",
					scheduledAt: new Date("2026-03-22T18:00:00Z"),
					newsCollected: true,
					newsCollectedAt: new Date(),
					createdAt: new Date(),
				},
			],
			entryNews: [
				{
					id: "news-1",
					externalId: "ext-n1",
					headline: "Fed signals rate hold amid inflation concerns",
					source: "Reuters",
					publishedAt: new Date("2026-03-22T18:15:00Z"),
					tags: ["fed", "rates"],
					economicEventId: "evt-1",
					createdAt: new Date(),
				},
			],
			exitEvents: [],
			exitNews: [],
		},
		...overrides,
	};
}

describe("buildRetrospectivePrompt", () => {
	test("includes strategy info section", () => {
		const prompt = buildRetrospectivePrompt(makeInput());
		expect(prompt).toContain("BTC-RSI-Mean-Reversion");
		expect(prompt).toContain("BTCUSDT");
		expect(prompt).toContain("LONG");
		expect(prompt).toContain("1h");
	});

	test("includes trade result section", () => {
		const prompt = buildRetrospectivePrompt(makeInput());
		expect(prompt).toContain("65000");
		expect(prompt).toContain("64200");
		expect(prompt).toContain("-1.23");
		expect(prompt).toContain("LOSS");
	});

	test("includes decision basis section", () => {
		const prompt = buildRetrospectivePrompt(makeInput());
		expect(prompt).toContain("0.62");
		expect(prompt).toContain("0.42");
		expect(prompt).toContain("47");
		expect(prompt).toContain("HIGH");
	});

	test("includes features section", () => {
		const prompt = buildRetrospectivePrompt(makeInput());
		expect(prompt).toContain("RSI");
		expect(prompt).toContain("38");
		expect(prompt).toContain("ATR");
	});

	test("includes MFE/MAE section", () => {
		const prompt = buildRetrospectivePrompt(makeInput());
		expect(prompt).toContain("0.8");
		expect(prompt).toContain("-1.5");
	});

	test("includes economic events section", () => {
		const prompt = buildRetrospectivePrompt(makeInput());
		expect(prompt).toContain("FOMC Rate Decision");
		expect(prompt).toContain("HIGH");
	});

	test("includes news section", () => {
		const prompt = buildRetrospectivePrompt(makeInput());
		expect(prompt).toContain("Fed signals rate hold");
		expect(prompt).toContain("Reuters");
	});

	test("requests Korean language output", () => {
		const prompt = buildRetrospectivePrompt(makeInput());
		expect(prompt).toContain("한국어");
	});

	test("omits macro sections when no events/news", () => {
		const input = makeInput({
			macroContext: {
				entryEvents: [],
				entryNews: [],
				exitEvents: [],
				exitNews: [],
			},
		});
		const prompt = buildRetrospectivePrompt(input);
		expect(prompt).not.toContain("FOMC");
		expect(prompt).toContain("경제 이벤트 없음");
	});

	test("handles missing optional features", () => {
		const input = makeInput({ features: {} });
		const prompt = buildRetrospectivePrompt(input);
		expect(prompt).toContain("BTC-RSI-Mean-Reversion");
	});
});

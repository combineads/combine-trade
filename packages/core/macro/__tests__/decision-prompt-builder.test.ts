import { describe, expect, test } from "bun:test";
import {
	type DecisionPromptInput,
	buildDecisionPrompt,
} from "../decision-prompt-builder.js";

function makeInput(
	overrides: Partial<DecisionPromptInput> = {},
): DecisionPromptInput {
	return {
		knnResult: {
			direction: "LONG",
			winrate: 0.62,
			expectancy: 0.42,
			sampleCount: 47,
			confidenceTier: "HIGH",
		},
		currentFeatures: { RSI: 38, ATR: 2.1, OBV: 1500 },
		recentTrades: [
			{
				daysAgo: 3,
				direction: "LONG",
				result: "LOSS",
				pnlPercent: -0.8,
				tags: ["cpi_day", "geopolitical_risk"],
			},
			{
				daysAgo: 5,
				direction: "LONG",
				result: "WIN",
				pnlPercent: 1.2,
				tags: ["normal_day"],
			},
		],
		macroContext: {
			upcomingEvents: [
				{ name: "FOMC Rate Decision", impact: "HIGH", hoursUntil: -1 },
			],
			recentNews: [
				{
					headline: "Trump threatens Gulf energy sanctions",
					hoursAgo: 2,
				},
			],
			highImpactNext24h: 2,
		},
		...overrides,
	};
}

describe("buildDecisionPrompt", () => {
	test("includes kNN result section", () => {
		const prompt = buildDecisionPrompt(makeInput());
		expect(prompt).toContain("0.62");
		expect(prompt).toContain("0.42");
		expect(prompt).toContain("47");
		expect(prompt).toContain("HIGH");
		expect(prompt).toContain("LONG");
	});

	test("includes current features", () => {
		const prompt = buildDecisionPrompt(makeInput());
		expect(prompt).toContain("RSI");
		expect(prompt).toContain("38");
		expect(prompt).toContain("ATR");
	});

	test("includes recent trade history", () => {
		const prompt = buildDecisionPrompt(makeInput());
		expect(prompt).toContain("3일 전");
		expect(prompt).toContain("LOSS");
		expect(prompt).toContain("-0.8%");
		expect(prompt).toContain("cpi_day");
	});

	test("includes macro context", () => {
		const prompt = buildDecisionPrompt(makeInput());
		expect(prompt).toContain("FOMC Rate Decision");
		expect(prompt).toContain("Trump threatens Gulf energy sanctions");
	});

	test("includes JSON output format instruction", () => {
		const prompt = buildDecisionPrompt(makeInput());
		expect(prompt).toContain("CONFIRM");
		expect(prompt).toContain("PASS");
		expect(prompt).toContain("REDUCE_SIZE");
		expect(prompt).toContain("action");
		expect(prompt).toContain("reason");
		expect(prompt).toContain("confidence");
		expect(prompt).toContain("risk_factors");
	});

	test("handles empty recent trades", () => {
		const input = makeInput({ recentTrades: [] });
		const prompt = buildDecisionPrompt(input);
		expect(prompt).toContain("최근 매매 이력 없음");
	});

	test("handles empty macro context", () => {
		const input = makeInput({
			macroContext: {
				upcomingEvents: [],
				recentNews: [],
				highImpactNext24h: 0,
			},
		});
		const prompt = buildDecisionPrompt(input);
		expect(prompt).toContain("예정된 경제 이벤트 없음");
	});

	test("handles empty features", () => {
		const input = makeInput({ currentFeatures: {} });
		const prompt = buildDecisionPrompt(input);
		expect(prompt).toContain("LONG");
	});
});

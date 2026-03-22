import { describe, expect, test } from "bun:test";
import type { DecisionResult } from "@combine/core/decision";
import { formatAlertMessage } from "../formatter.js";
import type { AlertContext, HeaderBlock, SectionBlock } from "../types.js";

function makeDecisionResult(overrides: Partial<DecisionResult> = {}): DecisionResult {
	return {
		decision: "LONG",
		reason: "criteria_met",
		statistics: {
			winrate: 0.573,
			avgWin: 2.1,
			avgLoss: 1.0,
			expectancy: 0.7773,
			sampleCount: 85,
			status: "SUFFICIENT",
		},
		ciLower: 0.462,
		ciUpper: 0.679,
		confidenceTier: "medium",
		...overrides,
	};
}

const ctx: AlertContext = {
	strategyName: "SMA Cross v2",
	symbol: "BTCUSDT",
	timeframe: "1m",
	entryPrice: "50000.00",
	tp: "51000.00",
	sl: "49500.00",
	topSimilarity: 0.85,
};

describe("formatAlertMessage", () => {
	test("LONG result → header contains LONG and symbol", () => {
		const msg = formatAlertMessage(makeDecisionResult(), ctx);
		const header = msg.blocks[0] as HeaderBlock;
		expect(header.type).toBe("header");
		expect(header.text.text).toContain("LONG");
		expect(header.text.text).toContain("BTCUSDT");
	});

	test("SHORT result → header contains SHORT", () => {
		const msg = formatAlertMessage(makeDecisionResult({ decision: "SHORT" }), ctx);
		const header = msg.blocks[0] as HeaderBlock;
		expect(header.text.text).toContain("SHORT");
	});

	test("PASS result → throws", () => {
		expect(() => formatAlertMessage(makeDecisionResult({ decision: "PASS" }), ctx)).toThrow();
	});

	test("blocks array has exactly 4 elements: header, prices, stats, divider", () => {
		const msg = formatAlertMessage(makeDecisionResult(), ctx);
		expect(msg.blocks).toHaveLength(4);
		expect(msg.blocks[0]!.type).toBe("header");
		expect(msg.blocks[1]!.type).toBe("section");
		expect(msg.blocks[2]!.type).toBe("section");
		expect(msg.blocks[3]!.type).toBe("divider");
	});

	test("prices section contains entry, TP, SL", () => {
		const msg = formatAlertMessage(makeDecisionResult(), ctx);
		const pricesBlock = msg.blocks[1] as SectionBlock;
		expect(pricesBlock.text.text).toContain("50000.00");
		expect(pricesBlock.text.text).toContain("51000.00");
		expect(pricesBlock.text.text).toContain("49500.00");
	});

	test("statistics section contains winrate formatted as percentage", () => {
		const msg = formatAlertMessage(makeDecisionResult(), ctx);
		const statsBlock = msg.blocks[2] as SectionBlock;
		expect(statsBlock.text.text).toContain("57.3%");
	});

	test("statistics section contains topSimilarity", () => {
		const msg = formatAlertMessage(makeDecisionResult(), ctx);
		const statsBlock = msg.blocks[2] as SectionBlock;
		expect(statsBlock.text.text).toContain("0.85");
	});

	test("output is valid JSON round-trip", () => {
		const msg = formatAlertMessage(makeDecisionResult(), ctx);
		const roundTripped = JSON.parse(JSON.stringify(msg));
		expect(roundTripped.blocks).toHaveLength(4);
	});
});

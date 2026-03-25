import { describe, expect, test } from "bun:test";
import type { DecisionResult } from "@combine/core/decision";
import { formatAlertMessage } from "../formatter.js";
import type { AlertContext, HeaderBlock } from "../types.js";

function makeDecisionResult(overrides: Partial<DecisionResult> = {}): DecisionResult {
	return {
		decision: "LONG",
		reason: "criteria_met",
		statistics: {
			winrate: 0.6,
			avgWin: 2,
			avgLoss: 1,
			expectancy: 0.8,
			sampleCount: 50,
			status: "SUFFICIENT",
		},
		ciLower: 0.45,
		ciUpper: 0.74,
		confidenceTier: "low",
		...overrides,
	};
}

const ctx: AlertContext = {
	strategyName: "SMA Cross",
	symbol: "BTCUSDT",
	timeframe: "1m",
	entryPrice: "50000",
	tp: "51000",
	sl: "49500",
	topSimilarity: 0.9,
};

describe("formatAlertMessage paper-tag", () => {
	test("paper mode → header starts with [모의매매]", () => {
		const msg = formatAlertMessage(makeDecisionResult(), ctx, "paper");
		const header = msg.blocks[0] as HeaderBlock;
		expect(header.text.text).toMatch(/^\[모의매매\]/);
	});

	test("paper mode → header contains decision and symbol after tag", () => {
		const msg = formatAlertMessage(makeDecisionResult(), ctx, "paper");
		const header = msg.blocks[0] as HeaderBlock;
		expect(header.text.text).toContain("[모의매매]");
		expect(header.text.text).toContain("LONG");
		expect(header.text.text).toContain("BTCUSDT");
	});

	test("live mode → header does not contain [모의매매]", () => {
		const msg = formatAlertMessage(makeDecisionResult(), ctx, "live");
		const header = msg.blocks[0] as HeaderBlock;
		expect(header.text.text).not.toContain("[모의매매]");
	});

	test("alert mode → header does not contain [모의매매]", () => {
		const msg = formatAlertMessage(makeDecisionResult(), ctx, "alert");
		const header = msg.blocks[0] as HeaderBlock;
		expect(header.text.text).not.toContain("[모의매매]");
	});

	test("no mode passed → header does not contain [모의매매]", () => {
		const msg = formatAlertMessage(makeDecisionResult(), ctx);
		const header = msg.blocks[0] as HeaderBlock;
		expect(header.text.text).not.toContain("[모의매매]");
	});
});

import { describe, expect, test } from "bun:test";
import { judge } from "@combine/core/decision";
import { labelEvent } from "@combine/core/label";
import type { CandleBar } from "@combine/core/label";
import { computeStatistics } from "@combine/core/vector/statistics.js";
import type { EventLabel } from "@combine/core/vector/statistics.js";

/**
 * Integration tests: label → statistics → decision end-to-end chain.
 */
describe("Label → Statistics → Decision integration", () => {
	test("full chain: label WIN events → compute stats → judge LONG", () => {
		// Generate 40 WIN labels via the labeler
		const labels: EventLabel[] = [];
		for (let i = 0; i < 40; i++) {
			const result = labelEvent({
				entryPrice: "50000",
				direction: "long",
				tpPct: 2,
				slPct: 1,
				maxHoldBars: 5,
				forwardCandles: [
					{ open: "50100", high: "50200", low: "49900", close: "50100" },
					{ open: "50100", high: "51100", low: "50000", close: "50800" }, // TP hit at bar 2
					{ open: "50800", high: "51000", low: "50500", close: "50700" },
					{ open: "50700", high: "50900", low: "50400", close: "50600" },
					{ open: "50600", high: "50800", low: "50300", close: "50500" },
				],
			});
			labels.push({ resultType: result.resultType, pnlPct: result.pnlPct });
		}

		// All should be WIN
		expect(labels.every((l) => l.resultType === "WIN")).toBe(true);

		// Compute statistics
		const stats = computeStatistics(labels);
		expect(stats.winrate).toBe(1);
		expect(stats.sampleCount).toBe(40);
		expect(stats.status).toBe("SUFFICIENT");

		// Decision engine should produce LONG
		const decision = judge(stats, "long");
		expect(decision.decision).toBe("LONG");
		expect(decision.reason).toBe("criteria_met");
	});

	test("PASS → LONG transition as WIN labels accumulate", () => {
		const labels: EventLabel[] = [];
		const winCandles: CandleBar[] = [
			{ open: "50100", high: "51100", low: "49900", close: "50800" }, // TP hit at bar 1
			{ open: "50800", high: "51000", low: "50500", close: "50700" },
			{ open: "50700", high: "50900", low: "50400", close: "50600" },
			{ open: "50600", high: "50800", low: "50300", close: "50500" },
			{ open: "50500", high: "50700", low: "50200", close: "50400" },
		];

		// Phase 1: only 20 labels → insufficient samples → PASS
		for (let i = 0; i < 20; i++) {
			const result = labelEvent({
				entryPrice: "50000",
				direction: "long",
				tpPct: 2,
				slPct: 1,
				maxHoldBars: 5,
				forwardCandles: winCandles,
			});
			labels.push({ resultType: result.resultType, pnlPct: result.pnlPct });
		}

		const stats20 = computeStatistics(labels);
		expect(stats20.status).toBe("INSUFFICIENT");

		const decision20 = judge(stats20, "long");
		expect(decision20.decision).toBe("PASS");
		expect(decision20.reason).toBe("insufficient_samples");

		// Phase 2: accumulate to 35 labels → sufficient → LONG
		for (let i = 0; i < 15; i++) {
			const result = labelEvent({
				entryPrice: "50000",
				direction: "long",
				tpPct: 2,
				slPct: 1,
				maxHoldBars: 5,
				forwardCandles: winCandles,
			});
			labels.push({ resultType: result.resultType, pnlPct: result.pnlPct });
		}

		const stats35 = computeStatistics(labels);
		expect(stats35.status).toBe("SUFFICIENT");
		expect(stats35.winrate).toBe(1);

		const decision35 = judge(stats35, "long");
		expect(decision35.decision).toBe("LONG");
		expect(decision35.reason).toBe("criteria_met");
	});

	test("simultaneous TP/SL → LOSS label → low winrate → PASS", () => {
		const labels: EventLabel[] = [];

		// 35 events where both TP and SL are hit simultaneously (conservative → LOSS)
		for (let i = 0; i < 35; i++) {
			const result = labelEvent({
				entryPrice: "50000",
				direction: "long",
				tpPct: 2,
				slPct: 1,
				maxHoldBars: 5,
				forwardCandles: [
					// Bar 1: high hits TP (51000), low hits SL (49500) → same candle
					{ open: "50000", high: "51100", low: "49400", close: "50000" },
					{ open: "50000", high: "50200", low: "49800", close: "50000" },
					{ open: "50000", high: "50200", low: "49800", close: "50000" },
					{ open: "50000", high: "50200", low: "49800", close: "50000" },
					{ open: "50000", high: "50200", low: "49800", close: "50000" },
				],
			});

			expect(result.resultType).toBe("LOSS");
			expect(result.slHitFirst).toBe(true);
			labels.push({ resultType: result.resultType, pnlPct: result.pnlPct });
		}

		// Stats: 0% winrate
		const stats = computeStatistics(labels);
		expect(stats.winrate).toBe(0);
		expect(stats.sampleCount).toBe(35);
		expect(stats.status).toBe("SUFFICIENT");

		// Decision: PASS (low winrate)
		const decision = judge(stats, "long");
		expect(decision.decision).toBe("PASS");
		expect(decision.reason).toBe("low_winrate");
	});

	test("TIME_EXIT scenario with correct pnl", () => {
		// No candle hits TP or SL → TIME_EXIT at last close
		const result = labelEvent({
			entryPrice: "50000",
			direction: "long",
			tpPct: 5,
			slPct: 5,
			maxHoldBars: 3,
			forwardCandles: [
				{ open: "50000", high: "50500", low: "49800", close: "50200" },
				{ open: "50200", high: "50600", low: "49900", close: "50100" },
				{ open: "50100", high: "50400", low: "49700", close: "50300" },
			],
		});

		expect(result.resultType).toBe("TIME_EXIT");
		expect(result.holdBars).toBe(3);
		expect(result.exitPrice).toBe("50300");
		// PnL: (50300-50000)/50000 * 100 = 0.6%
		expect(result.pnlPct).toBeCloseTo(0.6, 5);
		expect(result.slHitFirst).toBe(false);

		// TIME_EXIT with positive pnl → counted as win in statistics
		const labels: EventLabel[] = [{ resultType: "TIME_EXIT", pnlPct: result.pnlPct }];
		const stats = computeStatistics(labels);
		expect(stats.winrate).toBe(1); // positive pnl TIME_EXIT = win
	});

	test("confidence tier progression: low → medium → high with increasing samples", () => {
		const winCandles: CandleBar[] = [
			{ open: "50100", high: "51100", low: "49900", close: "50800" },
			{ open: "50800", high: "51000", low: "50500", close: "50700" },
			{ open: "50700", high: "50900", low: "50400", close: "50600" },
			{ open: "50600", high: "50800", low: "50300", close: "50500" },
			{ open: "50500", high: "50700", low: "50200", close: "50400" },
		];

		const labels: EventLabel[] = [];

		// Helper: label N more events and add to labels
		function addWinLabels(count: number) {
			for (let i = 0; i < count; i++) {
				const result = labelEvent({
					entryPrice: "50000",
					direction: "long",
					tpPct: 2,
					slPct: 1,
					maxHoldBars: 5,
					forwardCandles: winCandles,
				});
				labels.push({ resultType: result.resultType, pnlPct: result.pnlPct });
			}
		}

		// 40 samples → low confidence tier
		addWinLabels(40);
		let stats = computeStatistics(labels);
		let decision = judge(stats, "long");
		expect(decision.confidenceTier).toBe("low");
		expect(decision.decision).toBe("LONG");

		// 60 samples → medium confidence tier
		addWinLabels(20);
		stats = computeStatistics(labels);
		decision = judge(stats, "long");
		expect(decision.confidenceTier).toBe("medium");
		expect(decision.decision).toBe("LONG");

		// 150 samples → high confidence tier
		addWinLabels(90);
		stats = computeStatistics(labels);
		decision = judge(stats, "long");
		expect(decision.confidenceTier).toBe("high");
		expect(decision.decision).toBe("LONG");

		// 300 samples → very_high confidence tier
		addWinLabels(150);
		stats = computeStatistics(labels);
		decision = judge(stats, "long");
		expect(decision.confidenceTier).toBe("very_high");
		expect(decision.decision).toBe("LONG");
	});

	test("short direction: labels + decision produces SHORT", () => {
		const labels: EventLabel[] = [];

		for (let i = 0; i < 35; i++) {
			const result = labelEvent({
				entryPrice: "50000",
				direction: "short",
				tpPct: 2,
				slPct: 1,
				maxHoldBars: 5,
				forwardCandles: [
					// For short: TP when low <= 49000, SL when high >= 50500
					// This candle has low=48900 → TP hit
					{ open: "49900", high: "50100", low: "48900", close: "49000" },
					{ open: "49000", high: "49200", low: "48800", close: "49100" },
					{ open: "49100", high: "49300", low: "48900", close: "49000" },
					{ open: "49000", high: "49200", low: "48800", close: "49100" },
					{ open: "49100", high: "49300", low: "48900", close: "49000" },
				],
			});
			expect(result.resultType).toBe("WIN");
			labels.push({ resultType: result.resultType, pnlPct: result.pnlPct });
		}

		const stats = computeStatistics(labels);
		expect(stats.winrate).toBe(1);

		const decision = judge(stats, "short");
		expect(decision.decision).toBe("SHORT");
		expect(decision.reason).toBe("criteria_met");
	});

	test("mixed results: negative expectancy → PASS despite sufficient winrate", () => {
		const labels: EventLabel[] = [];

		// 20 WINs with small gain (0.5%)
		for (let i = 0; i < 20; i++) {
			labels.push({ resultType: "WIN", pnlPct: 0.5 });
		}

		// 15 LOSSes with large loss (2%)
		for (let i = 0; i < 15; i++) {
			labels.push({ resultType: "LOSS", pnlPct: -2 });
		}

		const stats = computeStatistics(labels);
		// winrate = 20/35 ≈ 0.571 > 0.55
		expect(stats.winrate).toBeCloseTo(20 / 35, 5);
		expect(stats.sampleCount).toBe(35);
		expect(stats.status).toBe("SUFFICIENT");
		// expectancy = 0.571 * 0.5 - 0.429 * 2 = 0.286 - 0.857 = -0.571
		expect(stats.expectancy).toBeLessThan(0);

		const decision = judge(stats, "long");
		expect(decision.decision).toBe("PASS");
		expect(decision.reason).toBe("negative_expectancy");
	});
});

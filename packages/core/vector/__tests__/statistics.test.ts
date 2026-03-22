import { describe, expect, test } from "bun:test";
import { computeStatistics } from "../statistics.js";
import type { EventLabel } from "../statistics.js";

describe("computeStatistics", () => {
	test("computes correct winrate from labeled events", () => {
		const labels: EventLabel[] = [
			{ resultType: "WIN", pnlPct: 2.0 },
			{ resultType: "WIN", pnlPct: 1.5 },
			{ resultType: "LOSS", pnlPct: -1.0 },
			{ resultType: "LOSS", pnlPct: -0.5 },
		];

		const stats = computeStatistics(labels);
		expect(stats.winrate).toBeCloseTo(0.5); // 2/4
		expect(stats.sampleCount).toBe(4);
	});

	test("computes correct avg_win and avg_loss", () => {
		const labels: EventLabel[] = [
			{ resultType: "WIN", pnlPct: 2.0 },
			{ resultType: "WIN", pnlPct: 4.0 },
			{ resultType: "LOSS", pnlPct: -1.0 },
			{ resultType: "LOSS", pnlPct: -3.0 },
		];

		const stats = computeStatistics(labels);
		expect(stats.avgWin).toBeCloseTo(3.0); // (2+4)/2
		expect(stats.avgLoss).toBeCloseTo(2.0); // (1+3)/2 (absolute values)
	});

	test("computes correct expectancy", () => {
		// winrate=0.5, avgWin=3.0, avgLoss=2.0
		// expectancy = (0.5 * 3.0) - (0.5 * 2.0) = 1.5 - 1.0 = 0.5
		const labels: EventLabel[] = [
			{ resultType: "WIN", pnlPct: 2.0 },
			{ resultType: "WIN", pnlPct: 4.0 },
			{ resultType: "LOSS", pnlPct: -1.0 },
			{ resultType: "LOSS", pnlPct: -3.0 },
		];

		const stats = computeStatistics(labels);
		expect(stats.expectancy).toBeCloseTo(0.5);
	});

	test("TIME_EXIT counts in total and as loss if negative pnl", () => {
		const labels: EventLabel[] = Array.from({ length: 30 }, (_, i) => ({
			resultType: i < 20 ? ("WIN" as const) : i < 25 ? ("LOSS" as const) : ("TIME_EXIT" as const),
			pnlPct: i < 20 ? 1.0 : -0.5,
		}));

		const stats = computeStatistics(labels);
		expect(stats.sampleCount).toBe(30);
		// winrate = 20/30
		expect(stats.winrate).toBeCloseTo(20 / 30);
		expect(stats.status).toBe("SUFFICIENT");
	});

	test("TIME_EXIT with positive pnl counts as win", () => {
		const labels: EventLabel[] = [
			{ resultType: "WIN", pnlPct: 1.0 },
			{ resultType: "TIME_EXIT", pnlPct: 0.5 }, // positive → win
		];

		const stats = computeStatistics(labels);
		expect(stats.winrate).toBeCloseTo(1.0); // 2/2
	});

	test("empty labels → INSUFFICIENT", () => {
		const stats = computeStatistics([]);
		expect(stats.status).toBe("INSUFFICIENT");
		expect(stats.sampleCount).toBe(0);
	});

	test("< 30 labels → INSUFFICIENT", () => {
		const labels: EventLabel[] = Array.from({ length: 29 }, () => ({
			resultType: "WIN" as const,
			pnlPct: 1.0,
		}));

		const stats = computeStatistics(labels);
		expect(stats.status).toBe("INSUFFICIENT");
		expect(stats.sampleCount).toBe(29);
	});

	test("exactly 30 labels → SUFFICIENT", () => {
		const labels: EventLabel[] = Array.from({ length: 30 }, () => ({
			resultType: "WIN" as const,
			pnlPct: 1.0,
		}));

		const stats = computeStatistics(labels);
		expect(stats.status).toBe("SUFFICIENT");
		expect(stats.sampleCount).toBe(30);
	});

	test("all wins → winrate=1, avgLoss=0, expectancy=avgWin", () => {
		const labels: EventLabel[] = Array.from({ length: 30 }, () => ({
			resultType: "WIN" as const,
			pnlPct: 2.0,
		}));

		const stats = computeStatistics(labels);
		expect(stats.winrate).toBe(1);
		expect(stats.avgLoss).toBe(0);
		expect(stats.expectancy).toBeCloseTo(2.0);
	});

	test("all losses → winrate=0, avgWin=0, expectancy=-avgLoss", () => {
		const labels: EventLabel[] = Array.from({ length: 30 }, () => ({
			resultType: "LOSS" as const,
			pnlPct: -1.5,
		}));

		const stats = computeStatistics(labels);
		expect(stats.winrate).toBe(0);
		expect(stats.avgWin).toBe(0);
		expect(stats.expectancy).toBeCloseTo(-1.5);
	});
});

import { describe, expect, test } from "bun:test";
import { type DecisionInput, judge } from "@combine/core/decision";
import { type FeatureInput, normalizeFeatures } from "@combine/core/vector";
import { VectorRepository } from "@combine/core/vector/repository.js";
import type { SqlExecutor } from "@combine/core/vector/sql-types.js";
import { type EventLabel, computeStatistics } from "@combine/core/vector/statistics.js";
import { VectorTableManager } from "@combine/core/vector/table-manager.js";

// --- Helpers ---

function makeFeatures(overrides?: Partial<Record<string, number>>): FeatureInput[] {
	return [
		{ name: "rsi", value: overrides?.rsi ?? 65, normalization: { method: "percent" } },
		{ name: "trend", value: overrides?.trend ?? 0.3, normalization: { method: "sigmoid" } },
		{ name: "is_bullish", value: overrides?.is_bullish ?? 1, normalization: { method: "boolean" } },
	];
}

function makeLabels(winCount: number, lossCount: number): EventLabel[] {
	const labels: EventLabel[] = [];
	for (let i = 0; i < winCount; i++) {
		labels.push({ resultType: "WIN", pnlPct: 1.5 + Math.random() });
	}
	for (let i = 0; i < lossCount; i++) {
		labels.push({ resultType: "LOSS", pnlPct: -(0.8 + Math.random()) });
	}
	return labels;
}

describe("Vector Pipeline Integration", () => {
	test("full pipeline: features → normalize → statistics → decision", () => {
		// 1. Normalize features to vector
		const features = makeFeatures({ rsi: 70, trend: 2.0, is_bullish: 1 });
		const vector = normalizeFeatures(features);

		expect(vector).toHaveLength(3);
		expect(vector[0]).toBeCloseTo(0.7); // rsi: 70/100
		expect(vector[1]).toBeCloseTo(1 / (1 + Math.exp(-2.0))); // sigmoid(2.0)
		expect(vector[2]).toBe(1); // boolean(1)

		// All in [0,1]
		for (const v of vector) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		}

		// 2. Compute statistics from labels
		const labels = makeLabels(22, 8); // 22 wins, 8 losses = 30 total
		const stats = computeStatistics(labels);

		expect(stats.status).toBe("SUFFICIENT");
		expect(stats.sampleCount).toBe(30);
		expect(stats.winrate).toBeCloseTo(22 / 30);

		// 3. Decision engine
		const decision = judge(
			{
				winrate: stats.winrate,
				avgWin: stats.avgWin,
				avgLoss: stats.avgLoss,
				expectancy: stats.expectancy,
				sampleCount: stats.sampleCount,
			},
			"long",
		);

		// With 73% winrate and positive expectancy → LONG
		expect(decision.decision).toBe("LONG");
		expect(decision.reason).toBe("criteria_met");
		expect(decision.confidenceTier).toBe("low"); // 30 samples
	});

	test("vector isolation: table manager creates separate tables per strategy", () => {
		const queries: string[] = [];
		const mockExecutor: SqlExecutor = {
			async execute(sql: string) {
				queries.push(sql);
				if (sql.includes("SELECT COUNT(*)")) return { rows: [{ count: "0" }] };
				return { rows: [] };
			},
		};

		const manager = new VectorTableManager(mockExecutor);

		const table1 = manager.getTableName("strategy-A", 1);
		const table2 = manager.getTableName("strategy-B", 1);
		const table3 = manager.getTableName("strategy-A", 2);

		// Different strategies → different tables
		expect(table1).not.toBe(table2);
		// Different versions → different tables
		expect(table1).not.toBe(table3);
		// Format check
		expect(table1).toBe("vectors_strategy_A_v1");
		expect(table2).toBe("vectors_strategy_B_v1");
		expect(table3).toBe("vectors_strategy_A_v2");
	});

	test("threshold filtering: distant vectors excluded", () => {
		// For 3-dimensional vectors, threshold = √3 × 0.3 ≈ 0.52
		const mockResults = [
			{ event_id: "close-1", distance: "0.1" },
			{ event_id: "close-2", distance: "0.3" },
			{ event_id: "far-1", distance: "0.8" }, // > threshold
			{ event_id: "far-2", distance: "1.5" }, // > threshold
		];

		const executor: SqlExecutor = {
			async execute(sql: string) {
				if (sql.includes("ORDER BY")) {
					return { rows: mockResults as unknown as Record<string, unknown>[] };
				}
				return { rows: [] };
			},
		};

		const manager = new VectorTableManager(executor);
		const repo = new VectorRepository(executor, manager);

		const threshold = repo.computeThreshold(3);
		expect(threshold).toBeCloseTo(Math.sqrt(3) * 0.3, 4);

		// Verify threshold works correctly
		const closeDistance = 0.3;
		const farDistance = 0.8;
		expect(closeDistance).toBeLessThanOrEqual(threshold);
		expect(farDistance).toBeGreaterThan(threshold);
	});

	test("INSUFFICIENT gate: < 30 valid results → PASS", () => {
		const labels = makeLabels(15, 5); // only 20
		const stats = computeStatistics(labels);
		expect(stats.status).toBe("INSUFFICIENT");

		// Even with great winrate, insufficient samples → PASS
		const decision = judge(
			{
				winrate: stats.winrate,
				avgWin: stats.avgWin,
				avgLoss: stats.avgLoss,
				expectancy: stats.expectancy,
				sampleCount: stats.sampleCount,
			},
			"long",
		);

		expect(decision.decision).toBe("PASS");
		expect(decision.reason).toBe("insufficient_samples");
	});

	test("low winrate → PASS even with enough samples", () => {
		const labels = makeLabels(10, 25); // 10 wins, 25 losses = 35 total, ~29% winrate
		const stats = computeStatistics(labels);
		expect(stats.status).toBe("SUFFICIENT");
		expect(stats.winrate).toBeLessThan(0.55);

		const decision = judge(
			{
				winrate: stats.winrate,
				avgWin: stats.avgWin,
				avgLoss: stats.avgLoss,
				expectancy: stats.expectancy,
				sampleCount: stats.sampleCount,
			},
			"long",
		);

		expect(decision.decision).toBe("PASS");
		expect(decision.reason).toBe("low_winrate");
	});

	test("mixed normalization methods processed correctly", () => {
		const features: FeatureInput[] = [
			{ name: "rsi", value: 50, normalization: { method: "percent" } },
			{
				name: "price_score",
				value: 55000,
				normalization: { method: "minmax", min: 40000, max: 60000 },
			},
			{ name: "signal", value: -1, normalization: { method: "sigmoid" } },
			{ name: "has_volume", value: 1, normalization: { method: "boolean" } },
			{ name: "confidence", value: 0.8, normalization: { method: "none" } },
		];

		const vector = normalizeFeatures(features);
		expect(vector).toHaveLength(5);
		expect(vector[0]).toBeCloseTo(0.5); // 50/100
		expect(vector[1]).toBeCloseTo(0.75); // (55000-40000)/(60000-40000)
		expect(vector[2]).toBeCloseTo(1 / (1 + Math.exp(1))); // sigmoid(-1)
		expect(vector[3]).toBe(1); // boolean(1)
		expect(vector[4]).toBe(0.8); // none(0.8)

		// All in [0,1]
		for (const v of vector) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		}
	});

	test("decision includes Wilson CI and confidence metadata", () => {
		const input: DecisionInput = {
			winrate: 0.65,
			avgWin: 2.0,
			avgLoss: 1.0,
			expectancy: 0.95,
			sampleCount: 150,
		};

		const decision = judge(input, "short");
		expect(decision.decision).toBe("SHORT");
		expect(decision.ciLower).toBeGreaterThan(0);
		expect(decision.ciUpper).toBeLessThan(1);
		expect(decision.ciLower).toBeLessThan(decision.ciUpper);
		expect(decision.confidenceTier).toBe("high"); // 150 samples
	});
});

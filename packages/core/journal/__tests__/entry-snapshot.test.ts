import { describe, expect, test } from "bun:test";
import { type EntrySnapshotInput, buildEntrySnapshot } from "../entry-snapshot.js";

function makeInput(overrides: Partial<EntrySnapshotInput> = {}): EntrySnapshotInput {
	return {
		eventId: "evt-1",
		strategyId: "strat-1",
		symbol: "BTCUSDT",
		entryPrice: "50000",
		tpPrice: "51000",
		slPrice: "49500",
		decision: {
			decision: "LONG",
			reason: "criteria_met",
			statistics: {
				winrate: 0.65,
				avgWin: 2.0,
				avgLoss: 1.0,
				expectancy: 0.95,
				sampleCount: 50,
			},
			ciLower: 0.52,
			ciUpper: 0.78,
			confidenceTier: "high",
		},
		matchedPatterns: [
			{ eventId: "p-1", distance: 0.1, resultType: "WIN" },
			{ eventId: "p-2", distance: 0.2, resultType: "LOSS" },
			{ eventId: "p-3", distance: 0.3 },
		],
		featureVector: { rsi: 55, macd: 0.5 },
		...overrides,
	};
}

describe("EntrySnapshot", () => {
	test("builds snapshot with correct decision fields", () => {
		const snap = buildEntrySnapshot(makeInput());
		expect(snap.decision.direction).toBe("LONG");
		expect(snap.decision.winrate).toBe(0.65);
		expect(snap.decision.expectancy).toBe(0.95);
		expect(snap.decision.sampleCount).toBe(50);
		expect(snap.decision.confidenceTier).toBe("high");
	});

	test("maps matched patterns correctly", () => {
		const snap = buildEntrySnapshot(makeInput());
		expect(snap.matchedPatterns).toHaveLength(3);
		expect(snap.matchedPatterns[0]?.eventId).toBe("p-1");
		expect(snap.matchedPatterns[0]?.resultType).toBe("WIN");
		expect(snap.matchedPatterns[2]?.resultType).toBeNull();
	});

	test("preserves feature vector", () => {
		const snap = buildEntrySnapshot(makeInput());
		expect(snap.featureVector).toEqual({ rsi: 55, macd: 0.5 });
	});

	test("does not mutate input feature vector", () => {
		const features = { rsi: 55 };
		const snap = buildEntrySnapshot(makeInput({ featureVector: features }));
		snap.featureVector.rsi = 99;
		expect(features.rsi).toBe(55);
	});

	test("generates unique id", () => {
		const snap1 = buildEntrySnapshot(makeInput());
		const snap2 = buildEntrySnapshot(makeInput());
		expect(snap1.id).not.toBe(snap2.id);
	});

	test("sets capturedAt to current time", () => {
		const before = Date.now();
		const snap = buildEntrySnapshot(makeInput());
		const after = Date.now();
		expect(snap.capturedAt.getTime()).toBeGreaterThanOrEqual(before);
		expect(snap.capturedAt.getTime()).toBeLessThanOrEqual(after);
	});

	test("preserves event and strategy metadata", () => {
		const snap = buildEntrySnapshot(makeInput());
		expect(snap.eventId).toBe("evt-1");
		expect(snap.strategyId).toBe("strat-1");
		expect(snap.symbol).toBe("BTCUSDT");
		expect(snap.entryPrice).toBe("50000");
		expect(snap.tpPrice).toBe("51000");
		expect(snap.slPrice).toBe("49500");
	});

	test("handles empty patterns array", () => {
		const snap = buildEntrySnapshot(makeInput({ matchedPatterns: [] }));
		expect(snap.matchedPatterns).toEqual([]);
	});

	test("SHORT decision captured correctly", () => {
		const input = makeInput({
			decision: {
				decision: "SHORT",
				reason: "criteria_met",
				statistics: { winrate: 0.6, avgWin: 1.5, avgLoss: 1.0, expectancy: 0.5, sampleCount: 40 },
				ciLower: 0.45,
				ciUpper: 0.75,
				confidenceTier: "medium",
			},
		});
		const snap = buildEntrySnapshot(input);
		expect(snap.decision.direction).toBe("SHORT");
		expect(snap.decision.confidenceTier).toBe("medium");
	});
});

import { describe, expect, test } from "bun:test";
import {
	type LossTrackerDeps,
	addLoss,
	checkLimits,
	getConsecutiveLosses,
	getTodayLoss,
	getWeekLoss,
} from "../loss-tracker.js";
import type { PnlRecord } from "../types.js";

function makeRecord(pnl: string, minutesAgo = 0): PnlRecord {
	return {
		id: crypto.randomUUID(),
		pnl,
		closedAt: new Date(Date.now() - minutesAgo * 60_000),
	};
}

describe("LossTracker", () => {
	describe("getTodayLoss", () => {
		test("no records → '0'", async () => {
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [],
				loadWeekRecords: async () => [],
				saveRecord: async () => {},
			};
			const loss = await getTodayLoss(deps);
			expect(loss).toBe("0");
		});

		test("records [-100, -50, 30] → net loss 120", async () => {
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [makeRecord("-100"), makeRecord("-50"), makeRecord("30")],
				loadWeekRecords: async () => [],
				saveRecord: async () => {},
			};
			const loss = await getTodayLoss(deps);
			expect(loss).toBe("120");
		});
	});

	describe("getWeekLoss", () => {
		test("records [-200, 50] → net loss 150", async () => {
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [],
				loadWeekRecords: async () => [makeRecord("-200"), makeRecord("50")],
				saveRecord: async () => {},
			};
			const loss = await getWeekLoss(deps);
			expect(loss).toBe("150");
		});
	});

	describe("getConsecutiveLosses", () => {
		test("records latest-first [-10, -20, 5, -30] → 2", async () => {
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [
					makeRecord("-10", 1), // most recent
					makeRecord("-20", 2),
					makeRecord("5", 3),
					makeRecord("-30", 4),
				],
				loadWeekRecords: async () => [],
				saveRecord: async () => {},
			};
			const count = await getConsecutiveLosses(deps);
			expect(count).toBe(2);
		});

		test("all losses → count equals total records", async () => {
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [
					makeRecord("-10", 1),
					makeRecord("-20", 2),
					makeRecord("-30", 3),
				],
				loadWeekRecords: async () => [],
				saveRecord: async () => {},
			};
			const count = await getConsecutiveLosses(deps);
			expect(count).toBe(3);
		});

		test("no records → 0", async () => {
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [],
				loadWeekRecords: async () => [],
				saveRecord: async () => {},
			};
			const count = await getConsecutiveLosses(deps);
			expect(count).toBe(0);
		});

		test("latest record is positive → 0", async () => {
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [makeRecord("50", 1), makeRecord("-10", 2)],
				loadWeekRecords: async () => [],
				saveRecord: async () => {},
			};
			const count = await getConsecutiveLosses(deps);
			expect(count).toBe(0);
		});
	});

	describe("checkLimits", () => {
		test("daily limit not breached → { breached: false }", async () => {
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [makeRecord("-100")],
				loadWeekRecords: async () => [makeRecord("-100")],
				saveRecord: async () => {},
			};
			const result = await checkLimits(
				"10000",
				{ dailyLimitPct: 3, weeklyLimitPct: 10, maxConsecutiveSl: 3 },
				deps,
			);
			expect(result.breached).toBe(false);
		});

		test("daily loss exceeds limit → breached with 'daily' reason", async () => {
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [makeRecord("-400")],
				loadWeekRecords: async () => [makeRecord("-400")],
				saveRecord: async () => {},
			};
			const result = await checkLimits(
				"10000",
				{ dailyLimitPct: 3, weeklyLimitPct: 10, maxConsecutiveSl: 3 },
				deps,
			);
			expect(result.breached).toBe(true);
			expect(result.reason?.toLowerCase()).toContain("daily");
		});

		test("weekly loss exceeds limit → breached with 'weekly' reason", async () => {
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [makeRecord("-100")],
				loadWeekRecords: async () => [makeRecord("-1100")],
				saveRecord: async () => {},
			};
			const result = await checkLimits(
				"10000",
				{ dailyLimitPct: 3, weeklyLimitPct: 10, maxConsecutiveSl: 3 },
				deps,
			);
			expect(result.breached).toBe(true);
			expect(result.reason?.toLowerCase()).toContain("weekly");
		});

		test("consecutive SL exceeds limit → breached with 'consecutive' reason", async () => {
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [
					makeRecord("-10", 1),
					makeRecord("-20", 2),
					makeRecord("-30", 3),
				],
				loadWeekRecords: async () => [makeRecord("-60")],
				saveRecord: async () => {},
			};
			const result = await checkLimits(
				"10000",
				{ dailyLimitPct: 3, weeklyLimitPct: 10, maxConsecutiveSl: 3 },
				deps,
			);
			expect(result.breached).toBe(true);
			expect(result.reason?.toLowerCase()).toContain("consecutive");
		});

		test("daily breach takes priority over weekly breach", async () => {
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [makeRecord("-400")],
				loadWeekRecords: async () => [makeRecord("-1100")],
				saveRecord: async () => {},
			};
			const result = await checkLimits(
				"10000",
				{ dailyLimitPct: 3, weeklyLimitPct: 10, maxConsecutiveSl: 3 },
				deps,
			);
			expect(result.breached).toBe(true);
			expect(result.reason?.toLowerCase()).toContain("daily");
		});
	});

	describe("addLoss", () => {
		test("calls saveRecord exactly once and returns the record", async () => {
			let saveCount = 0;
			const deps: LossTrackerDeps = {
				loadTodayRecords: async () => [],
				loadWeekRecords: async () => [],
				saveRecord: async () => {
					saveCount++;
				},
			};
			const record = await addLoss("-50", deps);
			expect(saveCount).toBe(1);
			expect(record.pnl).toBe("-50");
			expect(record.id).toBeDefined();
			expect(record.closedAt).toBeInstanceOf(Date);
		});
	});
});

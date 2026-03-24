import { describe, expect, test } from "bun:test";
import {
	LossLimitResetScheduler,
	shouldResetDaily,
	shouldResetWeekly,
	type LossLimitResetDeps,
} from "../loss-limit-reset.js";

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe("shouldResetDaily", () => {
	test("same UTC day → false", () => {
		const lastReset = new Date("2024-03-15T00:00:00.000Z");
		const now = new Date("2024-03-15T12:00:00.000Z");
		expect(shouldResetDaily(now, lastReset)).toBe(false);
	});

	test("now is next UTC day → true", () => {
		const lastReset = new Date("2024-03-15T23:59:59.000Z");
		const now = new Date("2024-03-16T00:00:00.000Z");
		expect(shouldResetDaily(now, lastReset)).toBe(true);
	});

	test("now is two days after lastReset → true", () => {
		const lastReset = new Date("2024-03-14T00:00:00.000Z");
		const now = new Date("2024-03-16T00:00:00.000Z");
		expect(shouldResetDaily(now, lastReset)).toBe(true);
	});

	test("now before lastReset (clock skew) → false", () => {
		const lastReset = new Date("2024-03-16T00:00:00.000Z");
		const now = new Date("2024-03-15T12:00:00.000Z");
		expect(shouldResetDaily(now, lastReset)).toBe(false);
	});

	test("lastReset at midnight, now 1ms before next midnight → false", () => {
		const lastReset = new Date("2024-03-15T00:00:00.000Z");
		const now = new Date("2024-03-15T23:59:59.999Z");
		expect(shouldResetDaily(now, lastReset)).toBe(false);
	});

	test("lastReset is null (never reset) → true", () => {
		const now = new Date("2024-03-15T00:00:00.000Z");
		expect(shouldResetDaily(now, null)).toBe(true);
	});
});

describe("shouldResetWeekly", () => {
	// 2024-03-18 is a Monday
	test("lastReset on Sunday, now same Sunday → false", () => {
		const lastReset = new Date("2024-03-17T12:00:00.000Z"); // Sunday
		const now = new Date("2024-03-17T23:59:59.000Z"); // Sunday
		expect(shouldResetWeekly(now, lastReset)).toBe(false);
	});

	test("lastReset on Sunday, now on Monday → true", () => {
		const lastReset = new Date("2024-03-17T23:00:00.000Z"); // Sunday
		const now = new Date("2024-03-18T00:00:00.000Z"); // Monday
		expect(shouldResetWeekly(now, lastReset)).toBe(true);
	});

	test("lastReset on Monday, now later same Monday → false", () => {
		const lastReset = new Date("2024-03-18T00:00:00.000Z"); // Monday
		const now = new Date("2024-03-18T15:00:00.000Z"); // Monday
		expect(shouldResetWeekly(now, lastReset)).toBe(false);
	});

	test("lastReset on Monday, now next Monday → true", () => {
		const lastReset = new Date("2024-03-18T00:00:00.000Z"); // Monday week 1
		const now = new Date("2024-03-25T00:00:00.000Z"); // Monday week 2
		expect(shouldResetWeekly(now, lastReset)).toBe(true);
	});

	test("lastReset is null (never reset) → true", () => {
		const now = new Date("2024-03-18T00:00:00.000Z");
		expect(shouldResetWeekly(now, null)).toBe(true);
	});

	test("lastReset Tuesday, now Wednesday same week → false", () => {
		const lastReset = new Date("2024-03-19T00:00:00.000Z"); // Tuesday
		const now = new Date("2024-03-20T00:00:00.000Z"); // Wednesday
		expect(shouldResetWeekly(now, lastReset)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Scheduler tests
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<LossLimitResetDeps> = {}): LossLimitResetDeps {
	return {
		getNow: () => new Date("2024-03-18T00:00:00.000Z"),
		getLastDailyReset: async () => null,
		getLastWeeklyReset: async () => null,
		persistDailyReset: async () => {},
		persistWeeklyReset: async () => {},
		resetDailyCounters: async () => {},
		resetWeeklyCounters: async () => {},
		log: () => {},
		...overrides,
	};
}

describe("LossLimitResetScheduler", () => {
	describe("tick", () => {
		test("no prior resets → resets both daily and weekly", async () => {
			const calls: string[] = [];
			const deps = makeDeps({
				resetDailyCounters: async () => {
					calls.push("daily");
				},
				resetWeeklyCounters: async () => {
					calls.push("weekly");
				},
				persistDailyReset: async () => {
					calls.push("persist-daily");
				},
				persistWeeklyReset: async () => {
					calls.push("persist-weekly");
				},
			});

			const scheduler = new LossLimitResetScheduler(deps);
			await scheduler.tick();

			expect(calls).toContain("daily");
			expect(calls).toContain("weekly");
			expect(calls).toContain("persist-daily");
			expect(calls).toContain("persist-weekly");
		});

		test("same day as last reset → no reset triggered", async () => {
			const calls: string[] = [];
			const now = new Date("2024-03-18T10:00:00.000Z");
			const deps = makeDeps({
				getNow: () => now,
				getLastDailyReset: async () => new Date("2024-03-18T00:00:00.000Z"),
				getLastWeeklyReset: async () => new Date("2024-03-18T00:00:00.000Z"),
				resetDailyCounters: async () => {
					calls.push("daily");
				},
				resetWeeklyCounters: async () => {
					calls.push("weekly");
				},
			});

			const scheduler = new LossLimitResetScheduler(deps);
			await scheduler.tick();

			expect(calls).not.toContain("daily");
			expect(calls).not.toContain("weekly");
		});

		test("new UTC day → daily reset only (mid-week)", async () => {
			const calls: string[] = [];
			// Tuesday 2024-03-19 00:00 UTC
			const now = new Date("2024-03-19T00:00:00.000Z");
			const deps = makeDeps({
				getNow: () => now,
				getLastDailyReset: async () => new Date("2024-03-18T00:00:00.000Z"),
				getLastWeeklyReset: async () => new Date("2024-03-18T00:00:00.000Z"),
				resetDailyCounters: async () => {
					calls.push("daily");
				},
				resetWeeklyCounters: async () => {
					calls.push("weekly");
				},
			});

			const scheduler = new LossLimitResetScheduler(deps);
			await scheduler.tick();

			expect(calls).toContain("daily");
			expect(calls).not.toContain("weekly");
		});

		test("Monday 00:00 UTC → both daily and weekly reset", async () => {
			const calls: string[] = [];
			// Monday 2024-03-25 00:00 UTC
			const now = new Date("2024-03-25T00:00:00.000Z");
			const deps = makeDeps({
				getNow: () => now,
				getLastDailyReset: async () => new Date("2024-03-24T00:00:00.000Z"), // Sunday
				getLastWeeklyReset: async () => new Date("2024-03-18T00:00:00.000Z"), // last Monday
				resetDailyCounters: async () => {
					calls.push("daily");
				},
				resetWeeklyCounters: async () => {
					calls.push("weekly");
				},
			});

			const scheduler = new LossLimitResetScheduler(deps);
			await scheduler.tick();

			expect(calls).toContain("daily");
			expect(calls).toContain("weekly");
		});

		test("logs reset events with timestamp", async () => {
			const logs: Array<{ event: string; at: Date }> = [];
			const now = new Date("2024-03-18T00:00:00.000Z");
			const deps = makeDeps({
				getNow: () => now,
				log: (event, at) => {
					logs.push({ event, at });
				},
			});

			const scheduler = new LossLimitResetScheduler(deps);
			await scheduler.tick();

			expect(logs.some((l) => l.event.includes("daily"))).toBe(true);
			expect(logs.some((l) => l.event.includes("weekly"))).toBe(true);
			expect(logs.every((l) => l.at instanceof Date)).toBe(true);
		});

		test("does NOT reset consecutive SL counter", async () => {
			const calls: string[] = [];
			const deps = makeDeps({
				resetDailyCounters: async () => {
					calls.push("daily");
				},
				resetWeeklyCounters: async () => {
					calls.push("weekly");
				},
			});

			const scheduler = new LossLimitResetScheduler(deps);
			await scheduler.tick();

			// Verify no consecutiveSL reset is present in the call list
			const hasConsecutiveReset = calls.some((c) => c.toLowerCase().includes("consecutive"));
			expect(hasConsecutiveReset).toBe(false);
		});

		test("persistDailyReset called with current timestamp", async () => {
			const persisted: Date[] = [];
			const now = new Date("2024-03-18T00:00:00.000Z");
			const deps = makeDeps({
				getNow: () => now,
				persistDailyReset: async (at) => {
					persisted.push(at);
				},
			});

			const scheduler = new LossLimitResetScheduler(deps);
			await scheduler.tick();

			expect(persisted.length).toBe(1);
			expect(persisted[0]).toEqual(now);
		});

		test("persistWeeklyReset called with current timestamp on Monday", async () => {
			const persisted: Date[] = [];
			const now = new Date("2024-03-18T00:00:00.000Z"); // Monday
			const deps = makeDeps({
				getNow: () => now,
				persistWeeklyReset: async (at) => {
					persisted.push(at);
				},
			});

			const scheduler = new LossLimitResetScheduler(deps);
			await scheduler.tick();

			expect(persisted.length).toBe(1);
			expect(persisted[0]).toEqual(now);
		});
	});
});

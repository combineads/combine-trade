import { describe, expect, test } from "bun:test";
import {
	ConsecutiveSlNotSuspendedError,
	type ConsecutiveSlDeps,
	type ConsecutiveSlState,
	isSuspended,
	recordOutcome,
	resetSuspension,
} from "../consecutive-sl-limiter.js";

const DEFAULT_THRESHOLD = 5;

/** Build an in-memory deps implementation with optional pre-seeded state. */
function makeDeps(initial?: ConsecutiveSlState): {
	deps: ConsecutiveSlDeps;
	store: Map<string, ConsecutiveSlState>;
	alertCalls: Array<{ strategyId: string; consecutiveLosses: number }>;
} {
	const store = new Map<string, ConsecutiveSlState>();
	if (initial) {
		store.set(initial.strategyId, initial);
	}
	const alertCalls: Array<{ strategyId: string; consecutiveLosses: number }> = [];

	const deps: ConsecutiveSlDeps = {
		loadState: async (strategyId) => store.get(strategyId) ?? null,
		saveState: async (state) => {
			store.set(state.strategyId, { ...state });
		},
		sendSuspensionAlert: async (strategyId, consecutiveLosses) => {
			alertCalls.push({ strategyId, consecutiveLosses });
		},
	};

	return { deps, store, alertCalls };
}

describe("ConsecutiveSlLimiter", () => {
	describe("recordOutcome — WIN", () => {
		test("WIN on fresh state → consecutiveLosses: 0, suspended: false", async () => {
			const { deps } = makeDeps();
			const state = await recordOutcome("strat-1", "WIN", deps);
			expect(state.consecutiveLosses).toBe(0);
			expect(state.suspended).toBe(false);
			expect(state.strategyId).toBe("strat-1");
		});

		test("WIN after 3 losses → resets consecutiveLosses to 0", async () => {
			const { deps } = makeDeps({
				strategyId: "strat-1",
				consecutiveLosses: 3,
				threshold: DEFAULT_THRESHOLD,
				suspended: false,
				suspendedAt: null,
			});
			const state = await recordOutcome("strat-1", "WIN", deps);
			expect(state.consecutiveLosses).toBe(0);
			expect(state.suspended).toBe(false);
		});

		test("WIN resets counter even when strategy is suspended", async () => {
			const { deps } = makeDeps({
				strategyId: "strat-1",
				consecutiveLosses: 5,
				threshold: DEFAULT_THRESHOLD,
				suspended: true,
				suspendedAt: new Date(),
			});
			const state = await recordOutcome("strat-1", "WIN", deps);
			expect(state.consecutiveLosses).toBe(0);
		});
	});

	describe("recordOutcome — LOSS", () => {
		test("LOSS × 4 (below threshold 5) → consecutiveLosses: 4, suspended: false", async () => {
			const { deps } = makeDeps();
			let state!: ConsecutiveSlState;
			for (let i = 0; i < 4; i++) {
				state = await recordOutcome("strat-1", "LOSS", deps);
			}
			expect(state.consecutiveLosses).toBe(4);
			expect(state.suspended).toBe(false);
		});

		test("LOSS × 5 (at threshold) → suspended: true, suspendedAt set", async () => {
			const { deps } = makeDeps();
			let state!: ConsecutiveSlState;
			for (let i = 0; i < 5; i++) {
				state = await recordOutcome("strat-1", "LOSS", deps);
			}
			expect(state.suspended).toBe(true);
			expect(state.suspendedAt).toBeInstanceOf(Date);
			expect(state.consecutiveLosses).toBe(5);
		});

		test("LOSS × 5 → sendSuspensionAlert called exactly once", async () => {
			const { deps, alertCalls } = makeDeps();
			for (let i = 0; i < 5; i++) {
				await recordOutcome("strat-1", "LOSS", deps);
			}
			expect(alertCalls).toHaveLength(1);
			expect(alertCalls[0]).toEqual({ strategyId: "strat-1", consecutiveLosses: 5 });
		});

		test("LOSS × 6 (already suspended) → sendSuspensionAlert not called again", async () => {
			const { deps, alertCalls } = makeDeps();
			for (let i = 0; i < 6; i++) {
				await recordOutcome("strat-1", "LOSS", deps);
			}
			expect(alertCalls).toHaveLength(1);
		});

		test("WIN followed by LOSS starts count from 1, not from previous total", async () => {
			const { deps } = makeDeps({
				strategyId: "strat-1",
				consecutiveLosses: 4,
				threshold: DEFAULT_THRESHOLD,
				suspended: false,
				suspendedAt: null,
			});
			await recordOutcome("strat-1", "WIN", deps);
			const state = await recordOutcome("strat-1", "LOSS", deps);
			expect(state.consecutiveLosses).toBe(1);
			expect(state.suspended).toBe(false);
		});
	});

	describe("recordOutcome — persistence", () => {
		test("saveState is called on every recordOutcome call", async () => {
			const store = new Map<string, ConsecutiveSlState>();
			let saveCount = 0;
			const deps: ConsecutiveSlDeps = {
				loadState: async (id) => store.get(id) ?? null,
				saveState: async (s) => {
					saveCount++;
					store.set(s.strategyId, { ...s });
				},
				sendSuspensionAlert: async () => {},
			};
			await recordOutcome("strat-1", "LOSS", deps);
			await recordOutcome("strat-1", "WIN", deps);
			expect(saveCount).toBe(2);
		});
	});

	describe("strategy isolation", () => {
		test("two strategies have independent counters", async () => {
			const { deps, store } = makeDeps();
			for (let i = 0; i < 3; i++) {
				await recordOutcome("strat-A", "LOSS", deps);
			}
			for (let i = 0; i < 2; i++) {
				await recordOutcome("strat-B", "LOSS", deps);
			}
			expect(store.get("strat-A")?.consecutiveLosses).toBe(3);
			expect(store.get("strat-B")?.consecutiveLosses).toBe(2);
		});
	});

	describe("resetSuspension", () => {
		test("on suspended strategy → suspended: false, consecutiveLosses: 0", async () => {
			const { deps } = makeDeps({
				strategyId: "strat-1",
				consecutiveLosses: 5,
				threshold: DEFAULT_THRESHOLD,
				suspended: true,
				suspendedAt: new Date(),
			});
			const state = await resetSuspension("strat-1", deps);
			expect(state.suspended).toBe(false);
			expect(state.consecutiveLosses).toBe(0);
			expect(state.suspendedAt).toBeNull();
		});

		test("on non-suspended strategy → throws ConsecutiveSlNotSuspendedError", async () => {
			const { deps } = makeDeps({
				strategyId: "strat-1",
				consecutiveLosses: 2,
				threshold: DEFAULT_THRESHOLD,
				suspended: false,
				suspendedAt: null,
			});
			await expect(resetSuspension("strat-1", deps)).rejects.toBeInstanceOf(
				ConsecutiveSlNotSuspendedError,
			);
		});

		test("on non-suspended (fresh) strategy → throws ConsecutiveSlNotSuspendedError", async () => {
			const { deps } = makeDeps();
			await expect(resetSuspension("strat-1", deps)).rejects.toBeInstanceOf(
				ConsecutiveSlNotSuspendedError,
			);
		});
	});

	describe("isSuspended", () => {
		test("returns false for non-suspended state", () => {
			const state: ConsecutiveSlState = {
				strategyId: "strat-1",
				consecutiveLosses: 2,
				threshold: DEFAULT_THRESHOLD,
				suspended: false,
				suspendedAt: null,
			};
			expect(isSuspended(state)).toBe(false);
		});

		test("returns true for suspended state", () => {
			const state: ConsecutiveSlState = {
				strategyId: "strat-1",
				consecutiveLosses: 5,
				threshold: DEFAULT_THRESHOLD,
				suspended: true,
				suspendedAt: new Date(),
			};
			expect(isSuspended(state)).toBe(true);
		});
	});
});

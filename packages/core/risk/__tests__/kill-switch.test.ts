import { describe, expect, test } from "bun:test";
import {
	type KillSwitchDeps,
	KillSwitchNotFoundError,
	activate,
	deactivate,
	isBlocked,
} from "../kill-switch.js";
import type { KillSwitchState } from "../types.js";

function makeState(overrides: Partial<KillSwitchState> = {}): KillSwitchState {
	return {
		id: "ks-1",
		scope: "global",
		scopeTarget: null,
		active: true,
		triggeredBy: "manual",
		triggeredAt: new Date(),
		requiresAcknowledgment: true,
		acknowledgedAt: null,
		...overrides,
	};
}

describe("KillSwitch", () => {
	describe("isBlocked", () => {
		test("no active states → false", () => {
			expect(isBlocked("strat-1", "binance", [])).toBe(false);
		});

		test("active global state → true for any strategy/exchange", () => {
			const states = [makeState({ scope: "global", active: true })];
			expect(isBlocked("strat-1", "binance", states)).toBe(true);
			expect(isBlocked("strat-2", "okx", states)).toBe(true);
		});

		test("active exchange state → true for matching exchange only", () => {
			const states = [makeState({ scope: "exchange", scopeTarget: "binance", active: true })];
			expect(isBlocked("strat-1", "binance", states)).toBe(true);
			expect(isBlocked("strat-1", "okx", states)).toBe(false);
		});

		test("active strategy state → true for matching strategy only", () => {
			const states = [makeState({ scope: "strategy", scopeTarget: "strat-1", active: true })];
			expect(isBlocked("strat-1", "binance", states)).toBe(true);
			expect(isBlocked("strat-2", "binance", states)).toBe(false);
		});

		test("inactive state → false", () => {
			const states = [makeState({ scope: "global", active: false })];
			expect(isBlocked("strat-1", "binance", states)).toBe(false);
		});

		test("multiple active states of different scopes", () => {
			const states = [
				makeState({
					id: "ks-1",
					scope: "exchange",
					scopeTarget: "binance",
					active: true,
				}),
				makeState({
					id: "ks-2",
					scope: "strategy",
					scopeTarget: "strat-2",
					active: true,
				}),
			];
			// strat-1 on binance → blocked by exchange scope
			expect(isBlocked("strat-1", "binance", states)).toBe(true);
			// strat-2 on okx → blocked by strategy scope
			expect(isBlocked("strat-2", "okx", states)).toBe(true);
			// strat-1 on okx → not blocked by either
			expect(isBlocked("strat-1", "okx", states)).toBe(false);
		});
	});

	describe("activate", () => {
		test("manual trigger sets requiresAcknowledgment true", async () => {
			const saved: KillSwitchState[] = [];
			const deps: KillSwitchDeps = {
				loadActiveStates: async () => [],
				saveState: async (s) => {
					saved.push(s);
				},
			};

			const state = await activate("global", null, "manual", deps);
			expect(state.requiresAcknowledgment).toBe(true);
		});

		test("loss_limit trigger sets requiresAcknowledgment false", async () => {
			const deps: KillSwitchDeps = {
				loadActiveStates: async () => [],
				saveState: async () => {},
			};

			const state = await activate("strategy", "strat-1", "loss_limit", deps);
			expect(state.requiresAcknowledgment).toBe(false);
		});

		test("persists the state via saveState exactly once", async () => {
			let saveCount = 0;
			const deps: KillSwitchDeps = {
				loadActiveStates: async () => [],
				saveState: async () => {
					saveCount++;
				},
			};

			await activate("global", null, "manual", deps);
			expect(saveCount).toBe(1);
		});

		test("returns state with correct scope and scopeTarget", async () => {
			const deps: KillSwitchDeps = {
				loadActiveStates: async () => [],
				saveState: async () => {},
			};

			const state = await activate("exchange", "okx", "api_error", deps);
			expect(state.active).toBe(true);
			expect(state.scope).toBe("exchange");
			expect(state.scopeTarget).toBe("okx");
			expect(state.triggeredBy).toBe("api_error");
			expect(state.id).toBeDefined();
			expect(state.triggeredAt).toBeInstanceOf(Date);
		});
	});

	describe("deactivate", () => {
		test("returns state with active false", async () => {
			const existing = makeState({ id: "ks-99", active: true });
			const deps: KillSwitchDeps = {
				loadActiveStates: async () => [existing],
				saveState: async () => {},
			};

			const result = await deactivate("ks-99", deps);
			expect(result.active).toBe(false);
			expect(result.id).toBe("ks-99");
		});

		test("persists the updated state via saveState", async () => {
			const existing = makeState({ id: "ks-50", active: true });
			const saved: KillSwitchState[] = [];
			const deps: KillSwitchDeps = {
				loadActiveStates: async () => [existing],
				saveState: async (s) => {
					saved.push(s);
				},
			};

			await deactivate("ks-50", deps);
			expect(saved).toHaveLength(1);
			expect(saved[0]?.active).toBe(false);
		});

		test("unknown id throws KillSwitchNotFoundError", async () => {
			const deps: KillSwitchDeps = {
				loadActiveStates: async () => [],
				saveState: async () => {},
			};

			expect(deactivate("nonexistent", deps)).rejects.toThrow(KillSwitchNotFoundError);
		});
	});
});

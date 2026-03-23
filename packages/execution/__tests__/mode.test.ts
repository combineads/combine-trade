import { describe, expect, test } from "bun:test";
import { ExecutionModeService, isActionable, requiresOrder } from "../mode.js";
import type { ExecutionMode, ExecutionModeDeps, SafetyGateStatus } from "../types.js";
import { ModeTransitionError } from "../types.js";

function makeDeps(
	overrides: Partial<ExecutionModeDeps> & { modes?: Record<string, ExecutionMode> } = {},
): ExecutionModeDeps {
	const modes: Record<string, ExecutionMode> = overrides.modes ?? {};
	const safetyStatus: SafetyGateStatus = {
		killSwitchEnabled: true,
		dailyLossLimitConfigured: true,
	};

	return {
		loadMode: overrides.loadMode ?? (async (id) => modes[id] ?? "analysis"),
		saveMode:
			overrides.saveMode ??
			(async (id, mode) => {
				modes[id] = mode;
			}),
		getSafetyGateStatus: overrides.getSafetyGateStatus ?? (async () => safetyStatus),
	};
}

describe("ExecutionModeService", () => {
	test("getMode returns default analysis for unknown strategy", async () => {
		const svc = new ExecutionModeService(makeDeps());
		const mode = await svc.getMode("unknown");
		expect(mode).toBe("analysis");
	});

	test("setMode to alert succeeds without safety gates", async () => {
		const deps = makeDeps({
			getSafetyGateStatus: async () => ({
				killSwitchEnabled: false,
				dailyLossLimitConfigured: false,
			}),
		});
		const svc = new ExecutionModeService(deps);
		await svc.setMode("strat-1", "alert");
		expect(await svc.getMode("strat-1")).toBe("alert");
	});

	test("setMode to paper succeeds without safety gates", async () => {
		const deps = makeDeps({
			getSafetyGateStatus: async () => ({
				killSwitchEnabled: false,
				dailyLossLimitConfigured: false,
			}),
		});
		const svc = new ExecutionModeService(deps);
		await svc.setMode("strat-1", "paper");
		expect(await svc.getMode("strat-1")).toBe("paper");
	});

	test("setMode to live succeeds with both safety gates", async () => {
		const svc = new ExecutionModeService(makeDeps());
		await svc.setMode("strat-1", "live");
		expect(await svc.getMode("strat-1")).toBe("live");
	});

	test("setMode to live fails without kill switch", async () => {
		const deps = makeDeps({
			getSafetyGateStatus: async () => ({
				killSwitchEnabled: false,
				dailyLossLimitConfigured: true,
			}),
		});
		const svc = new ExecutionModeService(deps);
		expect(svc.setMode("strat-1", "live")).rejects.toBeInstanceOf(ModeTransitionError);
	});

	test("setMode to live fails without daily loss limit", async () => {
		const deps = makeDeps({
			getSafetyGateStatus: async () => ({
				killSwitchEnabled: true,
				dailyLossLimitConfigured: false,
			}),
		});
		const svc = new ExecutionModeService(deps);
		expect(svc.setMode("strat-1", "live")).rejects.toBeInstanceOf(ModeTransitionError);
	});
});

describe("isActionable", () => {
	test("analysis → not actionable", () => {
		expect(isActionable("analysis")).toBe(false);
	});

	test("alert → actionable", () => {
		expect(isActionable("alert")).toBe(true);
	});

	test("paper → actionable", () => {
		expect(isActionable("paper")).toBe(true);
	});

	test("live → actionable", () => {
		expect(isActionable("live")).toBe(true);
	});
});

describe("requiresOrder", () => {
	test("analysis → no order", () => {
		expect(requiresOrder("analysis")).toBe(false);
	});

	test("alert → no order", () => {
		expect(requiresOrder("alert")).toBe(false);
	});

	test("paper → order (virtual)", () => {
		expect(requiresOrder("paper")).toBe(true);
	});

	test("live → order (real)", () => {
		expect(requiresOrder("live")).toBe(true);
	});
});

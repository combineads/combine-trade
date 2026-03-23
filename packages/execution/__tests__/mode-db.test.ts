import { describe, expect, mock, test } from "bun:test";
import { type ExecutionModeDbDeps, ExecutionModeDbService } from "../mode-db.js";

function makeDeps(overrides: Partial<ExecutionModeDbDeps> = {}): ExecutionModeDbDeps {
	return {
		loadStrategyMode: mock(() => Promise.resolve("analysis" as const)),
		saveStrategyMode: mock(() => Promise.resolve()),
		hasActiveKillSwitch: mock(() => Promise.resolve(true)),
		hasDailyLossLimit: mock(() => Promise.resolve(true)),
		...overrides,
	};
}

describe("ExecutionModeDbService", () => {
	test("loadMode returns mode from DB", async () => {
		const deps = makeDeps({
			loadStrategyMode: mock(() => Promise.resolve("paper" as const)),
		});
		const svc = new ExecutionModeDbService(deps);

		const mode = await svc.loadMode("strat-1");
		expect(mode).toBe("paper");
		expect(deps.loadStrategyMode).toHaveBeenCalledWith("strat-1");
	});

	test("loadMode defaults to analysis when not found", async () => {
		const deps = makeDeps({
			loadStrategyMode: mock(() => Promise.resolve(null)),
		});
		const svc = new ExecutionModeDbService(deps);

		const mode = await svc.loadMode("strat-1");
		expect(mode).toBe("analysis");
	});

	test("saveMode persists mode to DB", async () => {
		const deps = makeDeps();
		const svc = new ExecutionModeDbService(deps);

		await svc.saveMode("strat-1", "live");
		expect(deps.saveStrategyMode).toHaveBeenCalledWith("strat-1", "live");
	});

	test("getSafetyGateStatus returns both conditions true", async () => {
		const deps = makeDeps();
		const svc = new ExecutionModeDbService(deps);

		const status = await svc.getSafetyGateStatus();
		expect(status.killSwitchEnabled).toBe(true);
		expect(status.dailyLossLimitConfigured).toBe(true);
	});

	test("getSafetyGateStatus returns false when kill switch not active", async () => {
		const deps = makeDeps({
			hasActiveKillSwitch: mock(() => Promise.resolve(false)),
		});
		const svc = new ExecutionModeDbService(deps);

		const status = await svc.getSafetyGateStatus();
		expect(status.killSwitchEnabled).toBe(false);
		expect(status.dailyLossLimitConfigured).toBe(true);
	});

	test("getSafetyGateStatus returns false when no loss limit configured", async () => {
		const deps = makeDeps({
			hasDailyLossLimit: mock(() => Promise.resolve(false)),
		});
		const svc = new ExecutionModeDbService(deps);

		const status = await svc.getSafetyGateStatus();
		expect(status.killSwitchEnabled).toBe(true);
		expect(status.dailyLossLimitConfigured).toBe(false);
	});
});

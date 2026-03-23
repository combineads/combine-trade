import { describe, expect, test, mock } from "bun:test";
import {
	KillSwitchDbService,
	type KillSwitchDbDeps,
	type KillSwitchRow,
	type KillSwitchEventRow,
} from "../kill-switch-db.js";
import type { KillSwitchState } from "../types.js";

const NOW = new Date("2026-03-22T12:00:00Z");
const USER_ID = "user-test-uuid";

function makeRow(overrides: Partial<KillSwitchRow> = {}): KillSwitchRow {
	return {
		id: "ks-1",
		strategyId: null,
		isActive: true,
		activatedAt: NOW,
		activatedBy: "manual",
		reason: "Manual activation",
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	};
}

function makeDeps(overrides: Partial<KillSwitchDbDeps> = {}): KillSwitchDbDeps {
	return {
		findActiveStates: mock(() => Promise.resolve([makeRow()])),
		upsertState: mock(() => Promise.resolve()),
		insertAuditEvent: mock(() => Promise.resolve()),
		updateAuditEventDeactivation: mock(() => Promise.resolve()),
		...overrides,
	};
}

describe("KillSwitchDbService", () => {
	test("loadActiveStates passes userId and returns mapped states", async () => {
		const deps = makeDeps({
			findActiveStates: mock(() =>
				Promise.resolve([
					makeRow({ id: "ks-1", strategyId: null }),
					makeRow({ id: "ks-2", strategyId: "strat-1", activatedBy: "loss_limit" }),
				]),
			),
		});
		const svc = new KillSwitchDbService(deps);

		const states = await svc.loadActiveStates(USER_ID);
		expect(states).toHaveLength(2);
		expect(states[0].id).toBe("ks-1");
		expect(states[0].scope).toBe("global");
		expect(states[0].active).toBe(true);
		expect(states[1].id).toBe("ks-2");
		expect(states[1].scope).toBe("strategy");
		expect(states[1].scopeTarget).toBe("strat-1");
		expect(deps.findActiveStates).toHaveBeenCalledWith(USER_ID);
	});

	test("loadActiveStates returns empty array when none active", async () => {
		const deps = makeDeps({
			findActiveStates: mock(() => Promise.resolve([])),
		});
		const svc = new KillSwitchDbService(deps);

		const states = await svc.loadActiveStates(USER_ID);
		expect(states).toHaveLength(0);
	});

	test("saveState activating creates state and audit event with userId", async () => {
		const deps = makeDeps();
		const svc = new KillSwitchDbService(deps);

		const state: KillSwitchState = {
			id: "ks-new",
			scope: "global",
			scopeTarget: null,
			active: true,
			triggeredBy: "manual",
			triggeredAt: NOW,
			requiresAcknowledgment: true,
			acknowledgedAt: null,
		};

		await svc.saveState(state, USER_ID);
		expect(deps.upsertState).toHaveBeenCalledTimes(1);
		expect(deps.insertAuditEvent).toHaveBeenCalledTimes(1);

		// Verify userId is passed to upsertState
		const upsertCall = (deps.upsertState as ReturnType<typeof mock>).mock.calls[0];
		const upsertRow = upsertCall[0] as { userId: string };
		expect(upsertRow.userId).toBe(USER_ID);

		const auditCall = (deps.insertAuditEvent as ReturnType<typeof mock>).mock.calls[0];
		const audit = auditCall[0] as KillSwitchEventRow & { userId: string };
		expect(audit.scope).toBe("global");
		expect(audit.triggerType).toBe("manual");
		expect(audit.triggeredAt).toBe(NOW);
		expect(audit.userId).toBe(USER_ID);
	});

	test("saveState deactivating updates state and audit deactivation", async () => {
		const deps = makeDeps();
		const svc = new KillSwitchDbService(deps);

		const state: KillSwitchState = {
			id: "ks-1",
			scope: "strategy",
			scopeTarget: "strat-1",
			active: false,
			triggeredBy: "loss_limit",
			triggeredAt: NOW,
			requiresAcknowledgment: false,
			acknowledgedAt: null,
		};

		await svc.saveState(state, USER_ID);
		expect(deps.upsertState).toHaveBeenCalledTimes(1);
		expect(deps.updateAuditEventDeactivation).toHaveBeenCalledTimes(1);
		// Should NOT insert a new audit event for deactivation
		expect(deps.insertAuditEvent).not.toHaveBeenCalled();
	});

	test("maps global scope correctly (no strategyId)", async () => {
		const deps = makeDeps({
			findActiveStates: mock(() =>
				Promise.resolve([makeRow({ strategyId: null })]),
			),
		});
		const svc = new KillSwitchDbService(deps);

		const [state] = await svc.loadActiveStates(USER_ID);
		expect(state.scope).toBe("global");
		expect(state.scopeTarget).toBeNull();
	});

	test("maps strategy scope correctly", async () => {
		const deps = makeDeps({
			findActiveStates: mock(() =>
				Promise.resolve([makeRow({ strategyId: "strat-42" })]),
			),
		});
		const svc = new KillSwitchDbService(deps);

		const [state] = await svc.loadActiveStates(USER_ID);
		expect(state.scope).toBe("strategy");
		expect(state.scopeTarget).toBe("strat-42");
	});

	test("maps triggeredBy to KillSwitchTrigger type", async () => {
		const deps = makeDeps({
			findActiveStates: mock(() =>
				Promise.resolve([makeRow({ activatedBy: "api_error" })]),
			),
		});
		const svc = new KillSwitchDbService(deps);

		const [state] = await svc.loadActiveStates(USER_ID);
		expect(state.triggeredBy).toBe("api_error");
	});
});

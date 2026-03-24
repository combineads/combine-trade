import { describe, expect, test } from "bun:test";
import {
	type KillSwitchAuditDeps,
	type KillSwitchAuditEvent,
	createAuditEvent,
	recordDeactivation,
} from "../kill-switch-audit.js";
import type { KillSwitchState } from "../types.js";

function makeState(overrides: Partial<KillSwitchState> = {}): KillSwitchState {
	return {
		id: "ks-1",
		scope: "global",
		scopeTarget: null,
		active: true,
		triggeredBy: "manual",
		triggeredAt: new Date("2026-01-01T00:00:00Z"),
		requiresAcknowledgment: true,
		acknowledgedAt: null,
		...overrides,
	};
}

function makeEvent(overrides: Partial<KillSwitchAuditEvent> = {}): KillSwitchAuditEvent {
	return {
		id: "evt-1",
		killSwitchStateId: "ks-1",
		triggerType: "manual",
		triggerReason: "operator triggered",
		scope: "global",
		scopeTarget: null,
		positionsSnapshot: [],
		activatedAt: new Date("2026-01-01T00:00:00Z"),
		deactivatedAt: null,
		deactivatedBy: null,
		...overrides,
	};
}

describe("createAuditEvent", () => {
	test("returns event with correct triggerType from state", () => {
		const state = makeState({ triggeredBy: "loss_limit" });
		const event = createAuditEvent(state, "daily loss limit exceeded", []);
		expect(event.triggerType).toBe("loss_limit");
	});

	test("returns event with correct scope from state", () => {
		const state = makeState({ scope: "exchange", scopeTarget: "binance" });
		const event = createAuditEvent(state, "reason", []);
		expect(event.scope).toBe("exchange");
		expect(event.scopeTarget).toBe("binance");
	});

	test("returns event with correct triggerReason", () => {
		const state = makeState();
		const event = createAuditEvent(state, "manual shutdown", []);
		expect(event.triggerReason).toBe("manual shutdown");
	});

	test("sets killSwitchStateId to state.id", () => {
		const state = makeState({ id: "ks-42" });
		const event = createAuditEvent(state, "reason", []);
		expect(event.killSwitchStateId).toBe("ks-42");
	});

	test("sets activatedAt to a Date, deactivatedAt to null", () => {
		const state = makeState();
		const event = createAuditEvent(state, "reason", []);
		expect(event.activatedAt).toBeInstanceOf(Date);
		expect(event.deactivatedAt).toBeNull();
	});

	test("sets deactivatedBy to null", () => {
		const state = makeState();
		const event = createAuditEvent(state, "reason", []);
		expect(event.deactivatedBy).toBeNull();
	});

	test("copies positionsSnapshot array", () => {
		const state = makeState();
		const snapshot = [{ symbol: "BTCUSDT", qty: "0.5" }];
		const event = createAuditEvent(state, "reason", snapshot);
		expect(event.positionsSnapshot).toEqual(snapshot);
		expect(event.positionsSnapshot).not.toBe(snapshot); // new array (not same ref)
	});

	test("event has a non-empty id", () => {
		const state = makeState();
		const event = createAuditEvent(state, "reason", []);
		expect(event.id).toBeTruthy();
	});
});

describe("recordDeactivation", () => {
	test("returns new event with deactivatedAt set", () => {
		const event = makeEvent();
		const result = recordDeactivation(event, "user-1");
		expect(result.deactivatedAt).toBeInstanceOf(Date);
	});

	test("returns new event with deactivatedBy set", () => {
		const event = makeEvent();
		const result = recordDeactivation(event, "user-1");
		expect(result.deactivatedBy).toBe("user-1");
	});

	test("does not mutate the original event", () => {
		const event = makeEvent({ deactivatedAt: null, deactivatedBy: null });
		recordDeactivation(event, "user-1");
		expect(event.deactivatedAt).toBeNull();
		expect(event.deactivatedBy).toBeNull();
	});

	test("preserves all other fields from the original event", () => {
		const event = makeEvent({
			id: "evt-99",
			killSwitchStateId: "ks-5",
			triggerType: "api_error",
			triggerReason: "exchange down",
			scope: "exchange",
			scopeTarget: "okx",
		});
		const result = recordDeactivation(event, "system");
		expect(result.id).toBe("evt-99");
		expect(result.killSwitchStateId).toBe("ks-5");
		expect(result.triggerType).toBe("api_error");
		expect(result.triggerReason).toBe("exchange down");
		expect(result.scope).toBe("exchange");
		expect(result.scopeTarget).toBe("okx");
	});
});

describe("KillSwitchAuditDeps mock", () => {
	test("insertEvent called once when saving", async () => {
		let insertCount = 0;
		const deps: KillSwitchAuditDeps = {
			insertEvent: async (_event) => {
				insertCount++;
			},
			findByStateId: async (_id) => null,
			listRecent: async (_limit) => [],
		};

		const state = makeState();
		const event = createAuditEvent(state, "test", []);
		await deps.insertEvent(event);
		expect(insertCount).toBe(1);
	});

	test("findByStateId returns null for unknown id", async () => {
		const store: KillSwitchAuditEvent[] = [];
		const deps: KillSwitchAuditDeps = {
			insertEvent: async (event) => {
				store.push(event);
			},
			findByStateId: async (id) => store.find((e) => e.killSwitchStateId === id) ?? null,
			listRecent: async (limit) => store.slice(-limit),
		};

		const result = await deps.findByStateId("unknown-state-id");
		expect(result).toBeNull();
	});

	test("listRecent(5) returns up to 5 events", async () => {
		const store: KillSwitchAuditEvent[] = Array.from({ length: 10 }, (_, i) =>
			makeEvent({ id: `evt-${i}`, killSwitchStateId: `ks-${i}` }),
		);
		const deps: KillSwitchAuditDeps = {
			insertEvent: async (event) => {
				store.push(event);
			},
			findByStateId: async (id) => store.find((e) => e.killSwitchStateId === id) ?? null,
			listRecent: async (limit) => store.slice(-limit),
		};

		const results = await deps.listRecent(5);
		expect(results.length).toBeLessThanOrEqual(5);
	});
});

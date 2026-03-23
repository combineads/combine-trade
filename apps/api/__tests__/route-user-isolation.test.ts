/**
 * RED: User isolation tests for route-level dep interfaces.
 * Verifies that KillSwitchRouteDeps and OrderRouteDeps require userId.
 */
import { describe, expect, test } from "bun:test";
import type { KillSwitchRouteDeps } from "../src/routes/kill-switch.js";
import type { OrderRouteDeps } from "../src/routes/orders.js";

const USER_A = "user-a-uuid";
const USER_B = "user-b-uuid";

// ---------------------------------------------------------------------------
// KillSwitchRouteDeps isolation
// ---------------------------------------------------------------------------

function createIsolatedKillSwitchDeps(): KillSwitchRouteDeps {
	type StoredState = {
		id: string;
		scope: "global" | "exchange" | "strategy";
		scopeTarget: string | null;
		active: boolean;
		triggeredBy: "manual" | "loss_limit" | "api_error" | "system";
		triggeredAt: Date;
		requiresAcknowledgment: boolean;
		acknowledgedAt: Date | null;
		userId: string;
	};

	const store: StoredState[] = [];
	let counter = 0;

	return {
		async activate(scope, scopeTarget, trigger, userId: string) {
			counter++;
			const state: StoredState = {
				id: `ks-${counter}`,
				scope,
				scopeTarget: scopeTarget ?? null,
				active: true,
				triggeredBy: trigger,
				triggeredAt: new Date(),
				requiresAcknowledgment: trigger === "manual",
				acknowledgedAt: null,
				userId,
			};
			store.push(state);
			return state;
		},
		async deactivate(id: string, userId: string) {
			const idx = store.findIndex((s) => s.id === id && s.userId === userId);
			if (idx < 0) throw new Error(`Kill switch not found or not owned: ${id}`);
			store[idx]!.active = false;
			return store[idx]!;
		},
		async getActiveStates(userId: string) {
			return store.filter((s) => s.active && s.userId === userId);
		},
		async getAuditEvents(_page: number, _pageSize: number, userId: string) {
			const items = store
				.filter((s) => s.userId === userId)
				.map((s) => ({
					id: s.id,
					scope: s.scope,
					triggerType: s.triggeredBy,
					triggerDetail: `${s.triggeredBy} trigger`,
					triggeredAt: s.triggeredAt,
					deactivatedAt: s.active ? null : new Date(),
				}));
			return { items, total: items.length };
		},
	};
}

describe("KillSwitchRouteDeps user isolation", () => {
	test("activate accepts userId and stores state per user", async () => {
		const deps = createIsolatedKillSwitchDeps();

		await deps.activate("global", null, "manual", USER_A);
		await deps.activate("global", null, "manual", USER_B);

		const statesA = await deps.getActiveStates(USER_A);
		const statesB = await deps.getActiveStates(USER_B);

		expect(statesA).toHaveLength(1);
		expect(statesB).toHaveLength(1);
		expect(statesA[0].id).not.toBe(statesB[0].id);
	});

	test("deactivate with wrong userId throws", async () => {
		const deps = createIsolatedKillSwitchDeps();

		const state = await deps.activate("global", null, "manual", USER_A);

		await expect(deps.deactivate(state.id, USER_B)).rejects.toThrow();

		// Still active for user A
		const statesA = await deps.getActiveStates(USER_A);
		expect(statesA).toHaveLength(1);
		expect(statesA[0].active).toBe(true);
	});

	test("getAuditEvents returns only the calling user's events", async () => {
		const deps = createIsolatedKillSwitchDeps();

		await deps.activate("global", null, "manual", USER_A);
		await deps.activate("strategy", "strat-1", "loss_limit", USER_A);
		await deps.activate("global", null, "manual", USER_B);

		const { items: eventsA } = await deps.getAuditEvents(1, 20, USER_A);
		const { items: eventsB } = await deps.getAuditEvents(1, 20, USER_B);

		expect(eventsA).toHaveLength(2);
		expect(eventsB).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// OrderRouteDeps isolation
// ---------------------------------------------------------------------------

function createIsolatedOrderDeps(): OrderRouteDeps {
	type StoredOrder = {
		id: string;
		strategyId: string;
		symbol: string;
		side: "buy" | "sell";
		type: "market" | "limit";
		price: string;
		amount: string;
		filled: string;
		status: "open" | "closed" | "canceled";
		createdAt: Date;
		userId: string;
	};

	const store: StoredOrder[] = [
		{
			id: "order-a-1",
			strategyId: "strat-1",
			symbol: "BTCUSDT",
			side: "buy",
			type: "market",
			price: "50000",
			amount: "0.1",
			filled: "0.1",
			status: "closed",
			createdAt: new Date(),
			userId: USER_A,
		},
		{
			id: "order-b-1",
			strategyId: "strat-2",
			symbol: "ETHUSDT",
			side: "sell",
			type: "limit",
			price: "3000",
			amount: "1.0",
			filled: "0",
			status: "open",
			createdAt: new Date(),
			userId: USER_B,
		},
	];

	return {
		async findOrders(opts) {
			const { userId } = opts as typeof opts & { userId: string };
			const filtered = store.filter((o) => {
				if (o.userId !== userId) return false;
				if (opts.symbol && o.symbol !== opts.symbol) return false;
				if (opts.status && o.status !== opts.status) return false;
				if (opts.strategyId && o.strategyId !== opts.strategyId) return false;
				return true;
			});
			const start = (opts.page - 1) * opts.pageSize;
			return { items: filtered.slice(start, start + opts.pageSize), total: filtered.length };
		},
	};
}

describe("OrderRouteDeps user isolation", () => {
	test("findOrders with userId returns only that user's orders", async () => {
		const deps = createIsolatedOrderDeps();

		const resultA = await deps.findOrders({ page: 1, pageSize: 50, userId: USER_A } as Parameters<
			typeof deps.findOrders
		>[0]);
		const resultB = await deps.findOrders({ page: 1, pageSize: 50, userId: USER_B } as Parameters<
			typeof deps.findOrders
		>[0]);

		expect(resultA.items).toHaveLength(1);
		expect(resultA.items[0].id).toBe("order-a-1");

		expect(resultB.items).toHaveLength(1);
		expect(resultB.items[0].id).toBe("order-b-1");
	});
});

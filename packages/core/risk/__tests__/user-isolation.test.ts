/**
 * RED: User isolation tests for KillSwitchDbDeps and LossTrackerDbDeps.
 * These tests verify that userId is threaded through risk-layer DB dependencies.
 */
import { describe, expect, test } from "bun:test";
import type { KillSwitchDbDeps, KillSwitchRow } from "../kill-switch-db.js";
import type { LossTrackerDbDeps, PnlRow } from "../loss-tracker-db.js";

const USER_A = "user-a-uuid";
const USER_B = "user-b-uuid";

const NOW = new Date("2026-03-22T12:00:00Z");

// ---------------------------------------------------------------------------
// KillSwitchDbDeps isolation
// ---------------------------------------------------------------------------

function _makeKsRow(
	overrides: Partial<KillSwitchRow & { userId: string }> = {},
): KillSwitchRow & { userId: string } {
	return {
		id: "ks-1",
		strategyId: null,
		isActive: true,
		activatedAt: NOW,
		activatedBy: "manual",
		reason: "Manual activation",
		createdAt: NOW,
		updatedAt: NOW,
		userId: USER_A,
		...overrides,
	};
}

function createIsolatedKillSwitchDeps(): KillSwitchDbDeps {
	const store: Array<KillSwitchRow & { userId: string }> = [];
	const auditStore: Array<{ stateId: string; deactivatedAt: Date }> = [];

	return {
		findActiveStates(userId: string): Promise<KillSwitchRow[]> {
			return Promise.resolve(store.filter((r) => r.isActive && r.userId === userId));
		},
		upsertState(row: {
			id: string;
			strategyId: string | null;
			isActive: boolean;
			activatedAt: Date | null;
			activatedBy: string | null;
			reason: string | null;
			userId: string;
		}): Promise<void> {
			const existing = store.findIndex((r) => r.id === row.id);
			const full: KillSwitchRow & { userId: string } = {
				...row,
				createdAt: NOW,
				updatedAt: new Date(),
			};
			if (existing >= 0) {
				store[existing] = full;
			} else {
				store.push(full);
			}
			return Promise.resolve();
		},
		insertAuditEvent(): Promise<void> {
			return Promise.resolve();
		},
		updateAuditEventDeactivation(stateId: string, deactivatedAt: Date): Promise<void> {
			auditStore.push({ stateId, deactivatedAt });
			return Promise.resolve();
		},
	};
}

describe("KillSwitchDbDeps user isolation", () => {
	test("findActiveStates accepts userId and returns only that user's states", async () => {
		const deps = createIsolatedKillSwitchDeps();

		// Seed rows for two users
		await deps.upsertState({
			id: "ks-a",
			strategyId: null,
			isActive: true,
			activatedAt: NOW,
			activatedBy: "manual",
			reason: "test",
			userId: USER_A,
		});
		await deps.upsertState({
			id: "ks-b",
			strategyId: null,
			isActive: true,
			activatedAt: NOW,
			activatedBy: "manual",
			reason: "test",
			userId: USER_B,
		});

		const statesA = await deps.findActiveStates(USER_A);
		const statesB = await deps.findActiveStates(USER_B);

		expect(statesA).toHaveLength(1);
		expect(statesA[0].id).toBe("ks-a");

		expect(statesB).toHaveLength(1);
		expect(statesB[0].id).toBe("ks-b");
	});
});

// ---------------------------------------------------------------------------
// LossTrackerDbDeps isolation
// ---------------------------------------------------------------------------

function createIsolatedLossTrackerDeps(): LossTrackerDbDeps {
	const store: Array<PnlRow & { userId: string }> = [];

	return {
		findByDateRange(dateFrom: string, dateTo: string, userId: string): Promise<PnlRow[]> {
			return Promise.resolve(
				store.filter((r) => r.userId === userId && r.date >= dateFrom && r.date <= dateTo),
			);
		},
		insertRecord(row: PnlRow & { userId: string }): Promise<void> {
			store.push(row);
			return Promise.resolve();
		},
	};
}

describe("LossTrackerDbDeps user isolation", () => {
	test("findByDateRange accepts userId and returns only that user's records", async () => {
		const deps = createIsolatedLossTrackerDeps();

		const rowA: PnlRow & { userId: string } = {
			id: "pnl-a",
			date: "2026-03-22",
			strategyId: null,
			symbol: null,
			realizedPnl: "-50.00",
			updatedAt: NOW,
			userId: USER_A,
		};
		const rowB: PnlRow & { userId: string } = {
			id: "pnl-b",
			date: "2026-03-22",
			strategyId: null,
			symbol: null,
			realizedPnl: "-20.00",
			updatedAt: NOW,
			userId: USER_B,
		};

		await deps.insertRecord(rowA);
		await deps.insertRecord(rowB);

		const recordsA = await deps.findByDateRange("2026-03-22", "2026-03-22", USER_A);
		const recordsB = await deps.findByDateRange("2026-03-22", "2026-03-22", USER_B);

		expect(recordsA).toHaveLength(1);
		expect(recordsA[0].id).toBe("pnl-a");

		expect(recordsB).toHaveLength(1);
		expect(recordsB[0].id).toBe("pnl-b");
	});
});

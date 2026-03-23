import { describe, expect, mock, test } from "bun:test";
import { type LossTrackerDbDeps, LossTrackerDbService, type PnlRow } from "../loss-tracker-db.js";

const NOW = new Date("2026-03-22T12:00:00Z");
const USER_ID = "user-test-uuid";

function makeRow(overrides: Partial<PnlRow> = {}): PnlRow {
	return {
		id: "pnl-1",
		date: "2026-03-22",
		strategyId: null,
		symbol: null,
		realizedPnl: "-50.00",
		updatedAt: NOW,
		...overrides,
	};
}

function makeDeps(overrides: Partial<LossTrackerDbDeps> = {}): LossTrackerDbDeps {
	return {
		findByDateRange: mock(() => Promise.resolve([makeRow()])),
		insertRecord: mock(() => Promise.resolve()),
		...overrides,
	};
}

describe("LossTrackerDbService", () => {
	test("loadTodayRecords queries for today's date (UTC) with userId", async () => {
		const deps = makeDeps();
		const svc = new LossTrackerDbService(deps);

		const records = await svc.loadTodayRecords(USER_ID);
		expect(records).toHaveLength(1);
		expect(records[0].pnl).toBe("-50.00");
		expect(deps.findByDateRange).toHaveBeenCalledTimes(1);

		const call = (deps.findByDateRange as ReturnType<typeof mock>).mock.calls[0];
		const dateFrom = call[0] as string;
		const dateTo = call[1] as string;
		const calledUserId = call[2] as string;
		// Both should be today's date
		expect(dateFrom).toBe(dateTo);
		expect(calledUserId).toBe(USER_ID);
	});

	test("loadWeekRecords queries from Monday to today with userId", async () => {
		const deps = makeDeps();
		const svc = new LossTrackerDbService(deps);

		await svc.loadWeekRecords(USER_ID);
		expect(deps.findByDateRange).toHaveBeenCalledTimes(1);

		const call = (deps.findByDateRange as ReturnType<typeof mock>).mock.calls[0];
		const dateFrom = call[0] as string;
		const dateTo = call[1] as string;
		const calledUserId = call[2] as string;
		// Week start should be <= today
		expect(dateFrom <= dateTo).toBe(true);
		expect(calledUserId).toBe(USER_ID);
	});

	test("saveRecord inserts PnL row with userId and correct fields", async () => {
		const deps = makeDeps();
		const svc = new LossTrackerDbService(deps);

		await svc.saveRecord(
			{
				id: "pnl-new",
				pnl: "-25.50",
				closedAt: new Date("2026-03-22T15:30:00Z"),
			},
			USER_ID,
		);

		expect(deps.insertRecord).toHaveBeenCalledTimes(1);
		const call = (deps.insertRecord as ReturnType<typeof mock>).mock.calls[0];
		const row = call[0] as PnlRow & { userId: string };
		expect(row.id).toBe("pnl-new");
		expect(row.realizedPnl).toBe("-25.50");
		expect(row.date).toBe("2026-03-22");
		expect(row.userId).toBe(USER_ID);
	});

	test("maps PnlRow to PnlRecord correctly", async () => {
		const deps = makeDeps({
			findByDateRange: mock(() =>
				Promise.resolve([
					makeRow({
						id: "pnl-1",
						realizedPnl: "-100.00",
						updatedAt: new Date("2026-03-22T10:00:00Z"),
					}),
					makeRow({
						id: "pnl-2",
						realizedPnl: "30.00",
						updatedAt: new Date("2026-03-22T11:00:00Z"),
					}),
				]),
			),
		});
		const svc = new LossTrackerDbService(deps);

		const records = await svc.loadTodayRecords(USER_ID);
		expect(records).toHaveLength(2);
		expect(records[0].id).toBe("pnl-1");
		expect(records[0].pnl).toBe("-100.00");
		expect(records[0].closedAt).toBeInstanceOf(Date);
		expect(records[1].id).toBe("pnl-2");
		expect(records[1].pnl).toBe("30.00");
	});

	test("returns empty array when no records for date range", async () => {
		const deps = makeDeps({
			findByDateRange: mock(() => Promise.resolve([])),
		});
		const svc = new LossTrackerDbService(deps);

		const records = await svc.loadTodayRecords(USER_ID);
		expect(records).toHaveLength(0);
	});
});

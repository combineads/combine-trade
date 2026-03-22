import { describe, expect, test, mock } from "bun:test";
import {
	PositionSyncService,
	type PositionSyncDeps,
	type ExchangePosition,
	type LocalPosition,
	type SyncReport,
} from "../position-sync.js";

function makeDeps(overrides: Partial<PositionSyncDeps> = {}): PositionSyncDeps {
	return {
		fetchExchangePositions: mock(() => Promise.resolve([])),
		loadLocalPositions: mock(() => Promise.resolve([])),
		...overrides,
	};
}

describe("PositionSyncService", () => {
	test("perfect match returns no discrepancies", async () => {
		const deps = makeDeps({
			fetchExchangePositions: mock(() =>
				Promise.resolve([
					{ symbol: "BTCUSDT", side: "long", quantity: "0.5", entryPrice: "50000" },
				] as ExchangePosition[]),
			),
			loadLocalPositions: mock(() =>
				Promise.resolve([
					{ symbol: "BTCUSDT", side: "long", quantity: "0.5", entryPrice: "50000", strategyId: "strat-1" },
				] as LocalPosition[]),
			),
		});
		const svc = new PositionSyncService(deps);

		const report = await svc.syncOnce();
		expect(report.synced).toHaveLength(1);
		expect(report.discrepancies).toHaveLength(0);
		expect(report.externalPositions).toHaveLength(0);
	});

	test("detects missing local position", async () => {
		const deps = makeDeps({
			fetchExchangePositions: mock(() =>
				Promise.resolve([
					{ symbol: "BTCUSDT", side: "long", quantity: "0.5", entryPrice: "50000" },
				] as ExchangePosition[]),
			),
			loadLocalPositions: mock(() => Promise.resolve([])),
		});
		const svc = new PositionSyncService(deps);

		const report = await svc.syncOnce();
		expect(report.externalPositions).toHaveLength(1);
		expect(report.externalPositions[0].symbol).toBe("BTCUSDT");
	});

	test("detects missing exchange position", async () => {
		const deps = makeDeps({
			fetchExchangePositions: mock(() => Promise.resolve([])),
			loadLocalPositions: mock(() =>
				Promise.resolve([
					{ symbol: "ETHUSDT", side: "short", quantity: "2.0", entryPrice: "3000", strategyId: "strat-1" },
				] as LocalPosition[]),
			),
		});
		const svc = new PositionSyncService(deps);

		const report = await svc.syncOnce();
		expect(report.discrepancies).toHaveLength(1);
		expect(report.discrepancies[0].type).toBe("missing_exchange");
		expect(report.discrepancies[0].symbol).toBe("ETHUSDT");
	});

	test("detects quantity mismatch", async () => {
		const deps = makeDeps({
			fetchExchangePositions: mock(() =>
				Promise.resolve([
					{ symbol: "BTCUSDT", side: "long", quantity: "0.8", entryPrice: "50000" },
				] as ExchangePosition[]),
			),
			loadLocalPositions: mock(() =>
				Promise.resolve([
					{ symbol: "BTCUSDT", side: "long", quantity: "0.5", entryPrice: "50000", strategyId: "strat-1" },
				] as LocalPosition[]),
			),
		});
		const svc = new PositionSyncService(deps);

		const report = await svc.syncOnce();
		expect(report.discrepancies).toHaveLength(1);
		expect(report.discrepancies[0].type).toBe("quantity_mismatch");
		expect(report.discrepancies[0].expected).toBe("0.5");
		expect(report.discrepancies[0].actual).toBe("0.8");
	});

	test("handles empty exchange and local", async () => {
		const deps = makeDeps();
		const svc = new PositionSyncService(deps);

		const report = await svc.syncOnce();
		expect(report.synced).toHaveLength(0);
		expect(report.discrepancies).toHaveLength(0);
		expect(report.externalPositions).toHaveLength(0);
	});

	test("multiple positions mixed scenario", async () => {
		const deps = makeDeps({
			fetchExchangePositions: mock(() =>
				Promise.resolve([
					{ symbol: "BTCUSDT", side: "long", quantity: "1.0", entryPrice: "50000" },
					{ symbol: "SOLUSDT", side: "short", quantity: "100", entryPrice: "150" },
				] as ExchangePosition[]),
			),
			loadLocalPositions: mock(() =>
				Promise.resolve([
					{ symbol: "BTCUSDT", side: "long", quantity: "1.0", entryPrice: "50000", strategyId: "strat-1" },
					{ symbol: "ETHUSDT", side: "long", quantity: "5.0", entryPrice: "3000", strategyId: "strat-2" },
				] as LocalPosition[]),
			),
		});
		const svc = new PositionSyncService(deps);

		const report = await svc.syncOnce();
		expect(report.synced).toHaveLength(1); // BTCUSDT matched
		expect(report.discrepancies).toHaveLength(1); // ETHUSDT missing on exchange
		expect(report.externalPositions).toHaveLength(1); // SOLUSDT external
	});
});

import { describe, expect, test } from "bun:test";
import {
	PositionMonitor,
	type ExchangePosition,
	type ExchangePositionProvider,
	type TrackedPosition,
} from "../position-monitor.js";

function makeExchangePosition(overrides: Partial<ExchangePosition> = {}): ExchangePosition {
	return {
		symbol: "BTCUSDT",
		side: "LONG",
		size: "0.1",
		entryPrice: "50000",
		markPrice: "51000",
		leverage: 10,
		marginType: "isolated",
		...overrides,
	};
}

function makeTrackedPosition(overrides: Partial<TrackedPosition> = {}): TrackedPosition {
	return {
		symbol: "BTCUSDT",
		systemOrderId: "order-1",
		side: "LONG",
		size: "0.1",
		entryPrice: "50000",
		...overrides,
	};
}

function createProvider(positions: ExchangePosition[]): ExchangePositionProvider {
	return {
		getOpenPositions: async () => positions,
	};
}

describe("PositionMonitor", () => {
	describe("sync()", () => {
		test("matching positions returns empty untracked and missing", async () => {
			const exchange = [makeExchangePosition()];
			const system = [makeTrackedPosition()];
			const monitor = new PositionMonitor(createProvider(exchange));
			const result = await monitor.sync(system);
			expect(result.tracked).toHaveLength(1);
			expect(result.untracked).toHaveLength(0);
			expect(result.missing).toHaveLength(0);
		});

		test("detects exchange position not in system as untracked", async () => {
			const exchange = [
				makeExchangePosition(),
				makeExchangePosition({ symbol: "ETHUSDT", side: "SHORT" }),
			];
			const system = [makeTrackedPosition()];
			const monitor = new PositionMonitor(createProvider(exchange));
			const result = await monitor.sync(system);
			expect(result.tracked).toHaveLength(1);
			expect(result.untracked).toHaveLength(1);
			expect(result.untracked[0].symbol).toBe("ETHUSDT");
		});

		test("detects system position not on exchange as missing", async () => {
			const exchange = [makeExchangePosition()];
			const system = [
				makeTrackedPosition(),
				makeTrackedPosition({ symbol: "ETHUSDT", side: "SHORT", systemOrderId: "order-2" }),
			];
			const monitor = new PositionMonitor(createProvider(exchange));
			const result = await monitor.sync(system);
			expect(result.tracked).toHaveLength(1);
			expect(result.missing).toHaveLength(1);
			expect(result.missing[0].symbol).toBe("ETHUSDT");
		});
	});

	describe("calculateAggregateExposure()", () => {
		test("sums LONG and SHORT notionals correctly", () => {
			const monitor = new PositionMonitor(createProvider([]));
			const positions: ExchangePosition[] = [
				makeExchangePosition({ size: "0.1", markPrice: "50000" }), // LONG: 5000
				makeExchangePosition({ symbol: "ETHUSDT", side: "SHORT", size: "10", markPrice: "3000" }), // SHORT: 30000
			];
			const result = monitor.calculateAggregateExposure(positions);
			expect(result.totalLongNotional).toBe("5000");
			expect(result.totalShortNotional).toBe("30000");
			expect(result.netExposure).toBe("-25000"); // 5000 - 30000
		});
	});

	describe("estimateLiquidationPrice()", () => {
		test("returns correct value for isolated LONG", () => {
			const monitor = new PositionMonitor(createProvider([]));
			const position = makeExchangePosition({
				side: "LONG",
				entryPrice: "50000",
				leverage: 10,
				marginType: "isolated",
			});
			const liqPrice = monitor.estimateLiquidationPrice(position);
			// LONG: entryPrice * (1 - 1/leverage + maintenanceMarginRate)
			// 50000 * (1 - 0.1 + 0.005) = 50000 * 0.905 = 45250
			expect(liqPrice).toBe("45250");
		});

		test("returns correct value for isolated SHORT", () => {
			const monitor = new PositionMonitor(createProvider([]));
			const position = makeExchangePosition({
				side: "SHORT",
				entryPrice: "50000",
				leverage: 10,
				marginType: "isolated",
			});
			const liqPrice = monitor.estimateLiquidationPrice(position);
			// SHORT: entryPrice * (1 + 1/leverage - maintenanceMarginRate)
			// 50000 * (1 + 0.1 - 0.005) = 50000 * 1.095 = 54750
			expect(liqPrice).toBe("54750");
		});

		test("returns null for cross margin", () => {
			const monitor = new PositionMonitor(createProvider([]));
			const position = makeExchangePosition({ marginType: "cross" });
			const liqPrice = monitor.estimateLiquidationPrice(position);
			expect(liqPrice).toBeNull();
		});
	});
});

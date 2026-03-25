import { beforeEach, describe, expect, test } from "bun:test";
import type { ExchangeAdapter } from "@combine/exchange";
import { MockExchangeAdapter } from "@combine/exchange/testing/mock-adapter";
import type { CandleCollector } from "../src/collector.js";
import type { ExchangeCollectorManager } from "../src/exchange-manager.js";
import type { ExchangeConfig } from "../src/exchange-manager.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockCollector(
	opts: {
		startFn?: () => Promise<void>;
		stopFn?: () => Promise<void>;
	} = {},
): CandleCollector & { startCallCount: number; stopCallCount: number } {
	let startCallCount = 0;
	let stopCallCount = 0;

	const collector = {
		get startCallCount() {
			return startCallCount;
		},
		get stopCallCount() {
			return stopCallCount;
		},
		get lastCandleTime() {
			return null;
		},
		get gapRepairStatus() {
			return "complete";
		},
		async start(_exchange: string, _symbol: string, _timeframe: string): Promise<void> {
			startCallCount++;
			if (opts.startFn) {
				return opts.startFn();
			}
		},
		async stop(): Promise<void> {
			stopCallCount++;
			if (opts.stopFn) {
				return opts.stopFn();
			}
		},
	} as unknown as CandleCollector & { startCallCount: number; stopCallCount: number };

	return collector;
}

function makeExchangeConfig(
	id: string,
	adapter: ExchangeAdapter,
	collectorFactory?: () => CandleCollector,
): ExchangeConfig {
	return {
		id,
		adapter,
		symbols: ["BTCUSDT"],
		timeframe: "1m",
		restartDelayMs: 0, // instant restart for tests
		_collectorFactory: collectorFactory,
	} as ExchangeConfig;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExchangeCollectorManager", () => {
	let ExchangeCollectorManagerClass: typeof ExchangeCollectorManager;

	beforeEach(async () => {
		const mod = await import("../src/exchange-manager.js");
		ExchangeCollectorManagerClass = mod.ExchangeCollectorManager;
	});

	test("start() calls collector.start for each configured exchange", async () => {
		const collectorA = makeMockCollector();
		const collectorB = makeMockCollector();

		const adapterA = new MockExchangeAdapter({ exchange: "binance" });
		const adapterB = new MockExchangeAdapter({ exchange: "okx" });

		const configs: ExchangeConfig[] = [
			makeExchangeConfig("binance", adapterA, () => collectorA),
			makeExchangeConfig("okx", adapterB, () => collectorB),
		];

		const manager = new ExchangeCollectorManagerClass(configs);
		await manager.start();
		// Give async fire-and-forget tasks a tick to run
		await new Promise((r) => setTimeout(r, 10));

		expect(collectorA.startCallCount).toBeGreaterThanOrEqual(1);
		expect(collectorB.startCallCount).toBeGreaterThanOrEqual(1);

		await manager.stop();
	});

	test("a crash in exchange A triggers restart, exchange B keeps running", async () => {
		let binanceCrashCount = 0;
		const crashTimes = 2;

		const collectorA = makeMockCollector({
			startFn: async () => {
				if (binanceCrashCount < crashTimes) {
					binanceCrashCount++;
					throw new Error("Binance WS disconnected");
				}
				// After crashes, resolve normally
			},
		});
		const collectorB = makeMockCollector();

		const adapterA = new MockExchangeAdapter({ exchange: "binance" });
		const adapterB = new MockExchangeAdapter({ exchange: "okx" });

		const configs: ExchangeConfig[] = [
			makeExchangeConfig("binance", adapterA, () => collectorA),
			makeExchangeConfig("okx", adapterB, () => collectorB),
		];

		const manager = new ExchangeCollectorManagerClass(configs);
		await manager.start();

		// Allow restarts to occur
		await new Promise((r) => setTimeout(r, 50));

		// Exchange B should still be running fine
		expect(collectorB.startCallCount).toBeGreaterThanOrEqual(1);

		await manager.stop();
	});

	test("after 5 consecutive restarts exchange is marked degraded, no further restarts", async () => {
		const MAX_RESTARTS = 5;
		let startCount = 0;

		const collectorA = makeMockCollector({
			startFn: async () => {
				startCount++;
				throw new Error("persistent failure");
			},
		});

		const adapterA = new MockExchangeAdapter({ exchange: "binance" });

		const configs: ExchangeConfig[] = [makeExchangeConfig("binance", adapterA, () => collectorA)];

		const manager = new ExchangeCollectorManagerClass(configs);
		await manager.start();

		// Wait enough for all 5+1 initial attempts to fire
		await new Promise((r) => setTimeout(r, 100));

		const health = manager.getHealth();
		expect(health.binance?.status).toBe("degraded");
		expect(health.binance?.restartCount).toBe(MAX_RESTARTS);

		// No more restarts beyond the max
		const countAfterDegraded = startCount;
		await new Promise((r) => setTimeout(r, 50));
		expect(startCount).toBe(countAfterDegraded);

		await manager.stop();
	});

	test("restart counter resets after stable period", async () => {
		const _manager = new ExchangeCollectorManagerClass([]);

		// Directly test the internal reset method through getHealth
		// We inject a config with 2 crashes then stable, and check restartCount drops to 0
		// by using a very short stableWindowMs
		let crashCount = 0;
		const collectorA = makeMockCollector({
			startFn: async () => {
				if (crashCount < 2) {
					crashCount++;
					throw new Error("transient");
				}
				// Stay stable — resolve after a 60ms delay
				await new Promise((r) => setTimeout(r, 60));
			},
		});

		const adapterA = new MockExchangeAdapter({ exchange: "binance" });
		const configs: ExchangeConfig[] = [
			{
				id: "binance",
				adapter: adapterA,
				symbols: ["BTCUSDT"],
				timeframe: "1m",
				restartDelayMs: 0,
				stableWindowMs: 40, // very short stable window for test
				_collectorFactory: () => collectorA,
			} as ExchangeConfig,
		];

		const manager2 = new ExchangeCollectorManagerClass(configs);
		await manager2.start();

		// Wait for 2 crashes and restart counter increment
		await new Promise((r) => setTimeout(r, 30));
		const healthAfterCrashes = manager2.getHealth();
		expect(healthAfterCrashes.binance?.restartCount ?? 0).toBeGreaterThan(0);

		// Wait for stable window to elapse — counter should reset
		await new Promise((r) => setTimeout(r, 80));
		const healthAfterStable = manager2.getHealth();
		expect(healthAfterStable.binance?.restartCount ?? 0).toBe(0);

		await manager2.stop();
	});

	test("stop() stops all collectors and resolves", async () => {
		const collectorA = makeMockCollector({
			startFn: async () => {
				// Block until stopped
				await new Promise<void>((resolve) => {
					const interval = setInterval(() => {
						clearInterval(interval);
						resolve();
					}, 10);
				});
			},
		});
		const collectorB = makeMockCollector({
			startFn: async () => {
				await new Promise<void>((resolve) => {
					const interval = setInterval(() => {
						clearInterval(interval);
						resolve();
					}, 10);
				});
			},
		});

		const adapterA = new MockExchangeAdapter({ exchange: "binance" });
		const adapterB = new MockExchangeAdapter({ exchange: "okx" });

		const configs: ExchangeConfig[] = [
			makeExchangeConfig("binance", adapterA, () => collectorA),
			makeExchangeConfig("okx", adapterB, () => collectorB),
		];

		const manager = new ExchangeCollectorManagerClass(configs);
		await manager.start();

		// Ensure stop resolves quickly
		await manager.stop();

		expect(collectorA.stopCallCount).toBeGreaterThanOrEqual(1);
		expect(collectorB.stopCallCount).toBeGreaterThanOrEqual(1);
	});

	test("getHealth() reflects per-exchange status including restart counts", async () => {
		let crashCount = 0;
		const collectorA = makeMockCollector({
			startFn: async () => {
				if (crashCount < 1) {
					crashCount++;
					throw new Error("one-time failure");
				}
				// then stable
			},
		});

		const adapterA = new MockExchangeAdapter({ exchange: "binance" });
		const adapterB = new MockExchangeAdapter({ exchange: "okx" });
		const collectorB = makeMockCollector();

		const configs: ExchangeConfig[] = [
			makeExchangeConfig("binance", adapterA, () => collectorA),
			makeExchangeConfig("okx", adapterB, () => collectorB),
		];

		const manager = new ExchangeCollectorManagerClass(configs);
		await manager.start();
		await new Promise((r) => setTimeout(r, 30));

		const health = manager.getHealth();

		expect(health).toHaveProperty("binance");
		expect(health).toHaveProperty("okx");
		expect(health.binance).toHaveProperty("status");
		expect(health.binance).toHaveProperty("restartCount");
		expect(health.binance).toHaveProperty("lastRestartAt");

		await manager.stop();
	});

	test("overall health is degraded if any exchange failed over", async () => {
		let _crashCount = 0;
		const collectorA = makeMockCollector({
			startFn: async () => {
				_crashCount++;
				throw new Error("persistent failure");
			},
		});
		const collectorB = makeMockCollector();

		const adapterA = new MockExchangeAdapter({ exchange: "binance" });
		const adapterB = new MockExchangeAdapter({ exchange: "okx" });

		const configs: ExchangeConfig[] = [
			makeExchangeConfig("binance", adapterA, () => collectorA),
			makeExchangeConfig("okx", adapterB, () => collectorB),
		];

		const manager = new ExchangeCollectorManagerClass(configs);
		await manager.start();

		// Let restarts accumulate past max to reach "error"
		await new Promise((r) => setTimeout(r, 100));

		const _health = manager.getHealth();
		// binance should be degraded or error; overall status should reflect it
		const overallStatus = manager.getOverallStatus();
		expect(["degraded", "error"]).toContain(overallStatus);

		await manager.stop();
	});
});

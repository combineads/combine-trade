import { describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import {
	type ReadinessRouteDeps,
	type TradingModeRouteDeps,
	readinessRoutes,
	tradingModeRoutes,
} from "../src/routes/trading/mode.js";
import type { ReadinessReport } from "../src/routes/trading/readiness.js";
import { ReadinessResetService } from "../src/services/readiness-reset.js";
import { TEST_USER_ID, withMockUserId } from "./helpers/auth.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeReadinessReport(overrides: Partial<ReadinessReport> = {}): ReadinessReport {
	return {
		overall: 75,
		components: { paper: 30, backtest: 30, risk: 15 },
		canGoLive: true,
		...overrides,
	};
}

function makeTradingModeDeps(overrides: Partial<TradingModeRouteDeps> = {}): TradingModeRouteDeps {
	return {
		getReadinessScore: mock(() => Promise.resolve(makeReadinessReport())),
		getCurrentMode: mock(() => Promise.resolve("paper" as const)),
		setMode: mock(() => Promise.resolve()),
		strategyExists: mock(() => Promise.resolve(true)),
		...overrides,
	};
}

function makeReadinessDeps(overrides: Partial<ReadinessRouteDeps> = {}): ReadinessRouteDeps {
	return {
		getReadinessReport: mock(() => Promise.resolve(makeReadinessReport())),
		strategyExists: mock(() => Promise.resolve(true)),
		...overrides,
	};
}

function createModeApp(deps: TradingModeRouteDeps) {
	return new Elysia().use(withMockUserId()).use(errorHandlerPlugin).use(tradingModeRoutes(deps));
}

function createReadinessApp(deps: ReadinessRouteDeps) {
	return new Elysia().use(withMockUserId()).use(errorHandlerPlugin).use(readinessRoutes(deps));
}

const MODE_BASE = "http://localhost/api/v1/trading/mode";
const READINESS_BASE = "http://localhost/api/v1/trading/readiness";

// ─── POST /api/v1/trading/mode/:strategyId ─────────────────────────────────

describe("readiness-gate: POST /api/v1/trading/mode/:strategyId", () => {
	test("rejects transition to live when readiness score < 70 with 422 READINESS_GATE_FAILED", async () => {
		const deps = makeTradingModeDeps({
			getReadinessScore: mock(() =>
				Promise.resolve(makeReadinessReport({ overall: 50, canGoLive: false })),
			),
		});
		const app = createModeApp(deps);

		const res = await app.handle(
			new Request(`${MODE_BASE}/strat-1`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ mode: "live" }),
			}),
		);

		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.error.code).toBe("READINESS_GATE_FAILED");
		expect(body.error.score).toBe(50);
		expect(body.error.required).toBe(70);
	});

	test("allows transition to live when readiness score >= 70", async () => {
		const deps = makeTradingModeDeps({
			getReadinessScore: mock(() =>
				Promise.resolve(makeReadinessReport({ overall: 75, canGoLive: true })),
			),
		});
		const app = createModeApp(deps);

		const res = await app.handle(
			new Request(`${MODE_BASE}/strat-1`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ mode: "live" }),
			}),
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.strategyId).toBe("strat-1");
		expect(body.data.mode).toBe("live");
		expect(body.data.readinessScore).toBe(75);
	});

	test("paper to paper transition always succeeds regardless of score", async () => {
		const deps = makeTradingModeDeps({
			getCurrentMode: mock(() => Promise.resolve("paper" as const)),
			getReadinessScore: mock(() =>
				Promise.resolve(makeReadinessReport({ overall: 10, canGoLive: false })),
			),
		});
		const app = createModeApp(deps);

		const res = await app.handle(
			new Request(`${MODE_BASE}/strat-1`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ mode: "paper" }),
			}),
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.mode).toBe("paper");
	});

	test("live to paper transition always succeeds regardless of score", async () => {
		const deps = makeTradingModeDeps({
			getCurrentMode: mock(() => Promise.resolve("live" as const)),
			getReadinessScore: mock(() =>
				Promise.resolve(makeReadinessReport({ overall: 10, canGoLive: false })),
			),
		});
		const app = createModeApp(deps);

		const res = await app.handle(
			new Request(`${MODE_BASE}/strat-1`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ mode: "paper" }),
			}),
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.mode).toBe("paper");
	});

	test("returns 404 when strategy does not exist", async () => {
		const deps = makeTradingModeDeps({
			strategyExists: mock(() => Promise.resolve(false)),
		});
		const app = createModeApp(deps);

		const res = await app.handle(
			new Request(`${MODE_BASE}/nonexistent`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ mode: "live" }),
			}),
		);

		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error.code).toBe("NOT_FOUND");
	});

	test("returns 401 when userId is missing", async () => {
		const deps = makeTradingModeDeps();
		const app = new Elysia()
			.use(withMockUserId(""))
			.use(errorHandlerPlugin)
			.use(tradingModeRoutes(deps));

		const res = await app.handle(
			new Request(`${MODE_BASE}/strat-1`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ mode: "live" }),
			}),
		);

		expect(res.status).toBe(401);
	});

	test("passes userId to strategyExists for user isolation", async () => {
		let capturedUserId = "";
		const deps = makeTradingModeDeps({
			strategyExists: mock((_strategyId: string, userId: string) => {
				capturedUserId = userId;
				return Promise.resolve(true);
			}),
		});
		const app = createModeApp(deps);

		await app.handle(
			new Request(`${MODE_BASE}/strat-1`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ mode: "paper" }),
			}),
		);

		expect(capturedUserId).toBe(TEST_USER_ID);
	});

	test("setMode is called atomically on successful gate check", async () => {
		const setMock = mock(() => Promise.resolve());
		const deps = makeTradingModeDeps({ setMode: setMock });
		const app = createModeApp(deps);

		await app.handle(
			new Request(`${MODE_BASE}/strat-1`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ mode: "live" }),
			}),
		);

		expect(setMock).toHaveBeenCalledTimes(1);
		const call = (setMock as ReturnType<typeof mock>).mock.calls[0];
		expect(call[0]).toBe("strat-1");
		expect(call[1]).toBe("live");
	});

	test("setMode is NOT called when gate rejects", async () => {
		const setMock = mock(() => Promise.resolve());
		const deps = makeTradingModeDeps({
			getReadinessScore: mock(() =>
				Promise.resolve(makeReadinessReport({ overall: 40, canGoLive: false })),
			),
			setMode: setMock,
		});
		const app = createModeApp(deps);

		await app.handle(
			new Request(`${MODE_BASE}/strat-1`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ mode: "live" }),
			}),
		);

		expect(setMock).toHaveBeenCalledTimes(0);
	});
});

// ─── GET /api/v1/trading/readiness/:strategyId ──────────────────────────────

describe("readiness-gate: GET /api/v1/trading/readiness/:strategyId", () => {
	test("returns readiness report with component breakdown and canGoLive", async () => {
		const report = makeReadinessReport({ overall: 75, canGoLive: true });
		const deps = makeReadinessDeps({
			getReadinessReport: mock(() => Promise.resolve(report)),
		});
		const app = createReadinessApp(deps);

		const res = await app.handle(new Request(`${READINESS_BASE}/strat-1`));

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.overall).toBe(75);
		expect(body.data.canGoLive).toBe(true);
		expect(body.data.components).toMatchObject({ paper: 30, backtest: 30, risk: 15 });
	});

	test("canGoLive is false when overall < 70", async () => {
		const report = makeReadinessReport({ overall: 65, canGoLive: false });
		const deps = makeReadinessDeps({
			getReadinessReport: mock(() => Promise.resolve(report)),
		});
		const app = createReadinessApp(deps);

		const res = await app.handle(new Request(`${READINESS_BASE}/strat-1`));

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.canGoLive).toBe(false);
	});

	test("returns 404 when strategy does not exist", async () => {
		const deps = makeReadinessDeps({
			strategyExists: mock(() => Promise.resolve(false)),
		});
		const app = createReadinessApp(deps);

		const res = await app.handle(new Request(`${READINESS_BASE}/nonexistent`));

		expect(res.status).toBe(404);
	});

	test("passes strategyId and userId to getReadinessReport", async () => {
		let capturedStrategyId = "";
		let capturedUserId = "";
		const deps = makeReadinessDeps({
			getReadinessReport: mock((strategyId: string, userId: string) => {
				capturedStrategyId = strategyId;
				capturedUserId = userId;
				return Promise.resolve(makeReadinessReport());
			}),
		});
		const app = createReadinessApp(deps);

		await app.handle(new Request(`${READINESS_BASE}/strat-42`));

		expect(capturedStrategyId).toBe("strat-42");
		expect(capturedUserId).toBe(TEST_USER_ID);
	});
});

// ─── ReadinessResetService ──────────────────────────────────────────────────

describe("readiness-gate: ReadinessResetService", () => {
	test("loss limit breach resets paper score to 0 for the affected strategyId", async () => {
		const resetPaper = mock(() => Promise.resolve());
		const service = new ReadinessResetService({
			resetPaperScore: resetPaper,
			resetRiskScore: mock(() => Promise.resolve()),
			resetBacktestScore: mock(() => Promise.resolve()),
			listStrategiesForUser: mock(() => Promise.resolve([])),
		});

		await service.onLossLimitBreach({ strategyId: "strat-1", userId: "user-1" });

		expect(resetPaper).toHaveBeenCalledTimes(1);
		const call = (resetPaper as ReturnType<typeof mock>).mock.calls[0];
		expect(call[0]).toBe("strat-1");
	});

	test("kill switch activation resets risk score to 0 for all user strategies", async () => {
		const resetRisk = mock(() => Promise.resolve());
		const service = new ReadinessResetService({
			resetPaperScore: mock(() => Promise.resolve()),
			resetRiskScore: resetRisk,
			resetBacktestScore: mock(() => Promise.resolve()),
			listStrategiesForUser: mock(() =>
				Promise.resolve([{ id: "strat-1" }, { id: "strat-2" }, { id: "strat-3" }]),
			),
		});

		await service.onKillSwitchActivated({ userId: "user-1" });

		expect(resetRisk).toHaveBeenCalledTimes(3);
		const strategyIds = (resetRisk as ReturnType<typeof mock>).mock.calls.map((c) => c[0]);
		expect(strategyIds).toContain("strat-1");
		expect(strategyIds).toContain("strat-2");
		expect(strategyIds).toContain("strat-3");
	});

	test("strategy code change resets backtest score to 0 for the strategyId", async () => {
		const resetBacktest = mock(() => Promise.resolve());
		const service = new ReadinessResetService({
			resetPaperScore: mock(() => Promise.resolve()),
			resetRiskScore: mock(() => Promise.resolve()),
			resetBacktestScore: resetBacktest,
			listStrategiesForUser: mock(() => Promise.resolve([])),
		});

		await service.onStrategyCodeChanged({ strategyId: "strat-1" });

		expect(resetBacktest).toHaveBeenCalledTimes(1);
		const call = (resetBacktest as ReturnType<typeof mock>).mock.calls[0];
		expect(call[0]).toBe("strat-1");
	});

	test("loss limit breach reset is idempotent", async () => {
		const resetPaper = mock(() => Promise.resolve());
		const service = new ReadinessResetService({
			resetPaperScore: resetPaper,
			resetRiskScore: mock(() => Promise.resolve()),
			resetBacktestScore: mock(() => Promise.resolve()),
			listStrategiesForUser: mock(() => Promise.resolve([])),
		});

		await service.onLossLimitBreach({ strategyId: "strat-1", userId: "user-1" });
		await service.onLossLimitBreach({ strategyId: "strat-1", userId: "user-1" });

		// Both calls succeed — caller is responsible for inserting zero-score records
		// The service itself always delegates and calling it twice is always valid
		expect(resetPaper).toHaveBeenCalledTimes(2);
	});

	test("kill switch reset is idempotent — calling twice resets all user strategies each time", async () => {
		const resetRisk = mock(() => Promise.resolve());
		const service = new ReadinessResetService({
			resetPaperScore: mock(() => Promise.resolve()),
			resetRiskScore: resetRisk,
			resetBacktestScore: mock(() => Promise.resolve()),
			listStrategiesForUser: mock(() => Promise.resolve([{ id: "strat-1" }, { id: "strat-2" }])),
		});

		await service.onKillSwitchActivated({ userId: "user-1" });
		await service.onKillSwitchActivated({ userId: "user-1" });

		// 2 strategies × 2 calls = 4 total resets
		expect(resetRisk).toHaveBeenCalledTimes(4);
	});

	test("code change reset is idempotent", async () => {
		const resetBacktest = mock(() => Promise.resolve());
		const service = new ReadinessResetService({
			resetPaperScore: mock(() => Promise.resolve()),
			resetRiskScore: mock(() => Promise.resolve()),
			resetBacktestScore: resetBacktest,
			listStrategiesForUser: mock(() => Promise.resolve([])),
		});

		await service.onStrategyCodeChanged({ strategyId: "strat-1" });
		await service.onStrategyCodeChanged({ strategyId: "strat-1" });

		expect(resetBacktest).toHaveBeenCalledTimes(2);
	});
});

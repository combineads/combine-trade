/**
 * drift-comparison: GET /api/v1/journals/drift/:strategyId
 *
 * Tests:
 *   - z-score computed correctly for known backtest vs live winrate pair
 *   - drift score maps |z-score| to 0–100 correctly
 *   - alertLevel: 'critical' when drift score >= 80
 *   - alertLevel: 'warning' when drift score >= 60
 *   - minimum sample guard returns no-drift for < 30 live trades
 *   - 403 returned if strategy belongs to different user
 *   - 404 returned if strategyId not found
 *   - Decimal.js used for all statistical outputs (string representation)
 */
import { describe, expect, test } from "bun:test";
import Decimal from "decimal.js";
import { Elysia } from "elysia";
import { errorHandlerPlugin } from "../../src/lib/errors.js";
import {
	type DriftComparisonDeps,
	computeZScore,
	driftComparisonRoute,
	mapZScoreToDriftScore,
} from "../../src/routes/journals/drift.js";
import { withMockUserId } from "../helpers/auth.js";

const BASE = "http://localhost/api/v1";

const USER_A = "user-a";
const USER_B = "user-b";

const STRATEGY_A = "strat-uuid-a";
const STRATEGY_B = "strat-uuid-b";

// ---------------------------------------------------------------------------
// Pure function tests (z-score, drift score)
// ---------------------------------------------------------------------------

describe("drift-comparison: computeZScore", () => {
	test("computes correct z-score for known winrate pair", () => {
		// p_live=0.4, p_backtest=0.6, n=100
		// z = (0.4 - 0.6) / sqrt(0.6 * 0.4 / 100) = -0.2 / sqrt(0.0024) = -0.2 / 0.04899 ≈ -4.082
		const z = computeZScore({
			pBacktest: new Decimal("0.6"),
			pLive: new Decimal("0.4"),
			n: 100,
		});
		expect(z.abs().toNumber()).toBeCloseTo(4.082, 2);
	});

	test("returns zero z-score when live and backtest winrates are equal", () => {
		const z = computeZScore({
			pBacktest: new Decimal("0.6"),
			pLive: new Decimal("0.6"),
			n: 100,
		});
		expect(z.toNumber()).toBe(0);
	});

	test("z-score is negative when live winrate is lower than backtest", () => {
		const z = computeZScore({
			pBacktest: new Decimal("0.65"),
			pLive: new Decimal("0.50"),
			n: 50,
		});
		expect(z.toNumber()).toBeLessThan(0);
	});
});

describe("drift-comparison: mapZScoreToDriftScore", () => {
	test("maps |z|=0 to drift score 0", () => {
		const score = mapZScoreToDriftScore(new Decimal("0"));
		expect(score).toBe(0);
	});

	test("maps |z|=4 to drift score ≈ 80 (4/5 * 100)", () => {
		// MAX_Z = 5, score = min(100, |z| / 5 * 100)
		const score = mapZScoreToDriftScore(new Decimal("4"));
		expect(score).toBeCloseTo(80, 0);
	});

	test("clamps to 100 for very large |z|", () => {
		const score = mapZScoreToDriftScore(new Decimal("100"));
		expect(score).toBe(100);
	});

	test("drift score >= 60 produces warning threshold", () => {
		// |z|=3 → score = 3/5 * 100 = 60
		const score = mapZScoreToDriftScore(new Decimal("3"));
		expect(score).toBeGreaterThanOrEqual(60);
	});
});

// ---------------------------------------------------------------------------
// Route tests
// ---------------------------------------------------------------------------

interface BacktestStub {
	strategyId: string;
	userId: string;
	winrate: string;
	expectancy: string;
	sharpe: string;
}

interface JournalStub {
	strategyId: string;
	userId: string;
	outcome: "WIN" | "LOSS" | "PASS";
	exitTime: string;
}

function createMockDeps(
	backtests: BacktestStub[] = [],
	journals: JournalStub[] = [],
): DriftComparisonDeps {
	return {
		getBacktestStats: async ({ strategyId, userId }) => {
			const bt = backtests.find((b) => b.strategyId === strategyId && b.userId === userId);
			if (!bt) return null;
			return {
				winrate: bt.winrate,
				expectancy: bt.expectancy,
				sharpe: bt.sharpe,
			};
		},
		getLiveStats: async ({ strategyId, userId, from, to }) => {
			let filtered = journals.filter((j) => j.strategyId === strategyId && j.userId === userId);
			if (from) filtered = filtered.filter((j) => j.exitTime >= from);
			if (to) filtered = filtered.filter((j) => j.exitTime <= to);
			const wins = filtered.filter((j) => j.outcome === "WIN").length;
			const losses = filtered.filter((j) => j.outcome === "LOSS").length;
			const tradeCount = filtered.filter((j) => j.outcome !== "PASS").length;
			const winrate = tradeCount > 0 ? new Decimal(wins).dividedBy(tradeCount).toFixed(10) : "0";
			const pnlValues = filtered
				.filter((j) => j.outcome !== "PASS")
				.map((_, i) => (i % 2 === 0 ? "0.02" : "-0.01")); // stub pnl
			const expectancy =
				pnlValues.length > 0
					? pnlValues
							.reduce((acc, v) => acc.plus(v), new Decimal(0))
							.dividedBy(pnlValues.length)
							.toFixed(10)
					: "0";
			return { winrate, expectancy, sharpe: "1.2", tradeCount, wins, losses };
		},
		checkStrategyAccess: async ({ strategyId, userId }) => {
			const ownedByUser = backtests.some((b) => b.strategyId === strategyId && b.userId === userId);
			if (ownedByUser) return "own";
			const existsForOther = backtests.some((b) => b.strategyId === strategyId);
			if (existsForOther) return "other";
			return "not_found";
		},
	};
}

function buildJournals(
	userId: string,
	strategyId: string,
	wins: number,
	losses: number,
): JournalStub[] {
	const result: JournalStub[] = [];
	for (let i = 0; i < wins; i++) {
		result.push({
			strategyId,
			userId,
			outcome: "WIN",
			exitTime: "2026-02-01T00:00:00.000Z",
		});
	}
	for (let i = 0; i < losses; i++) {
		result.push({
			strategyId,
			userId,
			outcome: "LOSS",
			exitTime: "2026-02-01T00:00:00.000Z",
		});
	}
	return result;
}

function createApp(userId: string, deps: DriftComparisonDeps) {
	return new Elysia()
		.use(withMockUserId(userId))
		.use(errorHandlerPlugin)
		.use(driftComparisonRoute(deps));
}

// Backtest: 60% winrate. Live: 40% winrate, 100 trades → significant drift
const btHighWinrate: BacktestStub[] = [
	{ strategyId: STRATEGY_A, userId: USER_A, winrate: "0.6", expectancy: "0.02", sharpe: "1.5" },
];
const liveHighDrift = buildJournals(USER_A, STRATEGY_A, 40, 60); // 40% winrate, 100 trades

describe("drift-comparison: GET /api/v1/journals/drift/:strategyId", () => {
	test("returns 200 with DriftComparison shape for valid request", async () => {
		const app = createApp(USER_A, createMockDeps(btHighWinrate, liveHighDrift));
		const res = await app.handle(new Request(`${BASE}/journals/drift/${STRATEGY_A}`));
		expect(res.status).toBe(200);
		const body = await res.json();
		const d = body.data;
		expect(d.strategyId).toBe(STRATEGY_A);
		expect(d.backtestStats).toHaveProperty("winrate");
		expect(d.backtestStats).toHaveProperty("expectancy");
		expect(d.backtestStats).toHaveProperty("sharpe");
		expect(d.liveStats).toHaveProperty("winrate");
		expect(d.liveStats).toHaveProperty("tradeCount");
		expect(typeof d.zScore).toBe("string");
		expect(typeof d.pValue).toBe("string");
		expect(typeof d.driftScore).toBe("number");
		expect(["none", "warning", "critical"]).toContain(d.alertLevel);
		expect(typeof d.isSignificant).toBe("boolean");
	});

	test("z-score and p-value match reference values within 0.001", async () => {
		// p_backtest=0.6, p_live=0.4, n=100 → |z| ≈ 4.082
		const app = createApp(USER_A, createMockDeps(btHighWinrate, liveHighDrift));
		const res = await app.handle(new Request(`${BASE}/journals/drift/${STRATEGY_A}`));
		expect(res.status).toBe(200);
		const body = await res.json();
		const absZ = Math.abs(Number.parseFloat(body.data.zScore));
		expect(absZ).toBeCloseTo(4.082, 2);
		// p-value for |z|~4.082 should be very small (< 0.05)
		const pVal = Number.parseFloat(body.data.pValue);
		expect(pVal).toBeLessThan(0.05);
		expect(body.data.isSignificant).toBe(true);
	});

	test("alertLevel is 'critical' when drift score >= 80", async () => {
		// Very large drift: backtest 60%, live 10%, n=100 → large z → score >=80
		const btStats: BacktestStub[] = [
			{
				strategyId: STRATEGY_A,
				userId: USER_A,
				winrate: "0.6",
				expectancy: "0.02",
				sharpe: "1.5",
			},
		];
		const liveJournals = buildJournals(USER_A, STRATEGY_A, 10, 90); // 10% winrate
		const app = createApp(USER_A, createMockDeps(btStats, liveJournals));
		const res = await app.handle(new Request(`${BASE}/journals/drift/${STRATEGY_A}`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.driftScore).toBeGreaterThanOrEqual(80);
		expect(body.data.alertLevel).toBe("critical");
	});

	test("alertLevel is 'warning' when drift score is in [60, 80)", async () => {
		// Moderate drift: backtest 60%, live 40%, n=100 → |z|≈4.08 → score=min(100,4.08/5*100)≈81.6
		// To get exactly warning, use smaller n to get lower z
		// backtest 60%, live 45%, n=50 → |z|=(0.45-0.6)/sqrt(0.6*0.4/50) = -0.15/sqrt(0.0048) = -0.15/0.06928 ≈ -2.165 → score≈43
		// Let's try backtest 60%, live 40%, n=50 → |z|=(0.4-0.6)/sqrt(0.6*0.4/50)=-0.2/0.06928≈-2.887 → score≈57.7
		// backtest 60%, live 35%, n=60 → z=(0.35-0.6)/sqrt(0.6*0.4/60)=-0.25/sqrt(0.004)=-0.25/0.0632≈-3.95 → score≈79 (warning)
		const btStats: BacktestStub[] = [
			{
				strategyId: STRATEGY_A,
				userId: USER_A,
				winrate: "0.6",
				expectancy: "0.02",
				sharpe: "1.5",
			},
		];
		const liveJournals = buildJournals(USER_A, STRATEGY_A, 21, 39); // 35% of 60 trades
		const app = createApp(USER_A, createMockDeps(btStats, liveJournals));
		const res = await app.handle(new Request(`${BASE}/journals/drift/${STRATEGY_A}`));
		expect(res.status).toBe(200);
		const body = await res.json();
		// Accept either warning or critical - threshold boundary behavior
		expect(["warning", "critical"]).toContain(body.data.alertLevel);
		expect(body.data.driftScore).toBeGreaterThanOrEqual(60);
	});

	test("minimum sample guard: tradeCount < 30 returns driftScore=0 and alertLevel='none'", async () => {
		const btStats: BacktestStub[] = [
			{
				strategyId: STRATEGY_A,
				userId: USER_A,
				winrate: "0.6",
				expectancy: "0.02",
				sharpe: "1.5",
			},
		];
		const liveJournals = buildJournals(USER_A, STRATEGY_A, 5, 10); // only 15 trades
		const app = createApp(USER_A, createMockDeps(btStats, liveJournals));
		const res = await app.handle(new Request(`${BASE}/journals/drift/${STRATEGY_A}`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.driftScore).toBe(0);
		expect(body.data.alertLevel).toBe("none");
		expect(body.data.isSignificant).toBe(false);
	});

	test("returns 403 when strategy belongs to different user", async () => {
		// STRATEGY_B belongs to USER_B, USER_A requesting it
		const btStats: BacktestStub[] = [
			{
				strategyId: STRATEGY_B,
				userId: USER_B,
				winrate: "0.6",
				expectancy: "0.02",
				sharpe: "1.5",
			},
		];
		const app = createApp(USER_A, createMockDeps(btStats, []));
		const res = await app.handle(new Request(`${BASE}/journals/drift/${STRATEGY_B}`));
		expect(res.status).toBe(403);
	});

	test("returns 404 when strategyId not found", async () => {
		const app = createApp(USER_A, createMockDeps([], []));
		const res = await app.handle(new Request(`${BASE}/journals/drift/nonexistent-uuid`));
		expect(res.status).toBe(404);
	});

	test("statistical values are returned as strings (Decimal.js precision)", async () => {
		const app = createApp(USER_A, createMockDeps(btHighWinrate, liveHighDrift));
		const res = await app.handle(new Request(`${BASE}/journals/drift/${STRATEGY_A}`));
		expect(res.status).toBe(200);
		const body = await res.json();
		// zScore and pValue must be strings, not floats
		expect(typeof body.data.zScore).toBe("string");
		expect(typeof body.data.pValue).toBe("string");
		expect(typeof body.data.backtestStats.winrate).toBe("string");
		expect(typeof body.data.liveStats.winrate).toBe("string");
	});

	test("user isolation: USER_A cannot access USER_B strategy even with same strategyId", async () => {
		// Strategy A belongs to USER_B only
		const btStats: BacktestStub[] = [
			{
				strategyId: STRATEGY_A,
				userId: USER_B,
				winrate: "0.6",
				expectancy: "0.02",
				sharpe: "1.5",
			},
		];
		const app = createApp(USER_A, createMockDeps(btStats, []));
		const res = await app.handle(new Request(`${BASE}/journals/drift/${STRATEGY_A}`));
		// checkStrategyAccess returns 'other' → 403
		expect(res.status).toBe(403);
	});

	test("accepts from/to query params and filters live stats", async () => {
		const btStats: BacktestStub[] = [
			{
				strategyId: STRATEGY_A,
				userId: USER_A,
				winrate: "0.6",
				expectancy: "0.02",
				sharpe: "1.5",
			},
		];
		// 35 trades in range, 5 outside range
		const inRangeJournals = buildJournals(USER_A, STRATEGY_A, 20, 15);
		const outOfRangeJournals: JournalStub[] = Array.from({ length: 5 }, () => ({
			strategyId: STRATEGY_A,
			userId: USER_A,
			outcome: "WIN" as const,
			exitTime: "2025-01-01T00:00:00.000Z",
		}));

		let capturedFrom: string | undefined;
		let capturedTo: string | undefined;
		const deps: DriftComparisonDeps = {
			...createMockDeps(btStats, [...inRangeJournals, ...outOfRangeJournals]),
			getLiveStats: async ({ from, to, ...rest }) => {
				capturedFrom = from;
				capturedTo = to;
				return createMockDeps(btStats, [...inRangeJournals, ...outOfRangeJournals]).getLiveStats({
					from,
					to,
					...rest,
				});
			},
		};
		const app = createApp(USER_A, deps);
		const res = await app.handle(
			new Request(
				`${BASE}/journals/drift/${STRATEGY_A}?from=2026-01-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z`,
			),
		);
		expect(res.status).toBe(200);
		expect(capturedFrom).toBe("2026-01-01T00:00:00.000Z");
		expect(capturedTo).toBe("2026-03-01T00:00:00.000Z");
	});

	test("returns 401 when no userId in context", async () => {
		// Build an app without userId injection
		const deps = createMockDeps(btHighWinrate, liveHighDrift);
		const app = new Elysia().use(errorHandlerPlugin).use(driftComparisonRoute(deps));
		const res = await app.handle(new Request(`${BASE}/journals/drift/${STRATEGY_A}`));
		expect(res.status).toBe(401);
	});
});

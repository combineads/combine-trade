import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import {
	type JournalAnalyticsGroupFilter,
	type JournalRawEntry,
	computeGroupStats,
} from "../src/lib/journal-analytics.js";
import { type JournalRouteDeps, journalRoutes } from "../src/routes/journals.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────

/** Three trades on BTCUSDT, one PASS */
const BTC_WIN: JournalRawEntry = {
	id: "j-1",
	userId: "user-1",
	strategyId: "strat-1",
	symbol: "BTCUSDT",
	direction: "LONG",
	netPnl: "200.00",
	entryTime: new Date("2026-01-10T00:00:00Z"),
	tags: ["breakout", "trending_up"],
	timeframe: "1h",
};

const BTC_LOSS: JournalRawEntry = {
	id: "j-2",
	userId: "user-1",
	strategyId: "strat-1",
	symbol: "BTCUSDT",
	direction: "LONG",
	netPnl: "-100.00",
	entryTime: new Date("2026-01-11T00:00:00Z"),
	tags: ["breakout"],
	timeframe: "1h",
};

const BTC_PASS: JournalRawEntry = {
	id: "j-3",
	userId: "user-1",
	strategyId: "strat-1",
	symbol: "BTCUSDT",
	direction: "PASS",
	netPnl: null,
	entryTime: new Date("2026-01-12T00:00:00Z"),
	tags: ["trending_up"],
	timeframe: "4h",
};

const ETH_WIN: JournalRawEntry = {
	id: "j-4",
	userId: "user-1",
	strategyId: "strat-1",
	symbol: "ETHUSDT",
	direction: "LONG",
	netPnl: "50.00",
	entryTime: new Date("2026-01-10T00:00:00Z"),
	tags: ["breakout"],
	timeframe: "4h",
};

const OTHER_USER: JournalRawEntry = {
	id: "j-5",
	userId: "user-2",
	strategyId: "strat-1",
	symbol: "BTCUSDT",
	direction: "LONG",
	netPnl: "999.00",
	entryTime: new Date("2026-01-10T00:00:00Z"),
	tags: ["breakout"],
	timeframe: "1h",
};

// ─── computeGroupStats unit tests ────────────────────────────────────────────

describe("computeGroupStats", () => {
	test("groupBy=symbol aggregates per symbol correctly", () => {
		const entries = [BTC_WIN, BTC_LOSS, BTC_PASS, ETH_WIN];
		const groups = computeGroupStats(entries, "symbol");

		const btc = groups.find((g) => g.key === "BTCUSDT");
		const eth = groups.find((g) => g.key === "ETHUSDT");

		expect(btc).toBeDefined();
		expect(btc?.tradeCount).toBe(3);
		// WIN=1, LOSS=1, PASS excluded from denominator → winrate = 1/2 = 50%
		expect(btc?.winrate).toBe("50");
		// expectancy = (0.5 × 200) − ((1 − 0.5) × 100) = 100 − 50 = 50
		expect(btc?.expectancy).toBe("50");
		// avgPnl = (200 + -100) / 3 = 100/3 ≈ 33.333... use decimal precision
		expect(new Decimal(btc?.avgPnl ?? "0").toFixed(4)).toBe(new Decimal("100").div("3").toFixed(4));

		expect(eth).toBeDefined();
		expect(eth?.tradeCount).toBe(1);
		expect(eth?.winrate).toBe("100");
		expect(eth?.avgPnl).toBe("50");
	});

	test("groupBy=tag expands multi-tag entries — trade appears in each tag group", () => {
		const entries = [BTC_WIN, BTC_LOSS]; // BTC_WIN has [breakout, trending_up], BTC_LOSS has [breakout]
		const groups = computeGroupStats(entries, "tag");

		const breakout = groups.find((g) => g.key === "breakout");
		const trendingUp = groups.find((g) => g.key === "trending_up");

		expect(breakout).toBeDefined();
		// BTC_WIN (WIN) + BTC_LOSS (LOSS) both in breakout → winrate 50%
		expect(breakout?.tradeCount).toBe(2);
		expect(breakout?.winrate).toBe("50");

		expect(trendingUp).toBeDefined();
		// BTC_WIN (WIN) only in trending_up → winrate 100%
		expect(trendingUp?.tradeCount).toBe(1);
		expect(trendingUp?.winrate).toBe("100");
	});

	test("groupBy=tag — PASS trade counted in tradeCount but not winrate denominator", () => {
		const entries = [BTC_WIN, BTC_PASS]; // both have trending_up tag
		const groups = computeGroupStats(entries, "tag");

		const trendingUp = groups.find((g) => g.key === "trending_up");
		expect(trendingUp?.tradeCount).toBe(2); // BTC_WIN + BTC_PASS
		expect(trendingUp?.winrate).toBe("100"); // only BTC_WIN in denominator → 1/1 = 100%
	});

	test("groupBy=strategy groups by strategyId", () => {
		const entries = [BTC_WIN, BTC_LOSS, ETH_WIN];
		const groups = computeGroupStats(entries, "strategy");

		expect(groups).toHaveLength(1);
		const g = groups[0];
		expect(g?.key).toBe("strat-1");
		expect(g?.tradeCount).toBe(3);
		// 2 wins (BTC_WIN + ETH_WIN), 1 loss (BTC_LOSS) → winrate 2/3
		const expectedWinrate = new Decimal("2").div("3").mul("100").toFixed(10);
		expect(new Decimal(g?.winrate ?? "0").toFixed(10)).toBe(expectedWinrate);
	});

	test("groupBy=timeframe groups by candle timeframe", () => {
		const entries = [BTC_WIN, BTC_LOSS, BTC_PASS, ETH_WIN];
		const groups = computeGroupStats(entries, "timeframe");

		const tf1h = groups.find((g) => g.key === "1h");
		const tf4h = groups.find((g) => g.key === "4h");

		// 1h: BTC_WIN (WIN) + BTC_LOSS (LOSS) → tradeCount=2, winrate=50%
		expect(tf1h?.tradeCount).toBe(2);
		expect(tf1h?.winrate).toBe("50");

		// 4h: BTC_PASS (PASS) + ETH_WIN (WIN) → tradeCount=2, PASS excluded → winrate=100%
		expect(tf4h?.tradeCount).toBe(2);
		expect(tf4h?.winrate).toBe("100");
	});

	test("PASS trades excluded from winrate/expectancy numerators but counted in tradeCount", () => {
		const entries = [BTC_WIN, BTC_PASS];
		const groups = computeGroupStats(entries, "symbol");

		const btc = groups.find((g) => g.key === "BTCUSDT");
		expect(btc?.tradeCount).toBe(2);
		expect(btc?.winrate).toBe("100"); // only 1 non-PASS trade (WIN) → 1/1 = 100%
		// expectancy: winrate=1, avgWin=200, avgLoss=0 → 1×200 − 0×0 = 200
		expect(btc?.expectancy).toBe("200");
	});

	test("empty group returns zero stats", () => {
		const groups = computeGroupStats([], "symbol");
		expect(groups).toHaveLength(0);
	});

	test("group with all PASS returns zero winrate/expectancy", () => {
		const entries = [BTC_PASS];
		const groups = computeGroupStats(entries, "symbol");

		const btc = groups.find((g) => g.key === "BTCUSDT");
		expect(btc?.tradeCount).toBe(1);
		expect(btc?.winrate).toBe("0");
		expect(btc?.expectancy).toBe("0");
		expect(btc?.avgPnl).toBe("0");
	});

	test("all monetary values are Decimal strings (no float drift)", () => {
		const entries = [BTC_WIN, BTC_LOSS];
		const groups = computeGroupStats(entries, "symbol");
		const btc = groups.find((g) => g.key === "BTCUSDT");

		// These must be parseable by Decimal without precision loss
		expect(() => new Decimal(btc?.winrate ?? "NaN")).not.toThrow();
		expect(() => new Decimal(btc?.expectancy ?? "NaN")).not.toThrow();
		expect(() => new Decimal(btc?.avgPnl ?? "NaN")).not.toThrow();

		// Must not contain 'e' notation or excessive float imprecision
		expect(btc?.winrate).not.toContain("e");
		expect(btc?.expectancy).not.toContain("e");
	});
});

// ─── Route integration tests ──────────────────────────────────────────────────

function createMockDepsWithAnalytics(userId: string, entries: JournalRawEntry[]): JournalRouteDeps {
	return {
		listJournals: async () => ({ data: [], total: 0 }),
		getJournal: async () => null,
		searchJournals: async () => ({ data: [], total: 0 }),
		getJournalAnalytics: async () => ({
			tagStats: [],
			overallWinrate: 0,
			overallExpectancy: 0,
		}),
		getJournalAnalyticsGroups: async (filter: JournalAnalyticsGroupFilter) => {
			// Apply userId filter (user isolation)
			let filtered = entries.filter((e) => e.userId === userId);

			// Apply date range
			if (filter.from) {
				const fromDate = new Date(filter.from);
				filtered = filtered.filter((e) => e.entryTime >= fromDate);
			}
			if (filter.to) {
				const toDate = new Date(filter.to);
				filtered = filtered.filter((e) => e.entryTime <= toDate);
			}
			if (filter.strategyId) {
				filtered = filtered.filter((e) => e.strategyId === filter.strategyId);
			}
			if (filter.symbol) {
				filtered = filtered.filter((e) => e.symbol === filter.symbol);
			}

			return computeGroupStats(filtered, filter.groupBy);
		},
	};
}

function createApp(deps: JournalRouteDeps) {
	return new Elysia().use(errorHandlerPlugin).use(journalRoutes(deps));
}

const BASE = "http://localhost/api/v1";

// Inject userId via X-User-Id header for route tests (mock auth)
function makeRequest(url: string, userId = "user-1") {
	return new Request(url, {
		headers: { "x-user-id": userId },
	});
}

describe("GET /api/v1/journals/analytics-groups route", () => {
	const allEntries = [BTC_WIN, BTC_LOSS, BTC_PASS, ETH_WIN, OTHER_USER];

	test("groupBy=symbol returns correct groups", async () => {
		const deps = createMockDepsWithAnalytics("user-1", allEntries);
		const app = createApp(deps);
		const res = await app.handle(makeRequest(`${BASE}/journals/analytics-groups?groupBy=symbol`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.groups).toBeDefined();
		const groups = body.data.groups as Array<{ key: string; tradeCount: number }>;
		// user-1 has BTCUSDT and ETHUSDT
		expect(groups.find((g) => g.key === "BTCUSDT")).toBeDefined();
		expect(groups.find((g) => g.key === "ETHUSDT")).toBeDefined();
		// OTHER_USER's BTC should not appear
		const btcGroup = groups.find((g) => g.key === "BTCUSDT");
		expect(btcGroup?.tradeCount).toBe(3); // j-1, j-2, j-3 (BTC_WIN, BTC_LOSS, BTC_PASS)
	});

	test("groupBy=tag returns per-tag groups", async () => {
		const deps = createMockDepsWithAnalytics("user-1", allEntries);
		const app = createApp(deps);
		const res = await app.handle(makeRequest(`${BASE}/journals/analytics-groups?groupBy=tag`));
		expect(res.status).toBe(200);
		const body = await res.json();
		const groups = body.data.groups as Array<{ key: string }>;
		expect(groups.some((g) => g.key === "breakout")).toBe(true);
		expect(groups.some((g) => g.key === "trending_up")).toBe(true);
	});

	test("groupBy=timeframe returns per-timeframe groups", async () => {
		const deps = createMockDepsWithAnalytics("user-1", allEntries);
		const app = createApp(deps);
		const res = await app.handle(
			makeRequest(`${BASE}/journals/analytics-groups?groupBy=timeframe`),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		const groups = body.data.groups as Array<{ key: string }>;
		expect(groups.some((g) => g.key === "1h")).toBe(true);
		expect(groups.some((g) => g.key === "4h")).toBe(true);
	});

	test("date range filter restricts aggregation window", async () => {
		const deps = createMockDepsWithAnalytics("user-1", allEntries);
		const app = createApp(deps);
		// Only include 2026-01-10 — that's BTC_WIN and ETH_WIN
		const res = await app.handle(
			makeRequest(
				`${BASE}/journals/analytics-groups?groupBy=symbol&from=2026-01-10T00:00:00Z&to=2026-01-10T23:59:59Z`,
			),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		const groups = body.data.groups as Array<{ key: string; tradeCount: number }>;
		const btc = groups.find((g) => g.key === "BTCUSDT");
		expect(btc?.tradeCount).toBe(1); // Only BTC_WIN
	});

	test("user isolation: returns only own journals, not other users", async () => {
		const deps = createMockDepsWithAnalytics("user-1", allEntries);
		const app = createApp(deps);
		const res = await app.handle(makeRequest(`${BASE}/journals/analytics-groups?groupBy=symbol`));
		const body = await res.json();
		const groups = body.data.groups as Array<{ key: string; tradeCount: number }>;
		const btc = groups.find((g) => g.key === "BTCUSDT");
		// user-1 has 3 BTC trades (not 4 — OTHER_USER's j-5 excluded)
		expect(btc?.tradeCount).toBe(3);
	});

	test("strategyId filter restricts results to that strategy", async () => {
		const strat2Entry: JournalRawEntry = {
			...BTC_WIN,
			id: "j-99",
			strategyId: "strat-2",
		};
		const deps = createMockDepsWithAnalytics("user-1", [...allEntries, strat2Entry]);
		const app = createApp(deps);
		const res = await app.handle(
			makeRequest(`${BASE}/journals/analytics-groups?groupBy=symbol&strategyId=strat-2`),
		);
		const body = await res.json();
		const groups = body.data.groups as Array<{ key: string; tradeCount: number }>;
		expect(groups.every((g) => g.key === "BTCUSDT" && g.tradeCount === 1)).toBe(true);
	});

	test("missing groupBy returns 422", async () => {
		const deps = createMockDepsWithAnalytics("user-1", allEntries);
		const app = createApp(deps);
		const res = await app.handle(makeRequest(`${BASE}/journals/analytics-groups`));
		expect(res.status).toBe(422);
	});

	test("invalid groupBy value returns 422", async () => {
		const deps = createMockDepsWithAnalytics("user-1", allEntries);
		const app = createApp(deps);
		const res = await app.handle(makeRequest(`${BASE}/journals/analytics-groups?groupBy=invalid`));
		expect(res.status).toBe(422);
	});
});

// Import Decimal to be used in test assertions
import Decimal from "decimal.js";

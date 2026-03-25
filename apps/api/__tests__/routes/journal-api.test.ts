/**
 * journal-api: journal list / detail / search route tests
 *
 * Tests:
 *   - GET /api/v1/journals  — paginated list with filters
 *   - GET /api/v1/journals/:id  — detail, 404 for missing/cross-user
 *   - GET /api/v1/journals/search  — text search on tags, symbol, notes
 *   - user isolation on all endpoints
 *   - limit cap at 100
 */
import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { errorHandlerPlugin } from "../../src/lib/errors.js";
import { type JournalV2RouteDeps, journalV2Routes } from "../../src/routes/journals/index.js";
import { withMockUserId } from "../helpers/auth.js";

const BASE = "http://localhost/api/v1";

const USER_A = "user-a";
const USER_B = "user-b";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const journalA1 = {
	id: "j-a1",
	userId: USER_A,
	strategyId: "strat-1",
	symbol: "BTCUSDT",
	side: "LONG" as const,
	outcome: "WIN" as const,
	pnlPct: 4.2,
	entryPrice: "50000",
	exitPrice: "52100",
	entryTime: "2026-01-01T10:00:00.000Z",
	exitTime: "2026-01-02T10:00:00.000Z",
	autoTags: ["breakout", "trend"],
	createdAt: "2026-01-02T10:00:00.000Z",
};

const journalA2 = {
	id: "j-a2",
	userId: USER_A,
	strategyId: "strat-2",
	symbol: "ETHUSDT",
	side: "SHORT" as const,
	outcome: "LOSS" as const,
	pnlPct: -2.1,
	entryPrice: "3000",
	exitPrice: "3063",
	entryTime: "2026-01-03T10:00:00.000Z",
	exitTime: "2026-01-04T10:00:00.000Z",
	autoTags: ["reversal"],
	createdAt: "2026-01-04T10:00:00.000Z",
};

const journalB1 = {
	id: "j-b1",
	userId: USER_B,
	strategyId: "strat-1",
	symbol: "BTCUSDT",
	side: "LONG" as const,
	outcome: "WIN" as const,
	pnlPct: 1.5,
	entryPrice: "50000",
	exitPrice: "50750",
	entryTime: "2026-01-01T10:00:00.000Z",
	exitTime: "2026-01-01T18:00:00.000Z",
	autoTags: [],
	createdAt: "2026-01-01T18:00:00.000Z",
};

const snapshotA1 = {
	id: "snap-a1",
	journalId: "j-a1",
	decision: { direction: "LONG", winrate: 0.65, expectancy: 1.2, sampleCount: 50 },
	notes: "Strong breakout with volume confirmation",
};

// ---------------------------------------------------------------------------
// Mock deps factories
// ---------------------------------------------------------------------------

type JournalLike = typeof journalA1;

function createMockDeps(
	journals: JournalLike[] = [journalA1, journalA2, journalB1],
): JournalV2RouteDeps {
	return {
		listJournals: async ({ userId, strategyId, symbol, side, outcome, from, to, page, limit }) => {
			let filtered = journals.filter((j) => j.userId === userId);
			if (strategyId) filtered = filtered.filter((j) => j.strategyId === strategyId);
			if (symbol) filtered = filtered.filter((j) => j.symbol === symbol);
			if (side) filtered = filtered.filter((j) => j.side === side);
			if (outcome) filtered = filtered.filter((j) => j.outcome === outcome);
			if (from) filtered = filtered.filter((j) => j.createdAt >= from);
			if (to) filtered = filtered.filter((j) => j.createdAt <= to);
			const total = filtered.length;
			const start = (page - 1) * limit;
			return { data: filtered.slice(start, start + limit), total };
		},
		getJournal: async ({ id, userId }) => {
			const journal = journals.find((j) => j.id === id && j.userId === userId);
			if (!journal) return null;
			const snapshot = id === "j-a1" ? snapshotA1 : null;
			return { journal, entrySnapshot: snapshot };
		},
		searchJournals: async ({ q, userId, page, limit }) => {
			let filtered = journals.filter((j) => j.userId === userId);

			const tagPrefix = "tag:";
			if (q.startsWith(tagPrefix)) {
				const tag = q.slice(tagPrefix.length).toLowerCase();
				filtered = filtered.filter((j) => j.autoTags.some((t) => t.toLowerCase().includes(tag)));
			} else {
				const term = q.toLowerCase();
				filtered = filtered.filter(
					(j) =>
						j.symbol.toLowerCase().includes(term) ||
						j.autoTags.some((t) => t.toLowerCase().includes(term)),
				);
			}

			const total = filtered.length;
			const start = (page - 1) * limit;
			return { data: filtered.slice(start, start + limit), total };
		},
	};
}

function createApp(userId: string = USER_A, deps?: JournalV2RouteDeps) {
	return new Elysia()
		.use(withMockUserId(userId))
		.use(errorHandlerPlugin)
		.use(journalV2Routes(deps ?? createMockDeps()));
}

// ---------------------------------------------------------------------------
// List tests
// ---------------------------------------------------------------------------

describe("journal-api: GET /journals (list)", () => {
	test("returns paginated response for authenticated user", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(2); // USER_A has j-a1, j-a2
		expect(body.meta.total).toBe(2);
		expect(body.meta.page).toBe(1);
		expect(body.meta.limit).toBe(20);
	});

	test("filters by strategyId", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals?strategyId=strat-1`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].id).toBe("j-a1");
	});

	test("filters by symbol", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals?symbol=ETHUSDT`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].id).toBe("j-a2");
	});

	test("filters by side=LONG", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals?side=LONG`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].side).toBe("LONG");
	});

	test("filters by side=SHORT", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals?side=SHORT`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].side).toBe("SHORT");
	});

	test("filters by outcome=WIN", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals?outcome=WIN`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].outcome).toBe("WIN");
	});

	test("filters by date range (from/to)", async () => {
		const app = createApp(USER_A);
		// j-a1 createdAt=2026-01-02, j-a2 createdAt=2026-01-04
		const res = await app.handle(
			new Request(`${BASE}/journals?from=2026-01-03T00:00:00.000Z&to=2026-01-05T00:00:00.000Z`),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].id).toBe("j-a2");
	});

	test("user isolation — USER_A cannot see USER_B journals", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals`));
		const body = await res.json();
		const ids = body.data.map((j: { id: string }) => j.id);
		expect(ids).not.toContain("j-b1");
	});

	test("user isolation — USER_B only sees own journals", async () => {
		const app = createApp(USER_B);
		const res = await app.handle(new Request(`${BASE}/journals`));
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].id).toBe("j-b1");
	});

	test("limit capped at 100", async () => {
		let capturedLimit = 0;
		const deps: JournalV2RouteDeps = {
			listJournals: async ({ limit }) => {
				capturedLimit = limit;
				return { data: [], total: 0 };
			},
			getJournal: async () => null,
			searchJournals: async () => ({ data: [], total: 0 }),
		};
		const app = createApp(USER_A, deps);
		await app.handle(new Request(`${BASE}/journals?limit=999`));
		expect(capturedLimit).toBe(100);
	});

	test("default limit is 20", async () => {
		let capturedLimit = 0;
		const deps: JournalV2RouteDeps = {
			listJournals: async ({ limit }) => {
				capturedLimit = limit;
				return { data: [], total: 0 };
			},
			getJournal: async () => null,
			searchJournals: async () => ({ data: [], total: 0 }),
		};
		const app = createApp(USER_A, deps);
		await app.handle(new Request(`${BASE}/journals`));
		expect(capturedLimit).toBe(20);
	});
});

// ---------------------------------------------------------------------------
// Detail tests
// ---------------------------------------------------------------------------

describe("journal-api: GET /journals/:id (detail)", () => {
	test("returns full journal with entry snapshot", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals/j-a1`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.journal.id).toBe("j-a1");
		expect(body.data.entrySnapshot.id).toBe("snap-a1");
	});

	test("returns 404 for unknown id", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals/nonexistent`));
		expect(res.status).toBe(404);
	});

	test("returns 404 for cross-user access (USER_A requesting USER_B journal)", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals/j-b1`));
		expect(res.status).toBe(404);
	});

	test("USER_B can access own journal", async () => {
		const app = createApp(USER_B);
		const res = await app.handle(new Request(`${BASE}/journals/j-b1`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.journal.id).toBe("j-b1");
	});
});

// ---------------------------------------------------------------------------
// Search tests
// ---------------------------------------------------------------------------

describe("journal-api: GET /journals/search (text search)", () => {
	test("q=BTC matches symbol", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals/search?q=BTC`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].symbol).toBe("BTCUSDT");
	});

	test("q=breakout matches autoTags", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals/search?q=breakout`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].id).toBe("j-a1");
	});

	test("q=tag:breakout matches tags with prefix syntax", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(
			new Request(`${BASE}/journals/search?q=${encodeURIComponent("tag:breakout")}`),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].id).toBe("j-a1");
	});

	test("q=tag:nonexistent returns empty result", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(
			new Request(`${BASE}/journals/search?q=${encodeURIComponent("tag:nonexistent")}`),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(0);
		expect(body.meta.total).toBe(0);
	});

	test("search is user-isolated — USER_A search cannot return USER_B results", async () => {
		const app = createApp(USER_A);
		// USER_B also has BTCUSDT but USER_A search should not return it
		const res = await app.handle(new Request(`${BASE}/journals/search?q=BTC`));
		const body = await res.json();
		const ids = body.data.map((j: { id: string }) => j.id);
		expect(ids).not.toContain("j-b1");
	});

	test("q is required — missing q returns 422", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals/search`));
		expect(res.status).toBe(422);
	});

	test("pagination respected in search results", async () => {
		const app = createApp(USER_A);
		const res = await app.handle(new Request(`${BASE}/journals/search?q=usdt&page=1&limit=1`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.meta.limit).toBe(1);
		expect(body.meta.total).toBe(2); // both BTCUSDT and ETHUSDT match
	});

	test("search limit capped at 100", async () => {
		let capturedLimit = 0;
		const deps: JournalV2RouteDeps = {
			listJournals: async () => ({ data: [], total: 0 }),
			getJournal: async () => null,
			searchJournals: async ({ limit }) => {
				capturedLimit = limit;
				return { data: [], total: 0 };
			},
		};
		const app = createApp(USER_A, deps);
		await app.handle(new Request(`${BASE}/journals/search?q=test&limit=999`));
		expect(capturedLimit).toBe(100);
	});
});

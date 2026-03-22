import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import { journalRoutes, type JournalRouteDeps } from "../src/routes/journals.js";

const sampleJournal = {
	id: "j-1",
	strategyId: "strat-1",
	symbol: "BTCUSDT",
	direction: "long" as const,
	entryPrice: "50000",
	exitPrice: "52000",
	pnl: "200",
	tags: ["breakout", "trend"],
	createdAt: new Date("2026-01-15").toISOString(),
};

const sampleSnapshot = {
	id: "snap-1",
	journalId: "j-1",
	indicators: { rsi: 65, macd: 0.5 },
	notes: "Strong breakout pattern",
};

function createMockDeps(): JournalRouteDeps {
	return {
		listJournals: async (query) => ({
			data: [sampleJournal],
			total: 1,
		}),
		getJournal: async (id) => {
			if (id === "j-1") return { journal: sampleJournal, entrySnapshot: sampleSnapshot };
			return null;
		},
		searchJournals: async (filter) => ({
			data: filter.symbol === "ETHUSDT" ? [] : [sampleJournal],
			total: filter.symbol === "ETHUSDT" ? 0 : 1,
		}),
		getJournalAnalytics: async () => ({
			tagStats: [
				{ tag: "breakout", count: 5, winrate: 0.7, expectancy: 1.2 },
			],
			overallWinrate: 0.65,
			overallExpectancy: 0.95,
		}),
	};
}

function createApp(deps?: JournalRouteDeps) {
	return new Elysia().use(errorHandlerPlugin).use(journalRoutes(deps ?? createMockDeps()));
}

const BASE = "http://localhost/api/v1";

describe("Journal routes", () => {
	test("GET /journals returns paginated response", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/journals`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.meta.total).toBe(1);
		expect(body.meta.page).toBe(1);
	});

	test("GET /journals/:id returns journal with snapshot", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/journals/j-1`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.journal.id).toBe("j-1");
		expect(body.data.entrySnapshot.id).toBe("snap-1");
	});

	test("GET /journals/:id returns 404 for unknown id", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/journals/unknown`));
		expect(res.status).toBe(404);
	});

	test("GET /journals/search filters correctly", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/journals/search?symbol=ETHUSDT`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(0);
	});

	test("GET /journals/analytics returns tag stats", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/journals/analytics`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.tagStats).toBeArrayOfSize(1);
		expect(body.data.overallWinrate).toBe(0.65);
		expect(body.data.overallExpectancy).toBe(0.95);
	});
});

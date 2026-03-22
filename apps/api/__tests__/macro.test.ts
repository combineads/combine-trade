import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import { type MacroRouteDeps, macroRoutes } from "../src/routes/macro.js";

interface MacroEvent {
	id: string;
	title: string;
	impact: string;
	scheduledAt: string;
}

interface TagAnalytics {
	tag: string;
	trades: number;
	winrate: number;
	avgMae: number;
}

function createMockDeps(): MacroRouteDeps {
	const events: MacroEvent[] = [
		{
			id: "evt-1",
			title: "FOMC Rate Decision",
			impact: "HIGH",
			scheduledAt: "2026-03-22T18:00:00Z",
		},
		{
			id: "evt-2",
			title: "CPI m/m",
			impact: "MEDIUM",
			scheduledAt: "2026-03-23T12:30:00Z",
		},
		{
			id: "evt-3",
			title: "Building Permits",
			impact: "LOW",
			scheduledAt: "2026-03-24T12:30:00Z",
		},
	];

	const analytics: TagAnalytics[] = [
		{ tag: "fomc_week", trades: 12, winrate: 0.33, avgMae: 2.1 },
		{ tag: "normal_day", trades: 67, winrate: 0.62, avgMae: 0.8 },
	];

	return {
		findEvents: async (opts: {
			startDate?: string;
			endDate?: string;
			impact?: string;
		}) => {
			let filtered = events;
			const { startDate, endDate, impact } = opts;
			if (impact) {
				filtered = filtered.filter((e) => e.impact === impact);
			}
			if (startDate) {
				filtered = filtered.filter((e) => e.scheduledAt >= startDate);
			}
			if (endDate) {
				filtered = filtered.filter((e) => e.scheduledAt <= endDate);
			}
			return filtered;
		},
		getMacroAnalytics: async () => analytics,
		getRetrospective: async (journalId: string) => {
			if (journalId === "j-1") {
				return { report: "회고 리포트 내용", generatedAt: "2026-03-22T20:00:00Z" };
			}
			if (journalId === "j-2") {
				return { report: null, generatedAt: null };
			}
			return null;
		},
	};
}

function createApp(deps?: MacroRouteDeps) {
	return new Elysia().use(errorHandlerPlugin).use(macroRoutes(deps ?? createMockDeps()));
}

const BASE = "http://localhost";

describe("Macro routes", () => {
	test("GET /api/v1/macro/events returns all events", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/api/v1/macro/events`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toHaveLength(3);
	});

	test("GET /api/v1/macro/events filters by impact", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/api/v1/macro/events?impact=HIGH`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toHaveLength(1);
		expect(body.data[0].impact).toBe("HIGH");
	});

	test("GET /api/v1/macro/events filters by date range", async () => {
		const app = createApp();
		const res = await app.handle(
			new Request(
				`${BASE}/api/v1/macro/events?startDate=2026-03-23T00:00:00Z&endDate=2026-03-23T23:59:59Z`,
			),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toHaveLength(1);
		expect(body.data[0].title).toBe("CPI m/m");
	});

	test("GET /api/v1/journals/macro-analytics returns tag analytics", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/api/v1/journals/macro-analytics`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toHaveLength(2);
		expect(body.data[0].tag).toBe("fomc_week");
	});

	test("GET /api/v1/journals/:id/retrospective returns report", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/api/v1/journals/j-1/retrospective`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.report).toBe("회고 리포트 내용");
	});

	test("GET /api/v1/journals/:id/retrospective returns pending for null report", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/api/v1/journals/j-2/retrospective`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.report).toBeNull();
		expect(body.data.pending).toBe(true);
	});

	test("GET /api/v1/journals/:id/retrospective returns 404 for unknown", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/api/v1/journals/unknown/retrospective`));
		expect(res.status).toBe(404);
	});
});

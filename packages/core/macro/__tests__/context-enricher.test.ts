import { describe, expect, mock, test } from "bun:test";
import { type MacroContextRepository, enrichWithMacroContext } from "../context-enricher.js";
import type { EconomicEvent, NewsItem } from "../types.js";

function makeEvent(overrides: Partial<EconomicEvent> = {}): EconomicEvent {
	return {
		id: "evt-1",
		externalId: "ext-1",
		title: "★★★ FOMC",
		eventName: "FOMC",
		impact: "HIGH",
		scheduledAt: new Date("2026-03-22T18:00:00Z"),
		newsCollected: true,
		newsCollectedAt: new Date("2026-03-22T18:05:00Z"),
		createdAt: new Date("2026-03-22T00:00:00Z"),
		...overrides,
	};
}

function makeNews(overrides: Partial<NewsItem> = {}): NewsItem {
	return {
		id: "news-1",
		externalId: "ext-n1",
		headline: "Fed holds rates",
		source: "Reuters",
		publishedAt: new Date("2026-03-22T18:15:00Z"),
		tags: ["fed"],
		economicEventId: "evt-1",
		createdAt: new Date("2026-03-22T18:16:00Z"),
		...overrides,
	};
}

function createMockRepo(
	events: EconomicEvent[] = [],
	news: NewsItem[] = [],
): MacroContextRepository {
	return {
		findEventsInRange: mock(async (from: Date, to: Date) =>
			events.filter(
				(e) => e.scheduledAt.getTime() >= from.getTime() && e.scheduledAt.getTime() <= to.getTime(),
			),
		),
		findNewsInRange: mock(async (from: Date, to: Date) =>
			news.filter(
				(n) => n.publishedAt.getTime() >= from.getTime() && n.publishedAt.getTime() <= to.getTime(),
			),
		),
	};
}

describe("enrichWithMacroContext", () => {
	const entryTime = new Date("2026-03-22T18:00:00Z");
	const exitTime = new Date("2026-03-22T20:00:00Z");

	test("queries entry events within ±2 hours", async () => {
		const event = makeEvent({
			scheduledAt: new Date("2026-03-22T17:00:00Z"),
		});
		const repo = createMockRepo([event], []);

		const ctx = await enrichWithMacroContext(entryTime, exitTime, repo);

		expect(ctx.entryEvents).toHaveLength(1);
		expect(repo.findEventsInRange).toHaveBeenCalledTimes(2);
	});

	test("queries entry news within ±1 hour", async () => {
		const news = makeNews({
			publishedAt: new Date("2026-03-22T17:30:00Z"),
		});
		const repo = createMockRepo([], [news]);

		const ctx = await enrichWithMacroContext(entryTime, exitTime, repo);

		expect(ctx.entryNews).toHaveLength(1);
	});

	test("queries exit events within ±30 minutes", async () => {
		const event = makeEvent({
			scheduledAt: new Date("2026-03-22T20:15:00Z"),
		});
		const repo = createMockRepo([event], []);

		const ctx = await enrichWithMacroContext(entryTime, exitTime, repo);

		expect(ctx.exitEvents).toHaveLength(1);
	});

	test("queries exit news within ±30 minutes", async () => {
		const news = makeNews({
			publishedAt: new Date("2026-03-22T19:45:00Z"),
		});
		const repo = createMockRepo([], [news]);

		const ctx = await enrichWithMacroContext(entryTime, exitTime, repo);

		expect(ctx.exitNews).toHaveLength(1);
	});

	test("excludes events outside entry window", async () => {
		const farEvent = makeEvent({
			scheduledAt: new Date("2026-03-22T10:00:00Z"),
		});
		const repo = createMockRepo([farEvent], []);

		const ctx = await enrichWithMacroContext(entryTime, exitTime, repo);

		expect(ctx.entryEvents).toHaveLength(0);
	});

	test("returns empty arrays when no data", async () => {
		const repo = createMockRepo([], []);

		const ctx = await enrichWithMacroContext(entryTime, exitTime, repo);

		expect(ctx.entryEvents).toEqual([]);
		expect(ctx.entryNews).toEqual([]);
		expect(ctx.exitEvents).toEqual([]);
		expect(ctx.exitNews).toEqual([]);
	});

	test("handles same entry and exit time", async () => {
		const repo = createMockRepo([], []);

		const ctx = await enrichWithMacroContext(entryTime, entryTime, repo);

		expect(ctx.entryEvents).toEqual([]);
		expect(ctx.exitEvents).toEqual([]);
	});
});

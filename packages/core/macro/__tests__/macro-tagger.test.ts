import { describe, expect, test } from "bun:test";
import { generateMacroTags } from "../macro-tagger.js";
import type { EconomicEvent, MacroContext, NewsItem } from "../types.js";

function makeEvent(overrides: Partial<EconomicEvent> = {}): EconomicEvent {
	return {
		id: "evt-1",
		externalId: "ext-1",
		title: "★★★ FOMC Rate Decision",
		eventName: "FOMC Rate Decision",
		impact: "HIGH",
		scheduledAt: new Date("2026-03-25T18:00:00Z"),
		newsCollected: true,
		newsCollectedAt: new Date(),
		createdAt: new Date(),
		...overrides,
	};
}

function makeNews(overrides: Partial<NewsItem> = {}): NewsItem {
	return {
		id: "news-1",
		externalId: "ext-n1",
		headline: "Breaking news headline",
		source: "Reuters",
		publishedAt: new Date("2026-03-22T18:00:00Z"),
		tags: [],
		economicEventId: null,
		createdAt: new Date(),
		...overrides,
	};
}

function emptyContext(): MacroContext {
	return { entryEvents: [], entryNews: [], exitEvents: [], exitNews: [] };
}

describe("generateMacroTags", () => {
	const entryTime = new Date("2026-03-22T18:00:00Z");

	test("returns empty array for empty context", () => {
		const tags = generateMacroTags(emptyContext(), entryTime);
		expect(tags).toEqual([]);
	});

	test("generates fomc_week tag for FOMC event within D-7 to D+1", () => {
		const ctx = emptyContext();
		ctx.entryEvents = [
			makeEvent({
				eventName: "FOMC Rate Decision",
				scheduledAt: new Date("2026-03-25T18:00:00Z"),
			}),
		];
		const tags = generateMacroTags(ctx, entryTime);
		expect(tags).toContain("fomc_week");
	});

	test("no fomc_week if FOMC event is more than 7 days away", () => {
		const ctx = emptyContext();
		ctx.entryEvents = [
			makeEvent({
				eventName: "FOMC Rate Decision",
				scheduledAt: new Date("2026-04-10T18:00:00Z"),
			}),
		];
		const tags = generateMacroTags(ctx, entryTime);
		expect(tags).not.toContain("fomc_week");
	});

	test("generates cpi_day tag for CPI event on entry day", () => {
		const ctx = emptyContext();
		ctx.entryEvents = [
			makeEvent({
				eventName: "CPI m/m",
				scheduledAt: new Date("2026-03-22T12:30:00Z"),
			}),
		];
		const tags = generateMacroTags(ctx, entryTime);
		expect(tags).toContain("cpi_day");
	});

	test("generates nfp_day tag for Non-Farm Payrolls", () => {
		const ctx = emptyContext();
		ctx.entryEvents = [
			makeEvent({
				eventName: "Non-Farm Employment Change",
				scheduledAt: new Date("2026-03-22T12:30:00Z"),
			}),
		];
		const tags = generateMacroTags(ctx, entryTime);
		expect(tags).toContain("nfp_day");
	});

	test("generates pmi_day tag for PMI event", () => {
		const ctx = emptyContext();
		ctx.entryEvents = [
			makeEvent({
				eventName: "Manufacturing PMI",
				scheduledAt: new Date("2026-03-22T14:00:00Z"),
			}),
		];
		const tags = generateMacroTags(ctx, entryTime);
		expect(tags).toContain("pmi_day");
	});

	test("generates pre_high_impact_event for HIGH event within 24h", () => {
		const ctx = emptyContext();
		ctx.entryEvents = [
			makeEvent({
				impact: "HIGH",
				scheduledAt: new Date("2026-03-23T12:00:00Z"),
			}),
		];
		const tags = generateMacroTags(ctx, entryTime);
		expect(tags).toContain("pre_high_impact_event");
	});

	test("no pre_high_impact_event for MEDIUM impact", () => {
		const ctx = emptyContext();
		ctx.entryEvents = [
			makeEvent({
				impact: "MEDIUM",
				scheduledAt: new Date("2026-03-23T12:00:00Z"),
			}),
		];
		const tags = generateMacroTags(ctx, entryTime);
		expect(tags).not.toContain("pre_high_impact_event");
	});

	test("generates major_news_at_entry for 2+ news within ±1h", () => {
		const ctx = emptyContext();
		ctx.entryNews = [
			makeNews({ publishedAt: new Date("2026-03-22T17:30:00Z") }),
			makeNews({
				id: "news-2",
				publishedAt: new Date("2026-03-22T18:20:00Z"),
			}),
		];
		const tags = generateMacroTags(ctx, entryTime);
		expect(tags).toContain("major_news_at_entry");
	});

	test("no major_news_at_entry for only 1 news item", () => {
		const ctx = emptyContext();
		ctx.entryNews = [
			makeNews({ publishedAt: new Date("2026-03-22T17:30:00Z") }),
		];
		const tags = generateMacroTags(ctx, entryTime);
		expect(tags).not.toContain("major_news_at_entry");
	});

	test("generates geopolitical_risk from headline keywords", () => {
		const ctx = emptyContext();
		ctx.entryNews = [
			makeNews({ headline: "US imposes new sanctions on Iran" }),
		];
		const tags = generateMacroTags(ctx, entryTime);
		expect(tags).toContain("geopolitical_risk");
	});

	test("geopolitical_risk is case-insensitive", () => {
		const ctx = emptyContext();
		ctx.entryNews = [makeNews({ headline: "WAR breaks out in region" })];
		const tags = generateMacroTags(ctx, entryTime);
		expect(tags).toContain("geopolitical_risk");
	});

	test("no duplicate tags", () => {
		const ctx = emptyContext();
		ctx.entryNews = [
			makeNews({ headline: "War and sanctions escalate" }),
			makeNews({
				id: "n2",
				headline: "More war news and conflict",
			}),
		];
		const tags = generateMacroTags(ctx, entryTime);
		const geoCount = tags.filter((t) => t === "geopolitical_risk").length;
		expect(geoCount).toBe(1);
	});
});

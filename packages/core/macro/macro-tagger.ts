import type { EconomicEvent, MacroContext, NewsItem } from "./types.js";

const GEOPOLITICAL_KEYWORDS = [
	"war",
	"sanction",
	"conflict",
	"tariff",
	"missile",
	"invasion",
	"nuclear",
	"military",
	"embargo",
	"geopolitic",
	"tension",
	"escalat",
];

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;
const SEVEN_DAYS_MS = 7 * 24 * ONE_HOUR_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

function isSameDay(a: Date, b: Date): boolean {
	return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function isFomcEvent(event: EconomicEvent): boolean {
	return event.eventName.toLowerCase().includes("fomc");
}

function isCpiEvent(event: EconomicEvent): boolean {
	return event.eventName.toLowerCase().includes("cpi");
}

function isNfpEvent(event: EconomicEvent): boolean {
	const name = event.eventName.toLowerCase();
	return name.includes("non-farm") || name.includes("nonfarm");
}

function isPmiEvent(event: EconomicEvent): boolean {
	return event.eventName.toLowerCase().includes("pmi");
}

function hasGeopoliticalKeyword(news: NewsItem): boolean {
	const lower = news.headline.toLowerCase();
	return GEOPOLITICAL_KEYWORDS.some((kw) => lower.includes(kw));
}

export function generateMacroTags(context: MacroContext, entryTime: Date): string[] {
	const tags = new Set<string>();
	const allEvents = [...context.entryEvents, ...context.exitEvents];
	const allNews = [...context.entryNews, ...context.exitNews];

	for (const event of allEvents) {
		const diff = event.scheduledAt.getTime() - entryTime.getTime();

		if (isFomcEvent(event) && diff >= -ONE_DAY_MS && diff <= SEVEN_DAYS_MS) {
			tags.add("fomc_week");
		}

		if (isSameDay(event.scheduledAt, entryTime)) {
			if (isCpiEvent(event)) tags.add("cpi_day");
			if (isNfpEvent(event)) tags.add("nfp_day");
			if (isPmiEvent(event)) tags.add("pmi_day");
		}

		if (event.impact === "HIGH" && diff > 0 && diff <= TWENTY_FOUR_HOURS_MS) {
			tags.add("pre_high_impact_event");
		}
	}

	if (context.entryNews.length >= 2) {
		tags.add("major_news_at_entry");
	}

	for (const news of allNews) {
		if (hasGeopoliticalKeyword(news)) {
			tags.add("geopolitical_risk");
			break;
		}
	}

	return [...tags];
}

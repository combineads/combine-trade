import type { EconomicEvent, MacroContext, NewsItem } from "./types.js";

export interface MacroContextRepository {
	findEventsInRange(from: Date, to: Date): Promise<EconomicEvent[]>;
	findNewsInRange(from: Date, to: Date): Promise<NewsItem[]>;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export async function enrichWithMacroContext(
	entryTime: Date,
	exitTime: Date,
	repo: MacroContextRepository,
): Promise<MacroContext> {
	const [entryEvents, entryNews, exitEvents, exitNews] = await Promise.all([
		repo.findEventsInRange(
			new Date(entryTime.getTime() - TWO_HOURS_MS),
			new Date(entryTime.getTime() + TWO_HOURS_MS),
		),
		repo.findNewsInRange(
			new Date(entryTime.getTime() - ONE_HOUR_MS),
			new Date(entryTime.getTime() + ONE_HOUR_MS),
		),
		repo.findEventsInRange(
			new Date(exitTime.getTime() - THIRTY_MINUTES_MS),
			new Date(exitTime.getTime() + THIRTY_MINUTES_MS),
		),
		repo.findNewsInRange(
			new Date(exitTime.getTime() - THIRTY_MINUTES_MS),
			new Date(exitTime.getTime() + THIRTY_MINUTES_MS),
		),
	]);

	return { entryEvents, entryNews, exitEvents, exitNews };
}

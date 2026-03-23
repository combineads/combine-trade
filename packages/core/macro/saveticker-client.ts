import { extractEventName, parseImpactFromTitle } from "./impact-parser.js";
import type { CreateEconomicEventInput, CreateNewsItemInput } from "./types.js";

export interface SavetickerClientConfig {
	baseUrl: string;
	fetch?: typeof globalThis.fetch;
	retryDelayMs?: number;
}

interface RawCalendarEvent {
	id: string;
	title: string;
	date: string;
}

interface RawNewsItem {
	id: string;
	title: string;
	source_name: string;
	created_at: string;
	tag_names?: string[];
}

function formatDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export class SavetickerClient {
	private readonly baseUrl: string;
	private readonly fetchFn: typeof globalThis.fetch;
	private readonly retryDelayMs: number;
	private readonly maxRetries = 3;

	constructor(config: SavetickerClientConfig) {
		this.baseUrl = config.baseUrl;
		this.fetchFn = config.fetch ?? globalThis.fetch;
		this.retryDelayMs = config.retryDelayMs ?? 1000;
	}

	async fetchCalendarEvents(startDate: Date, endDate: Date): Promise<CreateEconomicEventInput[]> {
		const url = `${this.baseUrl}/api/calendar?start=${formatDate(startDate)}&end=${formatDate(endDate)}`;
		const data = await this.fetchWithRetry<RawCalendarEvent[]>(url);
		if (!data) return [];

		return data.map((raw) => ({
			externalId: raw.id,
			title: raw.title,
			eventName: extractEventName(raw.title),
			impact: parseImpactFromTitle(raw.title),
			scheduledAt: new Date(raw.date),
		}));
	}

	async fetchRecentNews(pageSize: number, afterTime?: Date): Promise<CreateNewsItemInput[]> {
		let url = `${this.baseUrl}/api/news?page_size=${pageSize}`;
		if (afterTime) {
			url += `&after=${formatDate(afterTime)}`;
		}
		const data = await this.fetchWithRetry<RawNewsItem[]>(url);
		if (!data) return [];

		return data.map((raw) => ({
			externalId: raw.id,
			headline: raw.title,
			source: raw.source_name,
			publishedAt: new Date(raw.created_at),
			tags: raw.tag_names ?? [],
		}));
	}

	private async fetchWithRetry<T>(url: string): Promise<T | null> {
		for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
			try {
				const res = await this.fetchFn(url);
				if (!res.ok) {
					console.warn(`saveticker API returned ${res.status} for ${url}`);
					return null;
				}
				return (await res.json()) as T;
			} catch (err) {
				console.warn(`saveticker fetch attempt ${attempt}/${this.maxRetries} failed:`, err);
				if (attempt < this.maxRetries) {
					await this.delay(this.retryDelayMs * 2 ** (attempt - 1));
				}
			}
		}
		return null;
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

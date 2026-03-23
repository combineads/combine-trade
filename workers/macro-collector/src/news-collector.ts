import type { CreateNewsItemInput } from "../../../packages/core/macro/types.js";

export interface PendingEvent {
	id: string;
	externalId: string;
	scheduledAt: Date;
}

export interface NewsEventRepository {
	findPendingEvents(): Promise<PendingEvent[]>;
	upsertNews(input: CreateNewsItemInput): Promise<void>;
	markCollected(eventId: string): Promise<void>;
}

export interface NewsCollectorDeps {
	fetchNews: (pageSize: number, afterTime?: Date) => Promise<CreateNewsItemInput[]>;
	repository: NewsEventRepository;
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export class NewsCollector {
	private readonly fetchNews: NewsCollectorDeps["fetchNews"];
	private readonly repository: NewsEventRepository;

	constructor(deps: NewsCollectorDeps) {
		this.fetchNews = deps.fetchNews;
		this.repository = deps.repository;
	}

	async collectPendingEvents(): Promise<void> {
		const pendingEvents = await this.repository.findPendingEvents();
		if (pendingEvents.length === 0) return;

		for (const event of pendingEvents) {
			await this.collectForEvent(event);
		}
	}

	private async collectForEvent(event: PendingEvent): Promise<void> {
		let allNews: CreateNewsItemInput[];
		try {
			allNews = await this.fetchNews(50);
		} catch (err) {
			console.warn(`News collection failed for event ${event.id}:`, err);
			return;
		}

		const windowStart = new Date(event.scheduledAt.getTime() - THIRTY_MINUTES_MS);
		const windowEnd = new Date(event.scheduledAt.getTime() + THIRTY_MINUTES_MS);

		const relevant = allNews.filter((n) => {
			const t = n.publishedAt.getTime();
			return t >= windowStart.getTime() && t <= windowEnd.getTime();
		});

		for (const news of relevant) {
			await this.repository.upsertNews({
				...news,
				economicEventId: event.id,
			});
		}

		await this.repository.markCollected(event.id);
	}
}

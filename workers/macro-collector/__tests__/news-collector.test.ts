import { describe, expect, mock, test } from "bun:test";
import type { CreateNewsItemInput } from "@combine/core/macro/types.js";
import {
	NewsCollector,
	type NewsEventRepository,
	type PendingEvent,
} from "../src/news-collector.js";

function makePendingEvent(overrides: Partial<PendingEvent> = {}): PendingEvent {
	return {
		id: "evt-1",
		externalId: "ext-1",
		scheduledAt: new Date("2026-03-22T18:00:00Z"),
		...overrides,
	};
}

function makeNewsItem(overrides: Partial<CreateNewsItemInput> = {}): CreateNewsItemInput {
	return {
		externalId: "news-1",
		headline: "Fed holds rates steady",
		source: "Reuters",
		publishedAt: new Date("2026-03-22T18:15:00Z"),
		tags: ["fed"],
		...overrides,
	};
}

function createMockRepo(pendingEvents: PendingEvent[] = []): NewsEventRepository {
	const collectedIds = new Set<string>();
	return {
		findPendingEvents: mock(async () => pendingEvents.filter((e) => !collectedIds.has(e.id))),
		upsertNews: mock(async (_input: CreateNewsItemInput) => {}),
		markCollected: mock(async (eventId: string) => {
			collectedIds.add(eventId);
		}),
	};
}

describe("NewsCollector", () => {
	test("collects news for pending events within ±30min window", async () => {
		const event = makePendingEvent({
			scheduledAt: new Date("2026-03-22T18:00:00Z"),
		});
		const newsInWindow = makeNewsItem({
			externalId: "n1",
			publishedAt: new Date("2026-03-22T18:15:00Z"),
		});
		const newsOutsideWindow = makeNewsItem({
			externalId: "n2",
			publishedAt: new Date("2026-03-22T20:00:00Z"),
		});
		const fetchNews = mock(() => Promise.resolve([newsInWindow, newsOutsideWindow]));
		const repo = createMockRepo([event]);

		const collector = new NewsCollector({ fetchNews, repository: repo });
		await collector.collectPendingEvents();

		expect(repo.upsertNews).toHaveBeenCalledTimes(1);
		const savedNews = (repo.upsertNews as ReturnType<typeof mock>).mock
			.calls[0][0] as CreateNewsItemInput;
		expect(savedNews.externalId).toBe("n1");
		expect(savedNews.economicEventId).toBe("evt-1");
	});

	test("marks event as collected after successful news collection", async () => {
		const event = makePendingEvent();
		const fetchNews = mock(() => Promise.resolve([makeNewsItem()]));
		const repo = createMockRepo([event]);

		const collector = new NewsCollector({ fetchNews, repository: repo });
		await collector.collectPendingEvents();

		expect(repo.markCollected).toHaveBeenCalledTimes(1);
		expect((repo.markCollected as ReturnType<typeof mock>).mock.calls[0][0]).toBe("evt-1");
	});

	test("processes multiple pending events independently", async () => {
		const events = [
			makePendingEvent({
				id: "evt-1",
				scheduledAt: new Date("2026-03-22T12:00:00Z"),
			}),
			makePendingEvent({
				id: "evt-2",
				scheduledAt: new Date("2026-03-22T18:00:00Z"),
			}),
		];
		const fetchNews = mock(() =>
			Promise.resolve([
				makeNewsItem({
					externalId: "n1",
					publishedAt: new Date("2026-03-22T12:10:00Z"),
				}),
				makeNewsItem({
					externalId: "n2",
					publishedAt: new Date("2026-03-22T18:10:00Z"),
				}),
			]),
		);
		const repo = createMockRepo(events);

		const collector = new NewsCollector({ fetchNews, repository: repo });
		await collector.collectPendingEvents();

		expect(repo.markCollected).toHaveBeenCalledTimes(2);
	});

	test("does not mark as collected when fetch fails", async () => {
		const event = makePendingEvent();
		const fetchNews = mock(() => Promise.reject(new Error("API down")));
		const repo = createMockRepo([event]);

		const collector = new NewsCollector({ fetchNews, repository: repo });
		await collector.collectPendingEvents();

		expect(repo.markCollected).toHaveBeenCalledTimes(0);
	});

	test("no pending events → no-op", async () => {
		const fetchNews = mock(() => Promise.resolve([]));
		const repo = createMockRepo([]);

		const collector = new NewsCollector({ fetchNews, repository: repo });
		await collector.collectPendingEvents();

		expect(fetchNews).toHaveBeenCalledTimes(0);
		expect(repo.upsertNews).toHaveBeenCalledTimes(0);
	});

	test("event with no matching news still gets marked as collected", async () => {
		const event = makePendingEvent({
			scheduledAt: new Date("2026-03-22T18:00:00Z"),
		});
		const outsideNews = makeNewsItem({
			publishedAt: new Date("2026-03-22T20:00:00Z"),
		});
		const fetchNews = mock(() => Promise.resolve([outsideNews]));
		const repo = createMockRepo([event]);

		const collector = new NewsCollector({ fetchNews, repository: repo });
		await collector.collectPendingEvents();

		expect(repo.upsertNews).toHaveBeenCalledTimes(0);
		expect(repo.markCollected).toHaveBeenCalledTimes(1);
	});
});

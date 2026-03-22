import { describe, expect, mock, test } from "bun:test";
import { SavetickerClient } from "../saveticker-client.js";

function mockFetch(response: unknown, status = 200) {
	return mock(() =>
		Promise.resolve(new Response(JSON.stringify(response), { status })),
	);
}

function failFetch(error = new Error("Network error")) {
	return mock(() => Promise.reject(error));
}

const BASE_URL = "https://api.saveticker.com";

describe("SavetickerClient", () => {
	describe("fetchCalendarEvents", () => {
		test("parses calendar events with impact from titles", async () => {
			const apiResponse = [
				{
					id: "evt-1",
					title: "★★★ FOMC Rate Decision",
					date: "2026-03-22T18:00:00Z",
				},
				{
					id: "evt-2",
					title: "★★ CPI m/m",
					date: "2026-03-23T12:30:00Z",
				},
				{
					id: "evt-3",
					title: "★ Building Permits",
					date: "2026-03-24T12:30:00Z",
				},
			];
			const fetch = mockFetch(apiResponse);
			const client = new SavetickerClient({ baseUrl: BASE_URL, fetch });

			const events = await client.fetchCalendarEvents(
				new Date("2026-03-22"),
				new Date("2026-03-28"),
			);

			expect(events).toHaveLength(3);
			expect(events[0].externalId).toBe("evt-1");
			expect(events[0].eventName).toBe("FOMC Rate Decision");
			expect(events[0].impact).toBe("HIGH");
			expect(events[0].scheduledAt).toEqual(new Date("2026-03-22T18:00:00Z"));
			expect(events[1].impact).toBe("MEDIUM");
			expect(events[2].impact).toBe("LOW");
		});

		test("calls correct URL with date params", async () => {
			const fetch = mockFetch([]);
			const client = new SavetickerClient({ baseUrl: BASE_URL, fetch });

			await client.fetchCalendarEvents(
				new Date("2026-03-22"),
				new Date("2026-03-28"),
			);

			expect(fetch).toHaveBeenCalledTimes(1);
			const url = (fetch.mock.calls[0] as [string])[0];
			expect(url).toContain("/api/calendar");
			expect(url).toContain("start=2026-03-22");
			expect(url).toContain("end=2026-03-28");
		});

		test("returns empty array on HTTP error", async () => {
			const fetch = mockFetch({ error: "Server error" }, 500);
			const client = new SavetickerClient({ baseUrl: BASE_URL, fetch });

			const events = await client.fetchCalendarEvents(
				new Date("2026-03-22"),
				new Date("2026-03-28"),
			);

			expect(events).toEqual([]);
		});

		test("retries on failure then returns empty array", async () => {
			const fetch = failFetch();
			const client = new SavetickerClient({
				baseUrl: BASE_URL,
				fetch,
				retryDelayMs: 1,
			});

			const events = await client.fetchCalendarEvents(
				new Date("2026-03-22"),
				new Date("2026-03-28"),
			);

			expect(events).toEqual([]);
			expect(fetch).toHaveBeenCalledTimes(3);
		});

		test("succeeds on second retry", async () => {
			let callCount = 0;
			const fetch = mock(() => {
				callCount++;
				if (callCount < 2) {
					return Promise.reject(new Error("Temporary failure"));
				}
				return Promise.resolve(
					new Response(
						JSON.stringify([
							{ id: "evt-1", title: "★★ CPI", date: "2026-03-22T12:00:00Z" },
						]),
					),
				);
			});
			const client = new SavetickerClient({
				baseUrl: BASE_URL,
				fetch,
				retryDelayMs: 1,
			});

			const events = await client.fetchCalendarEvents(
				new Date("2026-03-22"),
				new Date("2026-03-28"),
			);

			expect(events).toHaveLength(1);
			expect(events[0].impact).toBe("MEDIUM");
			expect(fetch).toHaveBeenCalledTimes(2);
		});
	});

	describe("fetchRecentNews", () => {
		test("parses news items", async () => {
			const apiResponse = [
				{
					id: "news-1",
					title: "Fed holds rates steady",
					source_name: "Reuters",
					created_at: "2026-03-22T18:30:00Z",
					tag_names: ["fed", "rates"],
				},
				{
					id: "news-2",
					title: "CPI beats expectations",
					source_name: "Bloomberg",
					created_at: "2026-03-22T12:35:00Z",
					tag_names: ["cpi", "inflation"],
				},
			];
			const fetch = mockFetch(apiResponse);
			const client = new SavetickerClient({ baseUrl: BASE_URL, fetch });

			const news = await client.fetchRecentNews(50);

			expect(news).toHaveLength(2);
			expect(news[0].externalId).toBe("news-1");
			expect(news[0].headline).toBe("Fed holds rates steady");
			expect(news[0].source).toBe("Reuters");
			expect(news[0].publishedAt).toEqual(new Date("2026-03-22T18:30:00Z"));
			expect(news[0].tags).toEqual(["fed", "rates"]);
		});

		test("calls correct URL with params", async () => {
			const fetch = mockFetch([]);
			const client = new SavetickerClient({ baseUrl: BASE_URL, fetch });

			await client.fetchRecentNews(50, new Date("2026-03-22T10:00:00Z"));

			const url = (fetch.mock.calls[0] as [string])[0];
			expect(url).toContain("/api/news");
			expect(url).toContain("page_size=50");
			expect(url).toContain("after=2026-03-22");
		});

		test("returns empty array on failure", async () => {
			const fetch = failFetch();
			const client = new SavetickerClient({
				baseUrl: BASE_URL,
				fetch,
				retryDelayMs: 1,
			});

			const news = await client.fetchRecentNews(50);

			expect(news).toEqual([]);
			expect(fetch).toHaveBeenCalledTimes(3);
		});

		test("handles empty tags gracefully", async () => {
			const apiResponse = [
				{
					id: "news-1",
					title: "Breaking news",
					source_name: "AP",
					created_at: "2026-03-22T18:30:00Z",
				},
			];
			const fetch = mockFetch(apiResponse);
			const client = new SavetickerClient({ baseUrl: BASE_URL, fetch });

			const news = await client.fetchRecentNews(10);

			expect(news[0].tags).toEqual([]);
		});
	});
});

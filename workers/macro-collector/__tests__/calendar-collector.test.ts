import { describe, expect, mock, test } from "bun:test";
import type { CreateEconomicEventInput } from "../../../../packages/core/macro/types.js";
import { CalendarCollector, type CalendarEventRepository } from "../src/calendar-collector.js";

function makeEvent(overrides: Partial<CreateEconomicEventInput> = {}): CreateEconomicEventInput {
	return {
		externalId: "evt-1",
		title: "★★★ FOMC Rate Decision",
		eventName: "FOMC Rate Decision",
		impact: "HIGH",
		scheduledAt: new Date("2026-03-22T18:00:00Z"),
		...overrides,
	};
}

function createMockRepo(): CalendarEventRepository {
	const stored: CreateEconomicEventInput[] = [];
	return {
		upsertByExternalId: mock(async (input: CreateEconomicEventInput) => {
			const idx = stored.findIndex((e) => e.externalId === input.externalId);
			if (idx >= 0) {
				stored[idx] = input;
			} else {
				stored.push(input);
			}
		}),
		getStored: () => stored,
	} as CalendarEventRepository & { getStored: () => CreateEconomicEventInput[] };
}

describe("CalendarCollector", () => {
	test("collects HIGH and MEDIUM events, skips LOW", async () => {
		const events = [
			makeEvent({ externalId: "e1", impact: "HIGH" }),
			makeEvent({ externalId: "e2", impact: "MEDIUM", title: "★★ CPI" }),
			makeEvent({
				externalId: "e3",
				impact: "LOW",
				title: "★ Building Permits",
			}),
		];
		const fetchEvents = mock(() => Promise.resolve(events));
		const repo = createMockRepo();
		const collector = new CalendarCollector({ fetchEvents, repository: repo });

		await collector.collect();

		expect(repo.upsertByExternalId).toHaveBeenCalledTimes(2);
	});

	test("passes correct date range (today to today+7)", async () => {
		const fetchEvents = mock(() => Promise.resolve([]));
		const repo = createMockRepo();
		const collector = new CalendarCollector({ fetchEvents, repository: repo });

		const now = new Date();
		await collector.collect();

		expect(fetchEvents).toHaveBeenCalledTimes(1);
		const [start, end] = fetchEvents.mock.calls[0] as [Date, Date];
		expect(start.toISOString().slice(0, 10)).toBe(now.toISOString().slice(0, 10));
		const expectedEnd = new Date(now);
		expectedEnd.setDate(expectedEnd.getDate() + 7);
		expect(end.toISOString().slice(0, 10)).toBe(expectedEnd.toISOString().slice(0, 10));
	});

	test("upserts are idempotent by external_id", async () => {
		const event = makeEvent({ externalId: "e1" });
		const fetchEvents = mock(() => Promise.resolve([event]));
		const repo = createMockRepo() as CalendarEventRepository & {
			getStored: () => CreateEconomicEventInput[];
		};
		const collector = new CalendarCollector({ fetchEvents, repository: repo });

		await collector.collect();
		await collector.collect();

		expect(repo.upsertByExternalId).toHaveBeenCalledTimes(2);
		expect(repo.getStored()).toHaveLength(1);
	});

	test("handles empty response gracefully", async () => {
		const fetchEvents = mock(() => Promise.resolve([]));
		const repo = createMockRepo();
		const collector = new CalendarCollector({ fetchEvents, repository: repo });

		await collector.collect();

		expect(repo.upsertByExternalId).toHaveBeenCalledTimes(0);
	});

	test("handles fetch failure gracefully", async () => {
		const fetchEvents = mock(() => Promise.reject(new Error("Client failure")));
		const repo = createMockRepo();
		const collector = new CalendarCollector({ fetchEvents, repository: repo });

		await collector.collect();

		expect(repo.upsertByExternalId).toHaveBeenCalledTimes(0);
	});
});

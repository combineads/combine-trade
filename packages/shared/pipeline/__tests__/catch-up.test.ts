import { describe, expect, test } from "bun:test";
import { type CatchUpDeps, runCatchUp } from "../catch-up.js";

interface MockEvent {
	id: string;
	payload: string;
}

function makeDeps(
	events: MockEvent[] = [],
	overrides: Partial<CatchUpDeps<MockEvent>> = {},
): CatchUpDeps<MockEvent> & { processed: string[]; marked: string[] } {
	const processed: string[] = [];
	const marked: string[] = [];
	return {
		processed,
		marked,
		findUnprocessedEvents: overrides.findUnprocessedEvents ?? (async () => [...events]),
		processEvent:
			overrides.processEvent ??
			(async (evt) => {
				processed.push(evt.id);
			}),
		markProcessed:
			overrides.markProcessed ??
			(async (evt) => {
				marked.push(evt.id);
			}),
		getEventId: overrides.getEventId ?? ((evt) => evt.id),
	};
}

describe("runCatchUp", () => {
	test("processes all unprocessed events", async () => {
		const events = [
			{ id: "e1", payload: "a" },
			{ id: "e2", payload: "b" },
		];
		const deps = makeDeps(events);

		const result = await runCatchUp(deps);

		expect(result.processed).toBe(2);
		expect(result.failed).toBe(0);
		expect(deps.processed).toEqual(["e1", "e2"]);
		expect(deps.marked).toEqual(["e1", "e2"]);
	});

	test("no unprocessed events → 0 processed", async () => {
		const deps = makeDeps([]);
		const result = await runCatchUp(deps);
		expect(result.processed).toBe(0);
	});

	test("error in one event does not block others", async () => {
		const events = [
			{ id: "e1", payload: "a" },
			{ id: "e2", payload: "b" },
			{ id: "e3", payload: "c" },
		];
		let _callCount = 0;
		const deps = makeDeps(events, {
			processEvent: async (evt) => {
				_callCount++;
				if (evt.id === "e2") throw new Error("fail");
				deps.processed.push(evt.id);
			},
		});

		const result = await runCatchUp(deps);

		expect(result.processed).toBe(2);
		expect(result.failed).toBe(1);
		expect(deps.processed).toEqual(["e1", "e3"]);
		// markProcessed only for successful events
		expect(deps.marked).toEqual(["e1", "e3"]);
	});

	test("markProcessed only called for successful events", async () => {
		const events = [{ id: "e1", payload: "a" }];
		const deps = makeDeps(events, {
			processEvent: async () => {
				throw new Error("fail");
			},
		});

		await runCatchUp(deps);

		expect(deps.marked).toEqual([]);
	});

	test("runCatchUp itself never throws", async () => {
		const deps = makeDeps([], {
			findUnprocessedEvents: async () => {
				throw new Error("DB down");
			},
		});

		const result = await runCatchUp(deps);
		expect(result.processed).toBe(0);
		expect(result.error).toBeDefined();
	});
});

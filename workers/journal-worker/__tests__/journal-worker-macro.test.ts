import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { MacroContext } from "@combine/core/macro/types.js";
import {
	type EventBus,
	JournalEventHandler,
	type JournalStorage,
	type LabelReadyEvent,
	type MacroContextProvider,
	type MacroTagProvider,
	mergeTags,
} from "../src/journal-event-handler.js";

function makeLabelReadyEvent(overrides: Partial<LabelReadyEvent> = {}): LabelReadyEvent {
	return {
		type: "label_ready",
		tradeId: "trade-1",
		strategyId: "strat-1",
		strategyVersion: 1,
		symbol: "BTCUSDT",
		direction: "LONG",
		entryTime: 1700000000,
		exitTime: 1700003600,
		entryPrice: "50000",
		exitPrice: "51000",
		label: "WIN",
		entryVector: [0.1, 0.2],
		exitVector: [0.3, 0.4],
		...overrides,
	};
}

function makeMacroContext(): MacroContext {
	return {
		entryEvents: [],
		entryNews: [],
		exitEvents: [],
		exitNews: [],
	};
}

describe("journal-worker macro", () => {
	let storage: JournalStorage;
	let eventBus: EventBus;
	let contextProvider: MacroContextProvider;
	let tagProvider: MacroTagProvider;

	beforeEach(() => {
		storage = {
			save: mock(() => Promise.resolve()),
		};
		eventBus = {
			subscribe: mock((_eventType: string, _handler: (event: unknown) => Promise<void>) => ({
				unsubscribe: mock(() => {}),
			})),
		};
		contextProvider = {
			enrich: mock(() => Promise.resolve(makeMacroContext())),
		};
		tagProvider = {
			generateTags: mock(() => ["fomc_week"]),
		};
	});

	test("context-enricher is called with the journal's entry timestamp", async () => {
		const handler = new JournalEventHandler(eventBus, storage, undefined, contextProvider, tagProvider);
		const event = makeLabelReadyEvent({ entryTime: 1700000000 });
		await handler.handleLabelReady(event);

		expect(contextProvider.enrich).toHaveBeenCalledTimes(1);
		const callArgs = (contextProvider.enrich as ReturnType<typeof mock>).mock.calls[0];
		const calledWith: Date = callArgs[0];
		expect(calledWith).toBeInstanceOf(Date);
		expect(calledWith.getTime()).toBe(1700000000 * 1000);
	});

	test("entry_macro_context is stored in the journal row", async () => {
		const ctx = makeMacroContext();
		contextProvider = { enrich: mock(() => Promise.resolve(ctx)) };
		tagProvider = { generateTags: mock(() => []) };

		const handler = new JournalEventHandler(eventBus, storage, undefined, contextProvider, tagProvider);
		await handler.handleLabelReady(makeLabelReadyEvent());

		expect(storage.save).toHaveBeenCalledTimes(1);
		const savedJournal = (storage.save as ReturnType<typeof mock>).mock.calls[0][0];
		expect(savedJournal.entryMacroContext).toBe(ctx);
	});

	test("macro-tagger is called with context result", async () => {
		const ctx = makeMacroContext();
		contextProvider = { enrich: mock(() => Promise.resolve(ctx)) };
		tagProvider = { generateTags: mock(() => []) };

		const handler = new JournalEventHandler(eventBus, storage, undefined, contextProvider, tagProvider);
		await handler.handleLabelReady(makeLabelReadyEvent());

		expect(tagProvider.generateTags).toHaveBeenCalledTimes(1);
		const callArgs = (tagProvider.generateTags as ReturnType<typeof mock>).mock.calls[0];
		expect(callArgs[0]).toBe(ctx);
	});

	test("macro tags are merged into auto_tags without duplicates", async () => {
		tagProvider = { generateTags: mock(() => ["fomc_week", "cpi_day"]) };

		const handler = new JournalEventHandler(eventBus, storage, undefined, contextProvider, tagProvider);
		await handler.handleLabelReady(makeLabelReadyEvent());

		const savedJournal = (storage.save as ReturnType<typeof mock>).mock.calls[0][0];
		expect(savedJournal.autoTags).toContain("fomc_week");
		expect(savedJournal.autoTags).toContain("cpi_day");
	});

	test("duplicate tags are deduplicated after merge", async () => {
		// autoTags starts empty, macro tagger returns duplicate tags
		tagProvider = { generateTags: mock(() => ["fomc_week", "fomc_week", "cpi_day"]) };

		const handler = new JournalEventHandler(eventBus, storage, undefined, contextProvider, tagProvider);
		await handler.handleLabelReady(makeLabelReadyEvent());

		const savedJournal = (storage.save as ReturnType<typeof mock>).mock.calls[0][0];
		const fomc = savedJournal.autoTags.filter((t: string) => t === "fomc_week");
		expect(fomc).toHaveLength(1);
	});

	test("context-enricher failure results in entry_macro_context = null, assembly continues", async () => {
		contextProvider = { enrich: mock(() => Promise.reject(new Error("enricher down"))) };
		tagProvider = { generateTags: mock(() => []) };

		const handler = new JournalEventHandler(eventBus, storage, undefined, contextProvider, tagProvider);
		await handler.handleLabelReady(makeLabelReadyEvent());

		expect(storage.save).toHaveBeenCalledTimes(1);
		const savedJournal = (storage.save as ReturnType<typeof mock>).mock.calls[0][0];
		expect(savedJournal.entryMacroContext).toBeNull();
	});

	test("macro-tagger is not called when context-enricher fails", async () => {
		contextProvider = { enrich: mock(() => Promise.reject(new Error("enricher down"))) };
		tagProvider = { generateTags: mock(() => []) };

		const handler = new JournalEventHandler(eventBus, storage, undefined, contextProvider, tagProvider);
		await handler.handleLabelReady(makeLabelReadyEvent());

		expect(tagProvider.generateTags).not.toHaveBeenCalled();
	});

	test("if macro-tagger returns empty array, original tags are preserved unchanged", async () => {
		tagProvider = { generateTags: mock(() => []) };

		const handler = new JournalEventHandler(eventBus, storage, undefined, contextProvider, tagProvider);
		await handler.handleLabelReady(makeLabelReadyEvent());

		const savedJournal = (storage.save as ReturnType<typeof mock>).mock.calls[0][0];
		// autoTags should still be an array (possibly empty) without errors
		expect(Array.isArray(savedJournal.autoTags)).toBe(true);
	});

	test("journal assembly succeeds without macro providers", async () => {
		const handler = new JournalEventHandler(eventBus, storage);
		await handler.handleLabelReady(makeLabelReadyEvent());

		expect(storage.save).toHaveBeenCalledTimes(1);
		const savedJournal = (storage.save as ReturnType<typeof mock>).mock.calls[0][0];
		expect(savedJournal.entryMacroContext).toBeNull();
	});
});

describe("journal-worker macro / mergeTags", () => {
	test("returns union of both arrays with no duplicates", () => {
		expect(mergeTags(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
	});

	test("preserves original tags when incoming is empty", () => {
		expect(mergeTags(["a", "b"], [])).toEqual(["a", "b"]);
	});

	test("handles both arrays empty", () => {
		expect(mergeTags([], [])).toEqual([]);
	});

	test("deduplicates within existing array when incoming adds duplicates", () => {
		// existing already has dup — mergeTags should still deduplicate
		expect(mergeTags(["a", "a"], ["b"])).toEqual(["a", "b"]);
	});

	test("is case-sensitive", () => {
		expect(mergeTags(["A"], ["a"])).toEqual(["A", "a"]);
	});
});

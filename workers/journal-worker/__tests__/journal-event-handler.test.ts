import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	type EventBus,
	JournalEventHandler,
	type JournalStorage,
	type LabelReadyEvent,
} from "../src/journal-event-handler.js";

function makeLabelReadyEvent(): LabelReadyEvent {
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
	};
}

describe("JournalEventHandler", () => {
	let storage: JournalStorage;
	let eventBus: EventBus;

	beforeEach(() => {
		storage = {
			save: mock(() => Promise.resolve()),
		};
		eventBus = {
			subscribe: mock((_eventType: string, _handler: (event: unknown) => Promise<void>) => ({
				unsubscribe: mock(() => {}),
			})),
		};
	});

	test("handleLabelReady assembles journal and saves to storage", async () => {
		const handler = new JournalEventHandler(eventBus, storage);
		await handler.handleLabelReady(makeLabelReadyEvent());

		expect(storage.save).toHaveBeenCalledTimes(1);
		const savedJournal = (storage.save as ReturnType<typeof mock>).mock.calls[0][0];
		expect(savedJournal.symbol).toBe("BTCUSDT");
		expect(savedJournal.direction).toBe("LONG");
		expect(savedJournal.resultType).toBe("WIN");
	});

	test("handleLabelReady applies auto-tags to journal before saving", async () => {
		const handler = new JournalEventHandler(eventBus, storage);
		await handler.handleLabelReady(makeLabelReadyEvent());

		const savedJournal = (storage.save as ReturnType<typeof mock>).mock.calls[0][0];
		expect(Array.isArray(savedJournal.autoTags)).toBe(true);
	});

	test("handleLabelReady catches storage error without throwing", async () => {
		storage.save = mock(() => Promise.reject(new Error("DB down")));
		const handler = new JournalEventHandler(eventBus, storage);

		// Should not throw
		await handler.handleLabelReady(makeLabelReadyEvent());
		expect(storage.save).toHaveBeenCalledTimes(1);
	});

	test("start subscribes to label_ready and returns subscription", () => {
		const handler = new JournalEventHandler(eventBus, storage);
		const sub = handler.start();

		expect(eventBus.subscribe).toHaveBeenCalledTimes(1);
		const callArgs = (eventBus.subscribe as ReturnType<typeof mock>).mock.calls[0];
		expect(callArgs[0]).toBe("label_ready");
		expect(typeof sub.unsubscribe).toBe("function");
	});

	test("start handler routes events to handleLabelReady", async () => {
		const handler = new JournalEventHandler(eventBus, storage);
		handler.start();

		// Extract the callback registered with eventBus.subscribe
		const registeredHandler = (eventBus.subscribe as ReturnType<typeof mock>).mock.calls[0][1];
		await registeredHandler(makeLabelReadyEvent());

		expect(storage.save).toHaveBeenCalledTimes(1);
	});
});

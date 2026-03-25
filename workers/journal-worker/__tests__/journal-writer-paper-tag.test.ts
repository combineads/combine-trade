import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	type EventBus,
	JournalEventHandler,
	type JournalStorage,
	type LabelReadyEvent,
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

describe("JournalEventHandler paper-tag", () => {
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

	test("paper mode → journal saved with is_paper = true", async () => {
		const handler = new JournalEventHandler(eventBus, storage, async () => "paper");
		await handler.handleLabelReady(makeLabelReadyEvent());

		const savedJournal = (storage.save as ReturnType<typeof mock>).mock.calls[0][0];
		expect(savedJournal.isPaper).toBe(true);
	});

	test("live mode → journal saved with is_paper = false", async () => {
		const handler = new JournalEventHandler(eventBus, storage, async () => "live");
		await handler.handleLabelReady(makeLabelReadyEvent());

		const savedJournal = (storage.save as ReturnType<typeof mock>).mock.calls[0][0];
		expect(savedJournal.isPaper).toBe(false);
	});

	test("alert mode → journal saved with is_paper = false", async () => {
		const handler = new JournalEventHandler(eventBus, storage, async () => "alert");
		await handler.handleLabelReady(makeLabelReadyEvent());

		const savedJournal = (storage.save as ReturnType<typeof mock>).mock.calls[0][0];
		expect(savedJournal.isPaper).toBe(false);
	});

	test("no mode loader → journal saved with is_paper = false (defaults to non-paper)", async () => {
		const handler = new JournalEventHandler(eventBus, storage);
		await handler.handleLabelReady(makeLabelReadyEvent());

		const savedJournal = (storage.save as ReturnType<typeof mock>).mock.calls[0][0];
		expect(savedJournal.isPaper).toBe(false);
	});
});

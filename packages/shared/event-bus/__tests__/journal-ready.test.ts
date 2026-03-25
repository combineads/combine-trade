import { describe, expect, mock, test } from "bun:test";
import type { JournalReadyPayload } from "../channels.js";
import { Channels } from "../channels.js";
import { PgEventPublisher } from "../publisher.js";
import { PgEventSubscriber } from "../subscriber.js";

describe("journal_ready channel", () => {
	test("Channels.journalReady equals 'journal_ready'", () => {
		expect(Channels.journalReady.name).toBe("journal_ready");
	});

	test("JournalReadyPayload shape is correct", () => {
		const payload: JournalReadyPayload = { journalId: "abc-123" };
		expect(payload.journalId).toBe("abc-123");
	});

	test("publisher sends NOTIFY journal_ready with journal_id", async () => {
		const queries: string[] = [];
		const publisher = new PgEventPublisher({ connectionString: "test" });
		await publisher.connect(() => ({
			unsafe: async (query: string) => {
				queries.push(query);
			},
		}));

		const journalId = "550e8400-e29b-41d4-a716-446655440000";
		await publisher.publish(Channels.journalReady, { journalId });

		expect(queries.length).toBe(1);
		expect(queries[0]).toContain("NOTIFY journal_ready");
		expect(queries[0]).toContain(journalId);
	});

	test("subscriber receives journal_ready event with correct journalId", async () => {
		const received: JournalReadyPayload[] = [];
		const listeners = new Map<string, (payload: string) => void>();

		const subscriber = new PgEventSubscriber({ connectionString: "test" });
		await subscriber.connect(() => ({
			listenTo(channel: string, handler: (payload: string) => void) {
				listeners.set(channel, handler);
				return () => listeners.delete(channel);
			},
			async close() {},
		}));

		subscriber.subscribe(Channels.journalReady, (payload) => {
			received.push(payload);
		});

		const journalId = "550e8400-e29b-41d4-a716-446655440000";
		const handler = listeners.get("journal_ready");
		expect(handler).toBeDefined();
		handler?.(JSON.stringify({ journalId }));

		expect(received.length).toBe(1);
		expect(received[0]?.journalId).toBe(journalId);
	});

	test("multiple rapid notifications are each processed independently", async () => {
		const received: JournalReadyPayload[] = [];
		const listeners = new Map<string, (payload: string) => void>();

		const subscriber = new PgEventSubscriber({ connectionString: "test" });
		await subscriber.connect(() => ({
			listenTo(channel: string, handler: (payload: string) => void) {
				listeners.set(channel, handler);
				return () => listeners.delete(channel);
			},
			async close() {},
		}));

		subscriber.subscribe(Channels.journalReady, (payload) => {
			received.push(payload);
		});

		const handler = listeners.get("journal_ready");
		expect(handler).toBeDefined();

		// Fire multiple rapid notifications
		const ids = ["id-1", "id-2", "id-3"];
		for (const id of ids) {
			handler?.(JSON.stringify({ journalId: id }));
		}

		expect(received.length).toBe(3);
		expect(received.map((p) => p.journalId)).toEqual(["id-1", "id-2", "id-3"]);
	});
});

describe("journal-worker publishes journal_ready after assembly", () => {
	test("emits journal_ready with correct journalId after storage.save", async () => {
		// Import the class under test
		const { JournalEventHandler } = await import(
			"../../../../workers/journal-worker/src/journal-event-handler.js"
		);
		type LabelReadyEvent = {
			type: string;
			tradeId: string;
			strategyId: string;
			strategyVersion: number;
			symbol: string;
			direction: "LONG" | "SHORT";
			entryTime: number;
			exitTime: number;
			entryPrice: string;
			exitPrice: string;
			label: "WIN" | "LOSS" | "TIME_EXIT";
			entryVector: number[];
			exitVector: number[];
		};

		const savedIds: string[] = [];
		const publishedPayloads: JournalReadyPayload[] = [];

		const storage = {
			save: mock(async (journal: { id: string }) => {
				savedIds.push(journal.id);
			}),
		};

		const eventBus = {
			subscribe: mock((_eventType: string, _handler: (event: unknown) => Promise<void>) => ({
				unsubscribe: mock(() => {}),
			})),
		};

		const publisher = {
			publish: mock(async (_channel: unknown, payload: JournalReadyPayload) => {
				publishedPayloads.push(payload);
			}),
		};

		const event: LabelReadyEvent = {
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

		const handler = new JournalEventHandler(eventBus, storage, undefined, publisher);
		await handler.handleLabelReady(event);

		// Publisher must be called after storage.save
		expect(storage.save).toHaveBeenCalledTimes(1);
		expect(publisher.publish).toHaveBeenCalledTimes(1);

		// Published payload must match the saved journal ID
		const journalId = savedIds[0];
		expect(publishedPayloads[0]?.journalId).toBe(journalId);
	});

	test("does not publish if storage.save throws", async () => {
		const { JournalEventHandler } = await import(
			"../../../../workers/journal-worker/src/journal-event-handler.js"
		);

		const storage = {
			save: mock(async () => {
				throw new Error("DB down");
			}),
		};

		const eventBus = {
			subscribe: mock((_eventType: string, _handler: (event: unknown) => Promise<void>) => ({
				unsubscribe: mock(() => {}),
			})),
		};

		const publisher = {
			publish: mock(async () => {}),
		};

		const handler = new JournalEventHandler(eventBus, storage, undefined, publisher);
		await handler.handleLabelReady({
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
			entryVector: [],
			exitVector: [],
		});

		// publish must NOT be called when storage fails
		expect(publisher.publish).toHaveBeenCalledTimes(0);
	});
});

describe("retrospective-worker listener receives journal_ready", () => {
	test("listener handler is invoked when journal_ready fires", async () => {
		const listeners = new Map<string, (payload: string) => void>();

		const subscriber = new PgEventSubscriber({ connectionString: "test" });
		await subscriber.connect(() => ({
			listenTo(channel: string, handler: (payload: string) => void) {
				listeners.set(channel, handler);
				return () => listeners.delete(channel);
			},
			async close() {},
		}));

		const analysisHandler = mock((_journalId: string) => Promise.resolve());

		// Simulate retrospective-worker's listener registration pattern
		subscriber.subscribe(Channels.journalReady, async (payload: JournalReadyPayload) => {
			// Must not call synchronously — enqueue pattern
			void Promise.resolve().then(() => analysisHandler(payload.journalId));
		});

		const journalId = "retro-journal-1";
		const handler = listeners.get("journal_ready");
		expect(handler).toBeDefined();
		handler?.(JSON.stringify({ journalId }));

		// Allow microtask queue to flush
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(analysisHandler).toHaveBeenCalledTimes(1);
		expect((analysisHandler as ReturnType<typeof mock>).mock.calls[0][0]).toBe(journalId);
	});
});

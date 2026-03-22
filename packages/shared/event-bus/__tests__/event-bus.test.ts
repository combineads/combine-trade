import { describe, expect, test } from "bun:test";
import { Channels } from "../channels.js";
import type { CandleClosedPayload } from "../channels.js";
import { PgEventPublisher } from "../publisher.js";
import { deserialize, serialize } from "../serialization.js";
import { PgEventSubscriber } from "../subscriber.js";
import { createChannel } from "../types.js";

describe("Event bus serialization", () => {
	test("serialize and deserialize round-trip", () => {
		const payload: CandleClosedPayload = {
			exchange: "binance",
			symbol: "BTCUSDT",
			timeframe: "1m",
			openTime: "2024-01-01T00:00:00.000Z",
		};
		const json = serialize(payload);
		const result = deserialize<CandleClosedPayload>(json);
		expect(result).toEqual(payload);
	});

	test("serialize rejects oversized payload", () => {
		const large = { data: "x".repeat(8000) };
		expect(() => serialize(large)).toThrow("exceeds PostgreSQL NOTIFY limit");
	});

	test("deserialize rejects invalid JSON", () => {
		expect(() => deserialize("not-json")).toThrow("Failed to deserialize");
	});

	test("all 5 channels are defined", () => {
		expect(Channels.candleClosed.name).toBe("candle_closed");
		expect(Channels.strategyEventCreated.name).toBe("strategy_event_created");
		expect(Channels.decisionCompleted.name).toBe("decision_completed");
		expect(Channels.labelReady.name).toBe("label_ready");
		expect(Channels.killSwitchActivated.name).toBe("kill_switch_activated");
	});

	test("createChannel produces typed channel", () => {
		const ch = createChannel<{ id: string }>("test_channel");
		expect(ch.name).toBe("test_channel");
	});
});

describe("Publisher", () => {
	test("publish throws if not connected", async () => {
		const publisher = new PgEventPublisher({ connectionString: "unused" });
		expect(
			publisher.publish(Channels.candleClosed, {
				exchange: "binance",
				symbol: "BTCUSDT",
				timeframe: "1m",
				openTime: "2024-01-01T00:00:00.000Z",
			}),
		).rejects.toThrow("not connected");
	});

	test("publish sends NOTIFY with serialized payload", async () => {
		const queries: string[] = [];
		const publisher = new PgEventPublisher({ connectionString: "test" });
		await publisher.connect(() => ({
			unsafe: async (query: string) => {
				queries.push(query);
			},
		}));

		await publisher.publish(Channels.candleClosed, {
			exchange: "binance",
			symbol: "BTCUSDT",
			timeframe: "1m",
			openTime: "2024-01-01T00:00:00.000Z",
		});

		expect(queries.length).toBe(1);
		expect(queries[0]).toContain("NOTIFY candle_closed");
		expect(queries[0]).toContain("binance");
	});
});

describe("Subscriber", () => {
	test("subscribe throws if not connected", () => {
		const subscriber = new PgEventSubscriber({ connectionString: "unused" });
		expect(() => subscriber.subscribe(Channels.candleClosed, () => {})).toThrow("not connected");
	});

	test("subscribe receives events via mock connection", async () => {
		const received: CandleClosedPayload[] = [];
		const listeners = new Map<string, (payload: string) => void>();

		const subscriber = new PgEventSubscriber({ connectionString: "test" });
		await subscriber.connect(() => ({
			listenTo(channel: string, handler: (payload: string) => void) {
				listeners.set(channel, handler);
				return () => listeners.delete(channel);
			},
			async close() {},
		}));

		subscriber.subscribe(Channels.candleClosed, (payload) => {
			received.push(payload);
		});

		// Simulate receiving a notification
		const handler = listeners.get("candle_closed");
		expect(handler).toBeDefined();
		handler!(
			JSON.stringify({
				exchange: "binance",
				symbol: "BTCUSDT",
				timeframe: "1m",
				openTime: "2024-01-01T00:00:00.000Z",
			}),
		);

		expect(received.length).toBe(1);
		expect(received[0]!.symbol).toBe("BTCUSDT");
	});

	test("unsubscribe removes handler", async () => {
		const listeners = new Map<string, (payload: string) => void>();

		const subscriber = new PgEventSubscriber({ connectionString: "test" });
		await subscriber.connect(() => ({
			listenTo(channel: string, handler: (payload: string) => void) {
				listeners.set(channel, handler);
				return () => listeners.delete(channel);
			},
			async close() {},
		}));

		const sub = subscriber.subscribe(Channels.candleClosed, () => {});
		expect(listeners.has("candle_closed")).toBe(true);

		sub.unsubscribe();
		expect(listeners.has("candle_closed")).toBe(false);
	});
});

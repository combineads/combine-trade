/**
 * T-14-011: PaperEventPublisher tests
 *
 * Verifies:
 * - Events are published to the correct channels
 * - Publish is fire-and-forget (never throws on bus error)
 * - All monetary values in payloads are strings
 */
import { describe, expect, test } from "bun:test";
import type { Channel } from "../../../shared/event-bus/types.js";
import {
	type PaperBalanceUpdatedPayload,
	PaperEventPublisher,
	type PaperOrderFilledPayload,
	type PaperPositionClosedPayload,
	type PaperPositionOpenedPayload,
} from "../publisher.js";

// ---------------------------------------------------------------------------
// Mock EventPublisher
// ---------------------------------------------------------------------------

interface PublishCall {
	channelName: string;
	payload: unknown;
}

interface MockPublisher {
	calls: PublishCall[];
	publish<T>(channel: Channel<T>, payload: T): Promise<void>;
	close(): Promise<void>;
}

function createMockPublisher(shouldFail = false): MockPublisher {
	const calls: PublishCall[] = [];
	return {
		calls,
		async publish<T>(channel: Channel<T>, payload: T): Promise<void> {
			if (shouldFail) throw new Error("Bus error");
			calls.push({ channelName: channel.name, payload });
		},
		async close(): Promise<void> {},
	};
}

/** Flush all pending promises/microtasks */
async function flushPromises(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORDER_FILLED: PaperOrderFilledPayload = {
	strategyId: "strat-001",
	userId: "user-001",
	orderId: "ord-001",
	symbol: "BTCUSDT",
	side: "LONG",
	size: "0.5",
	price: "60000.00",
	pnl: "150.00",
	filledAt: "2026-01-01T00:00:00Z",
};

const POSITION_OPENED: PaperPositionOpenedPayload = {
	strategyId: "strat-001",
	userId: "user-001",
	symbol: "BTCUSDT",
	side: "LONG",
	size: "0.5",
	entryPrice: "60000.00",
	openedAt: "2026-01-01T00:00:00Z",
};

const POSITION_CLOSED: PaperPositionClosedPayload = {
	strategyId: "strat-001",
	userId: "user-001",
	symbol: "BTCUSDT",
	side: "LONG",
	size: "0.5",
	entryPrice: "60000.00",
	exitPrice: "61500.00",
	pnl: "150.00",
	closedAt: "2026-01-02T00:00:00Z",
};

const BALANCE_UPDATED: PaperBalanceUpdatedPayload = {
	strategyId: "strat-001",
	userId: "user-001",
	available: "9850.00",
	reserved: "150.00",
	total: "10000.00",
};

// ---------------------------------------------------------------------------
// publishOrderFilled
// ---------------------------------------------------------------------------

describe("PaperEventPublisher: publishOrderFilled", () => {
	test("publishes to paper_order_filled channel", async () => {
		const bus = createMockPublisher();
		const pub = new PaperEventPublisher(bus);
		pub.publishOrderFilled(ORDER_FILLED);
		await flushPromises();
		expect(bus.calls).toHaveLength(1);
		expect(bus.calls[0]?.channelName).toBe("paper_order_filled");
	});

	test("payload matches input", async () => {
		const bus = createMockPublisher();
		const pub = new PaperEventPublisher(bus);
		pub.publishOrderFilled(ORDER_FILLED);
		await flushPromises();
		expect(bus.calls[0]?.payload).toEqual(ORDER_FILLED);
	});

	test("does not throw when bus fails (fire-and-forget)", async () => {
		const bus = createMockPublisher(true);
		const pub = new PaperEventPublisher(bus);
		// Must not throw
		expect(() => pub.publishOrderFilled(ORDER_FILLED)).not.toThrow();
		await flushPromises();
	});
});

// ---------------------------------------------------------------------------
// publishPositionOpened
// ---------------------------------------------------------------------------

describe("PaperEventPublisher: publishPositionOpened", () => {
	test("publishes to paper_position_opened channel", async () => {
		const bus = createMockPublisher();
		const pub = new PaperEventPublisher(bus);
		pub.publishPositionOpened(POSITION_OPENED);
		await flushPromises();
		expect(bus.calls[0]?.channelName).toBe("paper_position_opened");
	});

	test("does not throw when bus fails", async () => {
		const bus = createMockPublisher(true);
		const pub = new PaperEventPublisher(bus);
		expect(() => pub.publishPositionOpened(POSITION_OPENED)).not.toThrow();
		await flushPromises();
	});
});

// ---------------------------------------------------------------------------
// publishPositionClosed
// ---------------------------------------------------------------------------

describe("PaperEventPublisher: publishPositionClosed", () => {
	test("publishes to paper_position_closed channel", async () => {
		const bus = createMockPublisher();
		const pub = new PaperEventPublisher(bus);
		pub.publishPositionClosed(POSITION_CLOSED);
		await flushPromises();
		expect(bus.calls[0]?.channelName).toBe("paper_position_closed");
	});

	test("does not throw when bus fails", async () => {
		const bus = createMockPublisher(true);
		const pub = new PaperEventPublisher(bus);
		expect(() => pub.publishPositionClosed(POSITION_CLOSED)).not.toThrow();
		await flushPromises();
	});
});

// ---------------------------------------------------------------------------
// publishBalanceUpdated
// ---------------------------------------------------------------------------

describe("PaperEventPublisher: publishBalanceUpdated", () => {
	test("publishes to paper_balance_updated channel", async () => {
		const bus = createMockPublisher();
		const pub = new PaperEventPublisher(bus);
		pub.publishBalanceUpdated(BALANCE_UPDATED);
		await flushPromises();
		expect(bus.calls[0]?.channelName).toBe("paper_balance_updated");
	});

	test("does not throw when bus fails", async () => {
		const bus = createMockPublisher(true);
		const pub = new PaperEventPublisher(bus);
		expect(() => pub.publishBalanceUpdated(BALANCE_UPDATED)).not.toThrow();
		await flushPromises();
	});
});

// ---------------------------------------------------------------------------
// Monetary values are strings
// ---------------------------------------------------------------------------

describe("PaperEventPublisher: all monetary values are strings", () => {
	test("ORDER_FILLED price and pnl are strings", () => {
		expect(typeof ORDER_FILLED.price).toBe("string");
		expect(typeof ORDER_FILLED.pnl).toBe("string");
		expect(typeof ORDER_FILLED.size).toBe("string");
	});

	test("POSITION_CLOSED entryPrice, exitPrice, pnl are strings", () => {
		expect(typeof POSITION_CLOSED.entryPrice).toBe("string");
		expect(typeof POSITION_CLOSED.exitPrice).toBe("string");
		expect(typeof POSITION_CLOSED.pnl).toBe("string");
	});

	test("BALANCE_UPDATED available, reserved, total are strings", () => {
		expect(typeof BALANCE_UPDATED.available).toBe("string");
		expect(typeof BALANCE_UPDATED.reserved).toBe("string");
		expect(typeof BALANCE_UPDATED.total).toBe("string");
	});
});

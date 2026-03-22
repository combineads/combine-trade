import { describe, expect, test } from "bun:test";
import { buildOrder, generateClientOrderId, type OrderInput } from "../order-builder.js";

function makeInput(overrides: Partial<OrderInput> = {}): OrderInput {
	return {
		strategyId: "strat-1",
		eventId: "evt-1",
		symbol: "BTCUSDT",
		direction: "LONG",
		entryPrice: "50000",
		tpPct: 2,
		slPct: 1,
		quantity: "0.01",
		...overrides,
	};
}

describe("generateClientOrderId", () => {
	test("produces deterministic ID with given timestamp", () => {
		const id = generateClientOrderId("strat-1", "evt-1", 1704067200000);
		expect(id).toBe("ct-strat-1-evt-1-1704067200000");
	});

	test("different inputs produce different IDs", () => {
		const id1 = generateClientOrderId("strat-1", "evt-1", 1704067200000);
		const id2 = generateClientOrderId("strat-2", "evt-1", 1704067200000);
		expect(id1).not.toBe(id2);
	});
});

describe("buildOrder", () => {
	test("LONG order sets correct side and TP/SL prices", () => {
		const order = buildOrder(makeInput());
		expect(order.side).toBe("buy");
		expect(order.symbol).toBe("BTCUSDT");
		expect(order.type).toBe("market");
		// TP: 50000 * 1.02 = 51000
		expect(order.tpPrice).toBe("51000");
		// SL: 50000 * 0.99 = 49500
		expect(order.slPrice).toBe("49500");
	});

	test("SHORT order sets correct side and TP/SL prices", () => {
		const order = buildOrder(makeInput({ direction: "SHORT" }));
		expect(order.side).toBe("sell");
		// TP: 50000 * 0.98 = 49000
		expect(order.tpPrice).toBe("49000");
		// SL: 50000 * 1.01 = 50500
		expect(order.slPrice).toBe("50500");
	});

	test("includes clientOrderId", () => {
		const order = buildOrder(makeInput(), 1704067200000);
		expect(order.clientOrderId).toBe("ct-strat-1-evt-1-1704067200000");
	});

	test("notional validation: rejects order exceeding max notional", () => {
		// 50000 * 1 = 50000 > 1000 default cap
		expect(() => buildOrder(makeInput({ quantity: "1" }))).toThrow("notional");
	});

	test("notional validation: accepts order within cap", () => {
		// 50000 * 0.01 = 500 < 1000 default cap
		const order = buildOrder(makeInput({ quantity: "0.01" }));
		expect(order.quantity).toBe("0.01");
	});

	test("custom notional cap overrides default", () => {
		// 50000 * 1 = 50000, with custom cap of 100000 → accepted
		const order = buildOrder(makeInput({ quantity: "1" }), undefined, 100000);
		expect(order.quantity).toBe("1");
	});

	test("quantity preserved as string", () => {
		const order = buildOrder(makeInput({ quantity: "0.00123" }));
		expect(order.quantity).toBe("0.00123");
		expect(typeof order.quantity).toBe("string");
	});
});

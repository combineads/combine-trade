import { describe, expect, it } from "bun:test";
import enMessages from "../../../i18n/messages/en.json";
import koMessages from "../../../i18n/messages/ko.json";

describe("orders namespace — ko.json", () => {
	it("has orders namespace", () => {
		expect(koMessages).toHaveProperty("orders");
	});

	it("has pageTitle key", () => {
		expect(koMessages.orders.pageTitle).toBe("주문 내역");
	});

	it("has openOrders key", () => {
		expect(koMessages.orders.openOrders).toBe("미체결 주문");
	});

	it("has orderHistory key", () => {
		expect(koMessages.orders.orderHistory).toBe("체결 내역");
	});

	it("has noOrders key", () => {
		expect(koMessages.orders).toHaveProperty("noOrders");
	});

	it("has all column headers", () => {
		const cols = koMessages.orders.columns;
		expect(cols).toHaveProperty("symbol");
		expect(cols).toHaveProperty("side");
		expect(cols).toHaveProperty("type");
		expect(cols).toHaveProperty("status");
		expect(cols).toHaveProperty("quantity");
		expect(cols).toHaveProperty("price");
		expect(cols).toHaveProperty("filled");
		expect(cols).toHaveProperty("strategy");
		expect(cols).toHaveProperty("fee");
		expect(cols).toHaveProperty("date");
	});

	it("has order types", () => {
		const type = koMessages.orders.type;
		expect(type.market).toBe("시장가");
		expect(type.limit).toBe("지정가");
		expect(type.stopMarket).toBe("스탑 마켓");
		expect(type.stopLimit).toBe("스탑 리밋");
	});

	it("has order statuses", () => {
		const status = koMessages.orders.status;
		expect(status.submitted).toBe("대기");
		expect(status.filled).toBe("체결");
		expect(status.partiallyFilled).toBe("부분체결");
		expect(status.cancelled).toBe("취소");
		expect(status.rejected).toBe("거부");
	});

	it("has order actions", () => {
		const actions = koMessages.orders.actions;
		expect(actions).toHaveProperty("cancel");
		expect(actions).toHaveProperty("modify");
	});

	it("has position keys", () => {
		const position = koMessages.orders.position;
		expect(position).toHaveProperty("title");
		expect(position).toHaveProperty("avgEntryPrice");
		expect(position).toHaveProperty("currentPrice");
		expect(position).toHaveProperty("unrealizedPnl");
		expect(position).toHaveProperty("leverage");
	});

	it("LONG and SHORT stay in English", () => {
		expect(koMessages.orders.side.long).toBe("LONG");
		expect(koMessages.orders.side.short).toBe("SHORT");
	});
});

describe("orders namespace — en.json", () => {
	it("has orders namespace", () => {
		expect(enMessages).toHaveProperty("orders");
	});

	it("has pageTitle key", () => {
		expect(enMessages.orders.pageTitle).toBe("Orders");
	});

	it("has all column headers", () => {
		const cols = enMessages.orders.columns;
		expect(cols).toHaveProperty("symbol");
		expect(cols).toHaveProperty("side");
		expect(cols).toHaveProperty("type");
		expect(cols).toHaveProperty("status");
		expect(cols).toHaveProperty("quantity");
		expect(cols).toHaveProperty("price");
		expect(cols).toHaveProperty("filled");
		expect(cols).toHaveProperty("strategy");
		expect(cols).toHaveProperty("fee");
		expect(cols).toHaveProperty("date");
	});

	it("has order types", () => {
		const type = enMessages.orders.type;
		expect(type.market).toBe("Market");
		expect(type.limit).toBe("Limit");
		expect(type.stopMarket).toBe("Stop Market");
		expect(type.stopLimit).toBe("Stop Limit");
	});

	it("has order statuses", () => {
		const status = enMessages.orders.status;
		expect(status.submitted).toBe("Submitted");
		expect(status.filled).toBe("Filled");
		expect(status.partiallyFilled).toBe("Partially Filled");
		expect(status.cancelled).toBe("Cancelled");
		expect(status.rejected).toBe("Rejected");
	});

	it("LONG and SHORT stay in English", () => {
		expect(enMessages.orders.side.long).toBe("LONG");
		expect(enMessages.orders.side.short).toBe("SHORT");
	});
});

describe("orders namespace — ko/en consistency", () => {
	it("ko and en have matching orders top-level keys", () => {
		const koKeys = Object.keys(koMessages.orders).sort();
		const enKeys = Object.keys(enMessages.orders).sort();
		expect(koKeys).toEqual(enKeys);
	});

	it("ko and en have matching orders.columns keys", () => {
		const koKeys = Object.keys(koMessages.orders.columns).sort();
		const enKeys = Object.keys(enMessages.orders.columns).sort();
		expect(koKeys).toEqual(enKeys);
	});

	it("ko and en have matching orders.type keys", () => {
		const koKeys = Object.keys(koMessages.orders.type).sort();
		const enKeys = Object.keys(enMessages.orders.type).sort();
		expect(koKeys).toEqual(enKeys);
	});

	it("ko and en have matching orders.status keys", () => {
		const koKeys = Object.keys(koMessages.orders.status).sort();
		const enKeys = Object.keys(enMessages.orders.status).sort();
		expect(koKeys).toEqual(enKeys);
	});

	it("ko and en have matching orders.actions keys", () => {
		const koKeys = Object.keys(koMessages.orders.actions).sort();
		const enKeys = Object.keys(enMessages.orders.actions).sort();
		expect(koKeys).toEqual(enKeys);
	});

	it("ko and en have matching orders.position keys", () => {
		const koKeys = Object.keys(koMessages.orders.position).sort();
		const enKeys = Object.keys(enMessages.orders.position).sort();
		expect(koKeys).toEqual(enKeys);
	});
});

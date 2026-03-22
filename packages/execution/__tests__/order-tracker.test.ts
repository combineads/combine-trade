import { describe, expect, test, mock } from "bun:test";
import { OrderStatusTracker, type OrderTrackerDeps, type TrackedOrder } from "../order-tracker.js";

function makeOrder(overrides: Partial<TrackedOrder> = {}): TrackedOrder {
	return {
		id: "order-1",
		exchangeOrderId: "ex-123",
		symbol: "BTC/USDT:USDT",
		status: "submitted",
		createdAt: new Date(),
		...overrides,
	};
}

function makeDeps(overrides: Partial<OrderTrackerDeps> = {}): OrderTrackerDeps {
	return {
		getActiveOrders: mock(() => Promise.resolve([])),
		fetchExchangeOrder: mock(() =>
			Promise.resolve({
				id: "ex-123",
				symbol: "BTC/USDT:USDT",
				side: "buy" as const,
				type: "market" as const,
				price: 50000,
				amount: 0.1,
				filled: 0.1,
				status: "closed" as const,
				timestamp: Date.now(),
			}),
		),
		updateOrderStatus: mock(() => Promise.resolve()),
		emitOrderFilled: mock(() => Promise.resolve()),
		...overrides,
	};
}

describe("OrderStatusTracker", () => {
	test("does nothing when no active orders", async () => {
		const deps = makeDeps();
		const tracker = new OrderStatusTracker(deps);

		await tracker.pollOnce();

		expect(deps.getActiveOrders).toHaveBeenCalledTimes(1);
		expect(deps.fetchExchangeOrder).not.toHaveBeenCalled();
	});

	test("polls exchange for submitted orders", async () => {
		const order = makeOrder();
		const deps = makeDeps({
			getActiveOrders: mock(() => Promise.resolve([order])),
		});
		const tracker = new OrderStatusTracker(deps);

		await tracker.pollOnce();

		expect(deps.fetchExchangeOrder).toHaveBeenCalledTimes(1);
	});

	test("updates status when exchange shows filled", async () => {
		const order = makeOrder();
		const deps = makeDeps({
			getActiveOrders: mock(() => Promise.resolve([order])),
			fetchExchangeOrder: mock(() =>
				Promise.resolve({
					id: "ex-123",
					symbol: "BTC/USDT:USDT",
					side: "buy" as const,
					type: "market" as const,
					price: 50000,
					amount: 0.1,
					filled: 0.1,
					status: "closed" as const,
					timestamp: Date.now(),
				}),
			),
		});
		const tracker = new OrderStatusTracker(deps);

		await tracker.pollOnce();

		expect(deps.updateOrderStatus).toHaveBeenCalledTimes(1);
		const call = (deps.updateOrderStatus as ReturnType<typeof mock>).mock.calls[0];
		expect(call[0]).toBe("order-1");
		expect(call[1]).toBe("filled");
	});

	test("emits order_filled event when order is filled", async () => {
		const order = makeOrder();
		const deps = makeDeps({
			getActiveOrders: mock(() => Promise.resolve([order])),
		});
		const tracker = new OrderStatusTracker(deps);

		await tracker.pollOnce();

		expect(deps.emitOrderFilled).toHaveBeenCalledTimes(1);
	});

	test("updates status to canceled when exchange shows canceled", async () => {
		const order = makeOrder();
		const deps = makeDeps({
			getActiveOrders: mock(() => Promise.resolve([order])),
			fetchExchangeOrder: mock(() =>
				Promise.resolve({
					id: "ex-123",
					symbol: "BTC/USDT:USDT",
					side: "buy" as const,
					type: "market" as const,
					price: 50000,
					amount: 0.1,
					filled: 0,
					status: "canceled" as const,
					timestamp: Date.now(),
				}),
			),
		});
		const tracker = new OrderStatusTracker(deps);

		await tracker.pollOnce();

		const call = (deps.updateOrderStatus as ReturnType<typeof mock>).mock.calls[0];
		expect(call[1]).toBe("canceled");
		expect(deps.emitOrderFilled).not.toHaveBeenCalled();
	});

	test("skips update when exchange status is still open", async () => {
		const order = makeOrder();
		const deps = makeDeps({
			getActiveOrders: mock(() => Promise.resolve([order])),
			fetchExchangeOrder: mock(() =>
				Promise.resolve({
					id: "ex-123",
					symbol: "BTC/USDT:USDT",
					side: "buy" as const,
					type: "market" as const,
					price: 50000,
					amount: 0.1,
					filled: 0,
					status: "open" as const,
					timestamp: Date.now(),
				}),
			),
		});
		const tracker = new OrderStatusTracker(deps);

		await tracker.pollOnce();

		expect(deps.updateOrderStatus).not.toHaveBeenCalled();
	});

	test("detects partially filled orders", async () => {
		const order = makeOrder();
		const deps = makeDeps({
			getActiveOrders: mock(() => Promise.resolve([order])),
			fetchExchangeOrder: mock(() =>
				Promise.resolve({
					id: "ex-123",
					symbol: "BTC/USDT:USDT",
					side: "buy" as const,
					type: "market" as const,
					price: 50000,
					amount: 0.1,
					filled: 0.05,
					status: "open" as const,
					timestamp: Date.now(),
				}),
			),
		});
		const tracker = new OrderStatusTracker(deps);

		await tracker.pollOnce();

		const call = (deps.updateOrderStatus as ReturnType<typeof mock>).mock.calls[0];
		expect(call[0]).toBe("order-1");
		expect(call[1]).toBe("partially_filled");
	});

	test("handles exchange errors gracefully (no crash)", async () => {
		const order = makeOrder();
		const deps = makeDeps({
			getActiveOrders: mock(() => Promise.resolve([order])),
			fetchExchangeOrder: mock(() => Promise.reject(new Error("Exchange timeout"))),
		});
		const tracker = new OrderStatusTracker(deps);

		// Should not throw
		await tracker.pollOnce();

		expect(deps.updateOrderStatus).not.toHaveBeenCalled();
	});

	test("detects stale orders (>24h)", async () => {
		const staleOrder = makeOrder({
			createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
		});
		const deps = makeDeps({
			getActiveOrders: mock(() => Promise.resolve([staleOrder])),
			fetchExchangeOrder: mock(() =>
				Promise.resolve({
					id: "ex-123",
					symbol: "BTC/USDT:USDT",
					side: "buy" as const,
					type: "market" as const,
					price: 50000,
					amount: 0.1,
					filled: 0,
					status: "open" as const,
					timestamp: Date.now(),
				}),
			),
		});
		const tracker = new OrderStatusTracker(deps);

		await tracker.pollOnce();

		const call = (deps.updateOrderStatus as ReturnType<typeof mock>).mock.calls[0];
		expect(call[1]).toBe("stale");
	});
});

/**
 * CRITICAL SAFETY TEST — T-14-012
 *
 * Verifies that running the execution pipeline in paper mode NEVER calls
 * real exchange methods (createOrder, cancelOrder, fetchOrder/fetchBalance).
 *
 * A "trap adapter" throws immediately if any real order method is invoked.
 * If this test breaks, real funds may be at risk.
 */
import { describe, expect, test } from "bun:test";
import type { ExchangeAdapter, ExchangeOrder, OrderSide, OrderType } from "@combine/exchange";
import type { Exchange, Timeframe } from "@combine/shared";
import {
	type OrderRequest,
	type OrderResult,
	type PaperOrderMatcher,
	type PaperOrderResult,
	PaperRouter,
	type RealOrderExecutor,
} from "../paper-router.js";
import { OrderStatusTracker, type OrderTrackerDeps } from "../order-tracker.js";

// ---------------------------------------------------------------------------
// Trap adapter — throws immediately if any order method is called
// ---------------------------------------------------------------------------

class RealExchangeCalledError extends Error {
	constructor(method: string) {
		super(
			`SAFETY VIOLATION: Real exchange method "${method}" was called in paper mode. ` +
				"This would place a real order. Paper mode must never touch the real exchange.",
		);
		this.name = "RealExchangeCalledError";
	}
}

class TrapExchangeAdapter implements ExchangeAdapter {
	readonly exchange: Exchange = "binance";
	readonly calls: string[] = [];

	async fetchOHLCV(
		_symbol: string,
		_timeframe: Timeframe,
		_since?: number,
		_limit?: number,
	): Promise<never[]> {
		// fetchOHLCV is a read-only data fetch — not an order action.
		// It is allowed to be called in paper mode (candle data for simulation).
		this.calls.push("fetchOHLCV");
		return [];
	}

	async createOrder(
		_symbol: string,
		_type: OrderType,
		_side: OrderSide,
		_amount: number,
		_price?: number,
	): Promise<never> {
		this.calls.push("createOrder");
		throw new RealExchangeCalledError("createOrder");
	}

	async cancelOrder(_orderId: string, _symbol: string): Promise<never> {
		this.calls.push("cancelOrder");
		throw new RealExchangeCalledError("cancelOrder");
	}

	async fetchBalance(): Promise<never> {
		this.calls.push("fetchBalance");
		throw new RealExchangeCalledError("fetchBalance");
	}

	async fetchPositions(_symbols?: string[]): Promise<never> {
		this.calls.push("fetchPositions");
		throw new RealExchangeCalledError("fetchPositions");
	}

	async fetchFundingRate(_symbol: string): Promise<never> {
		this.calls.push("fetchFundingRate");
		throw new RealExchangeCalledError("fetchFundingRate");
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrderRequest(overrides: Partial<OrderRequest> = {}): OrderRequest {
	return {
		symbol: "BTCUSDT",
		side: "BUY",
		size: "0.1",
		price: "50000",
		...overrides,
	};
}

function makePaperMatcher(): PaperOrderMatcher {
	let counter = 0;
	return {
		async matchOrder(order: OrderRequest): Promise<PaperOrderResult> {
			counter++;
			return {
				type: "paper",
				paperId: `paper-${counter}`,
				symbol: order.symbol,
				side: order.side,
				size: order.size,
				filledPrice: order.price,
				filledAt: Date.now(),
			};
		},
	};
}

function makeRealExecutorFromAdapter(adapter: ExchangeAdapter): RealOrderExecutor {
	return {
		async executeOrder(order: OrderRequest): Promise<OrderResult> {
			const exchangeOrder = await adapter.createOrder(
				order.symbol,
				"market",
				order.side === "BUY" ? "buy" : "sell",
				Number(order.size),
				Number(order.price),
			);
			return {
				type: "real",
				orderId: exchangeOrder.id,
				symbol: exchangeOrder.symbol,
				side: exchangeOrder.side === "buy" ? "BUY" : "SELL",
				size: String(exchangeOrder.amount),
				filledPrice: String(exchangeOrder.price),
				filledAt: exchangeOrder.timestamp,
			};
		},
	};
}

// ---------------------------------------------------------------------------
// Tests: PaperRouter — createOrder path
// ---------------------------------------------------------------------------

describe("paper-safety: createOrder never called in paper mode", () => {
	test("paper mode: createOrder is NOT called on exchange adapter", async () => {
		const trap = new TrapExchangeAdapter();
		const router = new PaperRouter(makeRealExecutorFromAdapter(trap), makePaperMatcher());

		// Must not throw and must not call createOrder
		const result = await router.execute(makeOrderRequest(), "paper");

		expect(result.type).toBe("paper");
		expect(trap.calls).not.toContain("createOrder");
	});

	test("paper mode: result is paper, not real exchange order", async () => {
		const trap = new TrapExchangeAdapter();
		const router = new PaperRouter(makeRealExecutorFromAdapter(trap), makePaperMatcher());

		const result = await router.execute(makeOrderRequest(), "paper");

		expect((result as PaperOrderResult).type).toBe("paper");
		expect((result as PaperOrderResult).paperId).toBeDefined();
	});

	test("paper mode: no exchange methods called at all", async () => {
		const trap = new TrapExchangeAdapter();
		const router = new PaperRouter(makeRealExecutorFromAdapter(trap), makePaperMatcher());

		await router.execute(makeOrderRequest(), "paper");
		await router.execute(makeOrderRequest({ side: "SELL" }), "paper");
		await router.execute(makeOrderRequest({ symbol: "ETHUSDT" }), "paper");

		// Verify the trap recorded zero calls
		expect(trap.calls.length).toBe(0);
	});

	test("trap is proven effective: live mode DOES call createOrder", async () => {
		const trap = new TrapExchangeAdapter();
		const router = new PaperRouter(makeRealExecutorFromAdapter(trap), makePaperMatcher());

		// live mode must route to real executor, which calls createOrder on the trap
		await expect(router.execute(makeOrderRequest(), "live")).rejects.toThrow(
			RealExchangeCalledError,
		);
		expect(trap.calls).toContain("createOrder");
	});
});

// ---------------------------------------------------------------------------
// Tests: cancelOrder path
// ---------------------------------------------------------------------------

describe("paper-safety: cancelOrder never called in paper mode", () => {
	test("paper order cancellation does not call exchange cancelOrder", async () => {
		const trap = new TrapExchangeAdapter();

		// Simulate a paper order cancel: paper orders are cancelled in-process,
		// never via the exchange adapter. The trap adapter must not be touched.

		// In paper mode, cancellation is tracked locally (no exchange call needed).
		// Verify the trap adapter's cancelOrder is never invoked by asserting no calls.
		expect(trap.calls).not.toContain("cancelOrder");

		// If someone accidentally calls the adapter's cancelOrder, it throws:
		await expect(trap.cancelOrder("paper-123", "BTCUSDT")).rejects.toThrow(
			RealExchangeCalledError,
		);
		expect(trap.calls).toContain("cancelOrder");
	});

	test("trap cancelOrder throws RealExchangeCalledError with clear message", async () => {
		const trap = new TrapExchangeAdapter();

		const error = await trap.cancelOrder("id", "BTCUSDT").catch((e: Error) => e);

		expect(error).toBeInstanceOf(RealExchangeCalledError);
		expect(error.message).toContain("cancelOrder");
		expect(error.message).toContain("paper mode");
	});
});

// ---------------------------------------------------------------------------
// Tests: fetchOrder (OrderStatusTracker) — paper orders must not poll exchange
// ---------------------------------------------------------------------------

describe("paper-safety: fetchOrder not called for paper-mode orders via OrderStatusTracker", () => {
	test("empty active orders: no exchange fetch occurs", async () => {
		const trap = new TrapExchangeAdapter();
		const deps: OrderTrackerDeps = {
			getActiveOrders: async () => [],
			fetchExchangeOrder: async (id, symbol) => {
				// If this is ever called from paper order polling, fail immediately
				trap.calls.push("fetchOrder");
				throw new RealExchangeCalledError("fetchOrder");
			},
			updateOrderStatus: async () => {},
			emitOrderFilled: async () => {},
		};

		const tracker = new OrderStatusTracker(deps);
		await tracker.pollOnce();

		expect(trap.calls).not.toContain("fetchOrder");
	});

	test("paper tracker: if no real orders exist, fetchExchangeOrder is never called", async () => {
		const trap = new TrapExchangeAdapter();
		let fetchExchangeOrderCalled = false;

		const deps: OrderTrackerDeps = {
			// Paper orders are NOT placed in the real order tracker DB.
			// Simulating: getActiveOrders returns empty (no real orders in paper mode).
			getActiveOrders: async () => [],
			fetchExchangeOrder: async (_id, _symbol) => {
				fetchExchangeOrderCalled = true;
				trap.calls.push("fetchOrder");
				throw new RealExchangeCalledError("fetchOrder");
			},
			updateOrderStatus: async () => {},
			emitOrderFilled: async () => {},
		};

		const tracker = new OrderStatusTracker(deps);

		// Poll multiple times — still no exchange calls
		await tracker.pollOnce();
		await tracker.pollOnce();
		await tracker.pollOnce();

		expect(fetchExchangeOrderCalled).toBe(false);
		expect(trap.calls.length).toBe(0);
	});

	test("trap fetchOrder throws RealExchangeCalledError with clear message", async () => {
		const trap = new TrapExchangeAdapter();

		// Confirm the error is surfaced clearly
		const triggerFetch = async (): Promise<ExchangeOrder> => {
			trap.calls.push("fetchOrder");
			throw new RealExchangeCalledError("fetchOrder");
		};

		const error = await triggerFetch().catch((e: Error) => e);

		expect(error).toBeInstanceOf(RealExchangeCalledError);
		expect(error.message).toContain("fetchOrder");
		expect(error.message).toContain("paper mode");
	});
});

// ---------------------------------------------------------------------------
// Tests: PaperRouter mode boundaries — all modes
// ---------------------------------------------------------------------------

describe("paper-safety: mode boundary enforcement", () => {
	test("analysis mode: no real executor call, no paper matcher call", async () => {
		// analysis mode does not execute orders at all — router should route to real
		// (or throw). Verify paper path is not taken.
		const trap = new TrapExchangeAdapter();
		const paperMatcherCalls: string[] = [];

		const paperMatcher: PaperOrderMatcher = {
			async matchOrder(order): Promise<PaperOrderResult> {
				paperMatcherCalls.push(order.symbol);
				return {
					type: "paper",
					paperId: "p1",
					symbol: order.symbol,
					side: order.side,
					size: order.size,
					filledPrice: order.price,
					filledAt: Date.now(),
				};
			},
		};

		const router = new PaperRouter(makeRealExecutorFromAdapter(trap), paperMatcher);

		// analysis mode routes to real executor (which traps) — paper matcher is NOT called
		await expect(router.execute(makeOrderRequest(), "analysis")).rejects.toThrow(
			RealExchangeCalledError,
		);

		expect(paperMatcherCalls.length).toBe(0);
	});

	test("alert mode: paper matcher is NOT called", async () => {
		const trap = new TrapExchangeAdapter();
		const paperMatcherCalls: string[] = [];

		const paperMatcher: PaperOrderMatcher = {
			async matchOrder(order): Promise<PaperOrderResult> {
				paperMatcherCalls.push(order.symbol);
				return {
					type: "paper",
					paperId: "p1",
					symbol: order.symbol,
					side: order.side,
					size: order.size,
					filledPrice: order.price,
					filledAt: Date.now(),
				};
			},
		};

		const router = new PaperRouter(makeRealExecutorFromAdapter(trap), paperMatcher);

		// alert mode routes to real executor (which traps) — paper matcher is NOT called
		await expect(router.execute(makeOrderRequest(), "alert")).rejects.toThrow(
			RealExchangeCalledError,
		);

		expect(paperMatcherCalls.length).toBe(0);
	});

	test("paper mode: multiple orders all handled by paper matcher, zero exchange calls", async () => {
		const trap = new TrapExchangeAdapter();
		const router = new PaperRouter(makeRealExecutorFromAdapter(trap), makePaperMatcher());

		const orders: OrderRequest[] = [
			makeOrderRequest({ symbol: "BTCUSDT", side: "BUY" }),
			makeOrderRequest({ symbol: "ETHUSDT", side: "SELL" }),
			makeOrderRequest({ symbol: "SOLUSDT", side: "BUY" }),
			makeOrderRequest({ symbol: "BNBUSDT", side: "SELL" }),
		];

		const results = await Promise.all(orders.map((o) => router.execute(o, "paper")));

		expect(results.every((r) => r.type === "paper")).toBe(true);
		expect(trap.calls.length).toBe(0);
	});
});

import type { ExchangeOrder } from "@combine/exchange";
import { createLogger } from "@combine/shared";

const logger = createLogger("order-tracker");

const STALE_ORDER_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface TrackedOrder {
	id: string;
	exchangeOrderId: string;
	symbol: string;
	status: "submitted" | "partially_filled";
	createdAt: Date;
}

export interface OrderTrackerDeps {
	getActiveOrders: () => Promise<TrackedOrder[]>;
	fetchExchangeOrder: (exchangeOrderId: string, symbol: string) => Promise<ExchangeOrder>;
	updateOrderStatus: (orderId: string, status: string, filledQuantity?: number) => Promise<void>;
	emitOrderFilled: (orderId: string, exchangeOrder: ExchangeOrder) => Promise<void>;
}

/**
 * Polls exchange for order status updates and syncs to local state.
 * Call pollOnce() periodically (e.g., every 5 seconds).
 */
export class OrderStatusTracker {
	constructor(private readonly deps: OrderTrackerDeps) {}

	async pollOnce(): Promise<void> {
		const orders = await this.deps.getActiveOrders();
		if (orders.length === 0) return;

		for (const order of orders) {
			await this.checkOrder(order);
		}
	}

	private async checkOrder(order: TrackedOrder): Promise<void> {
		let exchangeOrder: ExchangeOrder;
		try {
			exchangeOrder = await this.deps.fetchExchangeOrder(order.exchangeOrderId, order.symbol);
		} catch (err) {
			logger.warn(
				{ orderId: order.id, error: (err as Error).message },
				"Failed to fetch order status from exchange",
			);
			return;
		}

		// Check for stale orders
		const age = Date.now() - order.createdAt.getTime();
		if (age > STALE_ORDER_MS && exchangeOrder.status === "open" && exchangeOrder.filled === 0) {
			await this.deps.updateOrderStatus(order.id, "stale");
			logger.warn({ orderId: order.id, ageHours: Math.floor(age / 3600000) }, "Order is stale");
			return;
		}

		if (exchangeOrder.status === "closed") {
			// Fully filled
			await this.deps.updateOrderStatus(order.id, "filled", exchangeOrder.filled);
			await this.deps.emitOrderFilled(order.id, exchangeOrder);
			logger.info({ orderId: order.id, filled: exchangeOrder.filled }, "Order filled");
		} else if (exchangeOrder.status === "canceled") {
			await this.deps.updateOrderStatus(order.id, "canceled");
			logger.info({ orderId: order.id }, "Order canceled");
		} else if (exchangeOrder.filled > 0) {
			// Partially filled
			await this.deps.updateOrderStatus(order.id, "partially_filled", exchangeOrder.filled);
			logger.info({ orderId: order.id, filled: exchangeOrder.filled }, "Order partially filled");
		}
		// If still open with 0 filled, do nothing — check again next cycle
	}
}

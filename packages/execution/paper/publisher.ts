import type { EventPublisher } from "@combine/shared/event-bus";

/**
 * Paper event payload types — mirrors definitions in @combine/shared/event-bus.
 * Duplicated here to avoid a circular-dependency risk at the package boundary.
 */

export interface PaperOrderFilledPayload {
	strategyId: string;
	userId: string;
	orderId: string;
	symbol: string;
	side: "LONG" | "SHORT";
	size: string;
	price: string;
	pnl: string;
	filledAt: string; // ISO timestamp
}

export interface PaperPositionOpenedPayload {
	strategyId: string;
	userId: string;
	symbol: string;
	side: "LONG" | "SHORT";
	size: string;
	entryPrice: string;
	openedAt: string; // ISO timestamp
}

export interface PaperPositionClosedPayload {
	strategyId: string;
	userId: string;
	symbol: string;
	side: "LONG" | "SHORT";
	size: string;
	entryPrice: string;
	exitPrice: string;
	pnl: string;
	closedAt: string; // ISO timestamp
}

export interface PaperBalanceUpdatedPayload {
	strategyId: string;
	userId: string;
	available: string;
	reserved: string;
	total: string;
}

// ---------------------------------------------------------------------------
// Paper event channel definitions (must match Channels in @combine/shared/event-bus)
// ---------------------------------------------------------------------------

const PAPER_CHANNELS = {
	paperOrderFilled: { name: "paper_order_filled" },
	paperPositionOpened: { name: "paper_position_opened" },
	paperPositionClosed: { name: "paper_position_closed" },
	paperBalanceUpdated: { name: "paper_balance_updated" },
} as const;

/**
 * Publishes paper trading state-change events to the event bus.
 *
 * All publish calls are fire-and-forget — errors are swallowed so that
 * the paper trading engine is never blocked by event bus failures.
 *
 * All monetary values MUST be passed as decimal strings (never native floats).
 */
export class PaperEventPublisher {
	constructor(private readonly publisher: EventPublisher) {}

	/** Publish after a paper order fill. */
	publishOrderFilled(payload: PaperOrderFilledPayload): void {
		this.publisher.publish(PAPER_CHANNELS.paperOrderFilled, payload).catch(() => {
			// fire-and-forget: event bus errors must not block paper trading
		});
	}

	/** Publish when a paper position is first opened. */
	publishPositionOpened(payload: PaperPositionOpenedPayload): void {
		this.publisher.publish(PAPER_CHANNELS.paperPositionOpened, payload).catch(() => {
			// fire-and-forget
		});
	}

	/** Publish when a paper position is fully closed. */
	publishPositionClosed(payload: PaperPositionClosedPayload): void {
		this.publisher.publish(PAPER_CHANNELS.paperPositionClosed, payload).catch(() => {
			// fire-and-forget
		});
	}

	/** Publish after a balance change. */
	publishBalanceUpdated(payload: PaperBalanceUpdatedPayload): void {
		this.publisher.publish(PAPER_CHANNELS.paperBalanceUpdated, payload).catch(() => {
			// fire-and-forget
		});
	}
}

import type { SseEvent } from "../sse.js";

// ---------------------------------------------------------------------------
// Paper event type names
// ---------------------------------------------------------------------------

export type PaperSseEventType =
	| "paper_order_filled"
	| "paper_position_opened"
	| "paper_position_closed"
	| "paper_balance_updated";

// ---------------------------------------------------------------------------
// Paper event payload types
// ---------------------------------------------------------------------------

/** Published after a paper order is filled. */
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

/** Published when a paper position is first opened. */
export interface PaperPositionOpenedPayload {
	strategyId: string;
	userId: string;
	symbol: string;
	side: "LONG" | "SHORT";
	size: string;
	entryPrice: string;
	openedAt: string; // ISO timestamp
}

/** Published when a paper position is fully closed. */
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

/** Published after a paper balance change. */
export interface PaperBalanceUpdatedPayload {
	strategyId: string;
	userId: string;
	available: string;
	reserved: string;
	total: string;
}

// ---------------------------------------------------------------------------
// Paper event type guard
// ---------------------------------------------------------------------------

const PAPER_EVENT_TYPES = new Set<string>([
	"paper_order_filled",
	"paper_position_opened",
	"paper_position_closed",
	"paper_balance_updated",
]);

/** Returns true if the given string is one of the four paper event type names. */
export function isPaperEventType(type: string): type is PaperSseEventType {
	return PAPER_EVENT_TYPES.has(type);
}

// ---------------------------------------------------------------------------
// Paper event filtering predicate
// ---------------------------------------------------------------------------

/**
 * Determines whether an SSE event should be forwarded to a particular
 * paper-trading subscriber.
 *
 * Rules:
 * - If the event is NOT a paper event type, always forward (fall through to
 *   the existing shouldForwardEvent logic in the SSE route).
 * - If the event IS a paper event type, forward only when both:
 *     1. event.data.userId matches the authenticated user's id
 *     2. event.data.strategyId matches the client's requested strategyId
 *
 * User isolation guarantee: userId must ALWAYS match. No cross-user leakage.
 */
export function shouldForwardPaperEvent(
	event: SseEvent,
	authenticatedUserId: string,
	clientStrategyId: string,
): boolean {
	if (!isPaperEventType(event.type)) {
		// Not a paper event — not our concern, always forward
		return true;
	}

	const data = event.data as Record<string, unknown>;
	if (typeof data.userId !== "string" || typeof data.strategyId !== "string") {
		// Malformed paper event — drop it
		return false;
	}

	return data.userId === authenticatedUserId && data.strategyId === clientStrategyId;
}

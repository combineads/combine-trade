/**
 * T-14-011: Paper Trading Events in SSE Stream
 *
 * Tests for:
 * - Paper event type definitions (shape, monetary string values)
 * - SSE stream delivers paper events to correct userId/strategyId subscriber
 * - SSE stream does NOT deliver paper events to a different user's connection
 * - SSE event `type` field matches event type name
 * - Paper event filtering predicate (pure function)
 */
import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import type { SseEvent, SseRouteDeps } from "../../src/routes/sse.js";
import { sseRoutes } from "../../src/routes/sse.js";
import {
	type PaperBalanceUpdatedPayload,
	type PaperOrderFilledPayload,
	type PaperPositionClosedPayload,
	type PaperPositionOpenedPayload,
	isPaperEventType,
	shouldForwardPaperEvent,
} from "../../src/routes/sse/paper-filter.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = "user-sse-001";
const OTHER_USER_ID = "user-sse-002";
const STRATEGY_ID = "strat-sse-001";
const OTHER_STRATEGY_ID = "strat-sse-999";

const FILLED_PAYLOAD: PaperOrderFilledPayload = {
	strategyId: STRATEGY_ID,
	userId: USER_ID,
	orderId: "ord-001",
	symbol: "BTCUSDT",
	side: "LONG",
	size: "0.5",
	price: "60000.00",
	pnl: "150.00",
	filledAt: "2026-01-01T00:00:00Z",
};

const POSITION_OPENED_PAYLOAD: PaperPositionOpenedPayload = {
	strategyId: STRATEGY_ID,
	userId: USER_ID,
	symbol: "BTCUSDT",
	side: "LONG",
	size: "0.5",
	entryPrice: "60000.00",
	openedAt: "2026-01-01T00:00:00Z",
};

const POSITION_CLOSED_PAYLOAD: PaperPositionClosedPayload = {
	strategyId: STRATEGY_ID,
	userId: USER_ID,
	symbol: "BTCUSDT",
	side: "LONG",
	size: "0.5",
	entryPrice: "60000.00",
	exitPrice: "61500.00",
	pnl: "150.00",
	closedAt: "2026-01-02T00:00:00Z",
};

const BALANCE_UPDATED_PAYLOAD: PaperBalanceUpdatedPayload = {
	strategyId: STRATEGY_ID,
	userId: USER_ID,
	available: "9850.00",
	reserved: "150.00",
	total: "10000.00",
};

// ---------------------------------------------------------------------------
// Mock deps factory
// ---------------------------------------------------------------------------

function createMockDeps(
	userId = USER_ID,
	userStrategyIds = [STRATEGY_ID],
): SseRouteDeps & { emit: (event: SseEvent) => void } {
	const listeners = new Set<(event: SseEvent) => void>();

	return {
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		emit: (event) => {
			for (const listener of listeners) listener(event);
		},
		auth: {
			handler: async () => new Response(null, { status: 501 }),
			api: {
				getSession: async (ctx: { headers: Headers }) => {
					const auth = ctx.headers.get("authorization");
					if (!auth?.startsWith("Bearer ")) return null;
					const token = auth.slice(7);
					if (!token) return null;
					return { user: { id: userId } };
				},
			},
		},
		strategyRepository: {
			findAll: async () => [],
			findById: async () => null,
			findByNameAndVersion: async () => null,
			findActive: async () =>
				userStrategyIds.map((id) => ({
					id,
					version: 1,
					name: "Test Strategy",
					description: null,
					code: "",
					symbols: [],
					timeframe: "1h",
					direction: "long" as const,
					featuresDefinition: [],
					normalizationConfig: {},
					searchConfig: {},
					resultConfig: {},
					decisionConfig: {},
					executionMode: "paper" as const,
					apiVersion: null,
					status: "active" as const,
					createdAt: new Date(),
					updatedAt: new Date(),
					deletedAt: null,
				})),
			create: async () => {
				throw new Error("stub");
			},
			update: async () => {
				throw new Error("stub");
			},
			softDelete: async () => {},
			createNewVersion: async () => {
				throw new Error("stub");
			},
		},
	};
}

function createApp(deps: SseRouteDeps) {
	return new Elysia().use(sseRoutes(deps));
}

function makeRequest(headers: Record<string, string> = {}, strategyId?: string) {
	const url = strategyId
		? `http://localhost/api/v1/stream?strategyId=${strategyId}`
		: "http://localhost/api/v1/stream";
	return new Request(url, { headers });
}

function getReader(res: Response): ReadableStreamDefaultReader<Uint8Array> {
	if (!res.body) throw new Error("Response has no body");
	return res.body.getReader();
}

// ---------------------------------------------------------------------------
// isPaperEventType pure function
// ---------------------------------------------------------------------------

describe("paper-sse: isPaperEventType", () => {
	test("returns true for paper_order_filled", () => {
		expect(isPaperEventType("paper_order_filled")).toBe(true);
	});

	test("returns true for paper_position_opened", () => {
		expect(isPaperEventType("paper_position_opened")).toBe(true);
	});

	test("returns true for paper_position_closed", () => {
		expect(isPaperEventType("paper_position_closed")).toBe(true);
	});

	test("returns true for paper_balance_updated", () => {
		expect(isPaperEventType("paper_balance_updated")).toBe(true);
	});

	test("returns false for decision", () => {
		expect(isPaperEventType("decision")).toBe(false);
	});

	test("returns false for heartbeat", () => {
		expect(isPaperEventType("heartbeat")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// shouldForwardPaperEvent pure function
// ---------------------------------------------------------------------------

describe("paper-sse: shouldForwardPaperEvent predicate", () => {
	const event: SseEvent = {
		type: "paper_order_filled",
		data: FILLED_PAYLOAD,
	};

	test("returns true when userId and strategyId match", () => {
		expect(shouldForwardPaperEvent(event, USER_ID, STRATEGY_ID)).toBe(true);
	});

	test("returns false when userId does not match", () => {
		expect(shouldForwardPaperEvent(event, OTHER_USER_ID, STRATEGY_ID)).toBe(false);
	});

	test("returns false when strategyId does not match", () => {
		expect(shouldForwardPaperEvent(event, USER_ID, OTHER_STRATEGY_ID)).toBe(false);
	});

	test("returns false when neither matches", () => {
		expect(shouldForwardPaperEvent(event, OTHER_USER_ID, OTHER_STRATEGY_ID)).toBe(false);
	});

	test("returns true for non-paper events (no userId field) regardless of params", () => {
		const nonPaperEvent: SseEvent = {
			type: "decision",
			data: { strategyId: STRATEGY_ID, action: "LONG" },
		};
		expect(shouldForwardPaperEvent(nonPaperEvent, OTHER_USER_ID, OTHER_STRATEGY_ID)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Paper event payload shape: monetary values must be strings
// ---------------------------------------------------------------------------

describe("paper-sse: paper_order_filled payload monetary values", () => {
	test("price, pnl, size are strings", () => {
		expect(typeof FILLED_PAYLOAD.price).toBe("string");
		expect(typeof FILLED_PAYLOAD.pnl).toBe("string");
		expect(typeof FILLED_PAYLOAD.size).toBe("string");
	});

	test("has required fields: strategyId, userId, orderId, symbol, side, filledAt", () => {
		expect(FILLED_PAYLOAD.strategyId).toBeDefined();
		expect(FILLED_PAYLOAD.userId).toBeDefined();
		expect(FILLED_PAYLOAD.orderId).toBeDefined();
		expect(FILLED_PAYLOAD.symbol).toBeDefined();
		expect(FILLED_PAYLOAD.side).toBeDefined();
		expect(FILLED_PAYLOAD.filledAt).toBeDefined();
	});
});

describe("paper-sse: paper_position_opened payload monetary values", () => {
	test("entryPrice, size are strings", () => {
		expect(typeof POSITION_OPENED_PAYLOAD.entryPrice).toBe("string");
		expect(typeof POSITION_OPENED_PAYLOAD.size).toBe("string");
	});
});

describe("paper-sse: paper_position_closed payload monetary values", () => {
	test("entryPrice, exitPrice, pnl, size are strings", () => {
		expect(typeof POSITION_CLOSED_PAYLOAD.entryPrice).toBe("string");
		expect(typeof POSITION_CLOSED_PAYLOAD.exitPrice).toBe("string");
		expect(typeof POSITION_CLOSED_PAYLOAD.pnl).toBe("string");
		expect(typeof POSITION_CLOSED_PAYLOAD.size).toBe("string");
	});
});

describe("paper-sse: paper_balance_updated payload monetary values", () => {
	test("available, reserved, total are strings", () => {
		expect(typeof BALANCE_UPDATED_PAYLOAD.available).toBe("string");
		expect(typeof BALANCE_UPDATED_PAYLOAD.reserved).toBe("string");
		expect(typeof BALANCE_UPDATED_PAYLOAD.total).toBe("string");
	});
});

// ---------------------------------------------------------------------------
// SSE stream: paper events delivered to correct userId/strategyId
// ---------------------------------------------------------------------------

describe("paper-sse: SSE stream delivers paper events to correct subscriber", () => {
	test("paper_order_filled event is forwarded to matching userId/strategyId", async () => {
		const deps = createMockDeps(USER_ID, [STRATEGY_ID]);
		const app = createApp(deps);

		const res = await app.handle(makeRequest({ Authorization: "Bearer valid-token" }, STRATEGY_ID));
		expect(res.status).toBe(200);

		const reader = getReader(res);
		// Consume initial heartbeat
		await reader.read();

		// Emit a paper_order_filled event for this user's strategy
		deps.emit({ type: "paper_order_filled", data: FILLED_PAYLOAD });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		expect(text).toContain("event: paper_order_filled");
		expect(text).toContain(STRATEGY_ID);
		reader.cancel();
	});

	test("paper_position_opened event is forwarded to matching subscriber", async () => {
		const deps = createMockDeps(USER_ID, [STRATEGY_ID]);
		const app = createApp(deps);

		const res = await app.handle(makeRequest({ Authorization: "Bearer valid-token" }, STRATEGY_ID));
		const reader = getReader(res);
		await reader.read();

		deps.emit({ type: "paper_position_opened", data: POSITION_OPENED_PAYLOAD });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		expect(text).toContain("event: paper_position_opened");
		reader.cancel();
	});

	test("paper_position_closed event is forwarded to matching subscriber", async () => {
		const deps = createMockDeps(USER_ID, [STRATEGY_ID]);
		const app = createApp(deps);

		const res = await app.handle(makeRequest({ Authorization: "Bearer valid-token" }, STRATEGY_ID));
		const reader = getReader(res);
		await reader.read();

		deps.emit({ type: "paper_position_closed", data: POSITION_CLOSED_PAYLOAD });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		expect(text).toContain("event: paper_position_closed");
		reader.cancel();
	});

	test("paper_balance_updated event is forwarded to matching subscriber", async () => {
		const deps = createMockDeps(USER_ID, [STRATEGY_ID]);
		const app = createApp(deps);

		const res = await app.handle(makeRequest({ Authorization: "Bearer valid-token" }, STRATEGY_ID));
		const reader = getReader(res);
		await reader.read();

		deps.emit({ type: "paper_balance_updated", data: BALANCE_UPDATED_PAYLOAD });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		expect(text).toContain("event: paper_balance_updated");
		reader.cancel();
	});

	test("SSE event type field matches event type name", async () => {
		const deps = createMockDeps(USER_ID, [STRATEGY_ID]);
		const app = createApp(deps);

		const res = await app.handle(makeRequest({ Authorization: "Bearer valid-token" }, STRATEGY_ID));
		const reader = getReader(res);
		await reader.read();

		deps.emit({ type: "paper_order_filled", data: FILLED_PAYLOAD });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		// SSE event: field must be exactly the type name
		expect(text).toMatch(/^event: paper_order_filled\n/);
		reader.cancel();
	});

	test("data field includes type in JSON payload", async () => {
		const deps = createMockDeps(USER_ID, [STRATEGY_ID]);
		const app = createApp(deps);

		const res = await app.handle(makeRequest({ Authorization: "Bearer valid-token" }, STRATEGY_ID));
		const reader = getReader(res);
		await reader.read();

		deps.emit({ type: "paper_order_filled", data: FILLED_PAYLOAD });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		// data: line should contain the JSON payload
		const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
		expect(dataLine).toBeDefined();
		const parsed = JSON.parse((dataLine as string).slice(5).trim());
		expect(parsed.orderId).toBe("ord-001");
		reader.cancel();
	});
});

// ---------------------------------------------------------------------------
// SSE stream: cross-user isolation
// ---------------------------------------------------------------------------

describe("paper-sse: SSE stream does not deliver paper events to wrong user", () => {
	test("paper_order_filled for user A is NOT forwarded to user B's stream", async () => {
		// User B's connection — subscribed to STRATEGY_ID but as a different user
		const deps = createMockDeps(OTHER_USER_ID, [STRATEGY_ID]);
		const app = createApp(deps);

		// User B subscribes with the same strategyId as user A's event
		const res = await app.handle(makeRequest({ Authorization: "Bearer valid-token" }, STRATEGY_ID));
		const reader = getReader(res);
		await reader.read();

		// Emit event for user A's strategy — FILLED_PAYLOAD.userId = USER_ID (user A)
		// User B is OTHER_USER_ID — userId mismatch → must be dropped
		deps.emit({ type: "paper_order_filled", data: FILLED_PAYLOAD });
		// Emit a heartbeat so the reader unblocks
		deps.emit({ type: "heartbeat", data: { time: "2026-01-01T00:00:00Z" } });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		// Only heartbeat should arrive
		expect(text).toContain("event: heartbeat");
		expect(text).not.toContain("paper_order_filled");
		reader.cancel();
	});

	test("paper event for strategy strat-A is NOT delivered to a strat-B subscriber", async () => {
		// User has strat-B, subscribes to strat-B
		const deps = createMockDeps(USER_ID, [OTHER_STRATEGY_ID]);
		const app = createApp(deps);

		// Client subscribes to OTHER_STRATEGY_ID, not STRATEGY_ID
		const res = await app.handle(
			makeRequest({ Authorization: "Bearer valid-token" }, OTHER_STRATEGY_ID),
		);
		const reader = getReader(res);
		await reader.read();

		// FILLED_PAYLOAD has strategyId = STRATEGY_ID (strat-A), not strat-B
		deps.emit({ type: "paper_order_filled", data: FILLED_PAYLOAD });
		deps.emit({ type: "heartbeat", data: { time: "2026-01-01T00:00:00Z" } });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		expect(text).toContain("event: heartbeat");
		expect(text).not.toContain("paper_order_filled");
		reader.cancel();
	});
});

// ---------------------------------------------------------------------------
// SSE stream: existing non-paper events unaffected
// ---------------------------------------------------------------------------

describe("paper-sse: existing non-paper events unaffected", () => {
	test("decision event still forwarded to strategy owner", async () => {
		const deps = createMockDeps(USER_ID, [STRATEGY_ID]);
		const app = createApp(deps);

		const res = await app.handle(makeRequest({ Authorization: "Bearer valid-token" }, STRATEGY_ID));
		const reader = getReader(res);
		await reader.read();

		deps.emit({ type: "decision", data: { strategyId: STRATEGY_ID, action: "LONG" } });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		expect(text).toContain("event: decision");
		expect(text).toContain("LONG");
		reader.cancel();
	});

	test("heartbeat event always forwarded regardless of strategy", async () => {
		const deps = createMockDeps(USER_ID, []);
		const app = createApp(deps);

		const res = await app.handle(makeRequest({ Authorization: "Bearer valid-token" }));
		const reader = getReader(res);
		// First read is the initial heartbeat
		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		expect(text).toContain("event: heartbeat");
		reader.cancel();
	});
});

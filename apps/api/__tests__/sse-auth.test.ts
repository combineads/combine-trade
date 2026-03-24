/**
 * T-18-011: SSE auth validation tests
 *
 * Verifies that:
 * 1. GET /api/v1/stream returns 401 when no session is provided
 * 2. GET /api/v1/stream returns 401 when session is invalid
 * 3. GET /api/v1/stream connects successfully with a valid session
 * 4. Events are filtered to only the authenticated user's strategies
 * 5. auth_expired event is sent when session re-validation fails
 * 6. Bearer token takes precedence over cookie in requireSession
 */
import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { requireSession } from "../src/lib/auth-helpers.js";
import { type SseEvent, type SseRouteDeps, sseRoutes } from "../src/routes/sse.js";
import type { AuthLike } from "../src/server.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRequest(
	url = "http://localhost/api/v1/stream",
	headers: Record<string, string> = {},
): Request {
	return new Request(url, { headers });
}

function getReader(res: Response): ReadableStreamDefaultReader<Uint8Array> {
	if (!res.body) throw new Error("Response has no body");
	return res.body.getReader();
}

function createMockAuth(userId: string | null = "user-1"): AuthLike {
	return {
		handler: async (_req: Request): Promise<Response> => {
			return new Response(JSON.stringify({ error: "not implemented" }), { status: 501 });
		},
		api: {
			getSession: async (ctx: { headers: Headers }) => {
				const auth = ctx.headers.get("authorization");
				const cookie = ctx.headers.get("cookie");
				// Bearer takes precedence
				if (auth?.startsWith("Bearer ")) {
					const token = auth.slice(7);
					if (!token) return null;
					return userId ? { user: { id: userId } } : null;
				}
				// Fall back to cookie
				if (cookie?.includes("session=")) {
					return userId ? { user: { id: userId } } : null;
				}
				return null;
			},
		},
	};
}

function createMockDeps(): SseRouteDeps & { emit: (event: SseEvent) => void } {
	const listeners = new Set<(event: SseEvent) => void>();
	return {
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		emit: (event) => {
			for (const listener of listeners) listener(event);
		},
		auth: createMockAuth(),
		strategyRepository: {
			findAll: async (_userId: string) => [],
			findById: async (_id: string, _userId: string) => null,
			findByNameAndVersion: async () => null,
			findActive: async () => [],
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

// ---------------------------------------------------------------------------
// requireSession helper
// ---------------------------------------------------------------------------

describe("requireSession helper", () => {
	test("returns session when Bearer token is valid", async () => {
		const auth = createMockAuth("user-1");
		const req = makeRequest("http://localhost/test", { Authorization: "Bearer valid-token" });
		const session = await requireSession(req, auth);
		expect(session).not.toBeNull();
		expect(session?.user.id).toBe("user-1");
	});

	test("returns null when no authorization header or cookie", async () => {
		const auth = createMockAuth("user-1");
		const req = makeRequest("http://localhost/test");
		const session = await requireSession(req, auth);
		expect(session).toBeNull();
	});

	test("returns null when auth returns null session", async () => {
		const auth = createMockAuth(null);
		const req = makeRequest("http://localhost/test", { Authorization: "Bearer bad-token" });
		const session = await requireSession(req, auth);
		expect(session).toBeNull();
	});

	test("Bearer token takes precedence over cookie", async () => {
		// Create auth that checks Bearer only for userId differentiation
		const auth: AuthLike = {
			handler: async () => new Response(null, { status: 501 }),
			api: {
				getSession: async (ctx: { headers: Headers }) => {
					const bearer = ctx.headers.get("authorization");
					if (bearer?.startsWith("Bearer ")) {
						return { user: { id: "bearer-user" } };
					}
					const cookie = ctx.headers.get("cookie");
					if (cookie) {
						return { user: { id: "cookie-user" } };
					}
					return null;
				},
			},
		};
		const req = makeRequest("http://localhost/test", {
			Authorization: "Bearer token",
			Cookie: "session=cookie-session",
		});
		const session = await requireSession(req, auth);
		// better-auth's getSession receives all headers and resolves based on its own logic;
		// we just confirm requireSession passes headers through unmodified
		expect(session?.user.id).toBe("bearer-user");
	});

	test("falls back to cookie when no Bearer header", async () => {
		const auth: AuthLike = {
			handler: async () => new Response(null, { status: 501 }),
			api: {
				getSession: async (ctx: { headers: Headers }) => {
					const cookie = ctx.headers.get("cookie");
					if (cookie?.includes("session=valid")) {
						return { user: { id: "cookie-user" } };
					}
					return null;
				},
			},
		};
		const req = makeRequest("http://localhost/test", {
			Cookie: "session=valid",
		});
		const session = await requireSession(req, auth);
		expect(session?.user.id).toBe("cookie-user");
	});
});

// ---------------------------------------------------------------------------
// SSE auth validation
// ---------------------------------------------------------------------------

describe("SSE auth — connection rejection", () => {
	test("returns 401 when no session provided", async () => {
		const deps = createMockDeps();
		const app = createApp(deps);

		const res = await app.handle(makeRequest());
		expect(res.status).toBe(401);
	});

	test("returns 401 when Bearer token is empty", async () => {
		const deps = createMockDeps();
		const app = createApp(deps);

		const res = await app.handle(
			makeRequest("http://localhost/api/v1/stream", { Authorization: "Bearer " }),
		);
		expect(res.status).toBe(401);
	});

	test("returns 401 when auth returns null session", async () => {
		const deps = createMockDeps();
		deps.auth = createMockAuth(null);
		const app = createApp(deps);

		const res = await app.handle(
			makeRequest("http://localhost/api/v1/stream", {
				Authorization: "Bearer some-token",
			}),
		);
		expect(res.status).toBe(401);
	});

	test("connects successfully with valid Bearer token", async () => {
		const deps = createMockDeps();
		const app = createApp(deps);

		const res = await app.handle(
			makeRequest("http://localhost/api/v1/stream", {
				Authorization: "Bearer valid-token",
			}),
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/event-stream");
	});

	test("connects successfully with session cookie", async () => {
		const deps = createMockDeps();
		// Override auth to accept cookies
		deps.auth = {
			handler: async () => new Response(null, { status: 501 }),
			api: {
				getSession: async (ctx: { headers: Headers }) => {
					const cookie = ctx.headers.get("cookie");
					if (cookie?.includes("session=valid")) {
						return { user: { id: "user-1" } };
					}
					return null;
				},
			},
		};
		const app = createApp(deps);

		const res = await app.handle(
			makeRequest("http://localhost/api/v1/stream", {
				Cookie: "session=valid",
			}),
		);
		expect(res.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// SSE event filtering
// ---------------------------------------------------------------------------

describe("SSE event filtering — user isolation", () => {
	test("events for the authenticated user's strategy are forwarded", async () => {
		const deps = createMockDeps();
		// User's strategy
		deps.strategyRepository.findActive = async (userId: string) => {
			if (userId === "user-1") {
				return [
					{
						id: "strat-1",
						version: 1,
						name: "My Strategy",
						description: null,
						code: "",
						symbols: [],
						timeframe: "1h",
						direction: "long",
						featuresDefinition: [],
						normalizationConfig: {},
						searchConfig: {},
						resultConfig: {},
						decisionConfig: {},
						executionMode: "analysis",
						apiVersion: null,
						status: "active",
						createdAt: new Date(),
						updatedAt: new Date(),
						deletedAt: null,
					},
				];
			}
			return [];
		};
		const app = createApp(deps);

		const res = await app.handle(
			makeRequest("http://localhost/api/v1/stream", {
				Authorization: "Bearer valid-token",
			}),
		);
		const reader = getReader(res);
		// Read initial heartbeat
		await reader.read();

		// Push a decision event for user-1's strategy
		deps.emit({ type: "decision", data: { strategyId: "strat-1", action: "LONG" } });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		expect(text).toContain("event: decision");
		expect(text).toContain("strat-1");
		reader.cancel();
	});

	test("events for another user's strategy are filtered out", async () => {
		const deps = createMockDeps();
		// user-1 has no strategies — strat-other belongs to a different user
		deps.strategyRepository.findActive = async (_userId: string) => [];
		const app = createApp(deps);

		const res = await app.handle(
			makeRequest("http://localhost/api/v1/stream", {
				Authorization: "Bearer valid-token",
			}),
		);
		const reader = getReader(res);
		// Read initial heartbeat
		await reader.read();

		// Emit a decision for another user's strategy — should be filtered
		deps.emit({ type: "decision", data: { strategyId: "strat-other", action: "LONG" } });

		// Emit a heartbeat to verify the stream is still open and we can get the next event
		deps.emit({ type: "heartbeat", data: { time: "2026-01-01" } });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		// Only the heartbeat should arrive, not the decision for strat-other
		expect(text).toContain("event: heartbeat");
		expect(text).not.toContain("strat-other");
		reader.cancel();
	});

	test("non-strategy events (orders, alerts) are always forwarded", async () => {
		const deps = createMockDeps();
		deps.strategyRepository.findActive = async (_userId: string) => [];
		const app = createApp(deps);

		const res = await app.handle(
			makeRequest("http://localhost/api/v1/stream", {
				Authorization: "Bearer valid-token",
			}),
		);
		const reader = getReader(res);
		// Read initial heartbeat
		await reader.read();

		// Push a non-strategy event (no strategyId to filter on)
		deps.emit({ type: "order", data: { orderId: "ord-1" } });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		expect(text).toContain("event: order");
		reader.cancel();
	});
});

// ---------------------------------------------------------------------------
// auth_expired event
// ---------------------------------------------------------------------------

describe("SSE auth_expired event", () => {
	test("sends auth_expired event when session re-validation fails", async () => {
		let callCount = 0;
		const deps = createMockDeps();

		// Session valid on first call (connection), invalid on second (re-validation)
		deps.auth = {
			handler: async () => new Response(null, { status: 501 }),
			api: {
				getSession: async (_ctx: { headers: Headers }) => {
					callCount++;
					if (callCount === 1) {
						return { user: { id: "user-1" } };
					}
					return null; // session expired
				},
			},
		};

		const app = createApp(deps);
		const res = await app.handle(
			makeRequest("http://localhost/api/v1/stream", {
				Authorization: "Bearer valid-token",
			}),
		);

		expect(res.status).toBe(200);
		const reader = getReader(res);

		// Read initial heartbeat
		await reader.read();

		// Trigger a re-validation by emitting a special "revalidate" signal
		// The route exposes this via a periodic timer; for testing we need to call it
		// We rely on the revalidate function being triggered via the testRevalidate hook
		if (deps.triggerRevalidate) {
			await deps.triggerRevalidate();
		}

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		expect(text).toContain("event: auth_expired");
		reader.cancel();
	});
});

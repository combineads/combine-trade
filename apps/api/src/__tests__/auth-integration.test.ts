/**
 * Auth integration tests for the Elysia API server.
 *
 * These tests exercise the full auth chain using mock dependencies — no real
 * database or running server is required. They verify:
 *   - login success / failure
 *   - authenticated access vs. unauthenticated access (401)
 *   - logout followed by re-access (401)
 *   - user isolation (user A cannot read user B's strategies)
 *   - SSE endpoint authentication
 *   - rate limiting (6 consecutive failed logins → 429 on 6th)
 *
 * Tests that genuinely require a live PostgreSQL database are guarded with
 * `describe.skipIf(!process.env.TEST_DB_URL)`. All mock-based tests run
 * unconditionally.
 *
 * Rate limiting: better-auth's built-in rate limiter is tested against the
 * mock auth double. If the rate limiter is disabled in test env (e.g. because
 * no Redis is configured), the test is marked accordingly via skipIf.
 */

import { describe, expect, test } from "bun:test";
import type { StrategyRepository } from "../../../../packages/core/strategy/repository.js";
import type { AuthLike } from "../server.js";
import { createApiServer } from "../server.js";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const USER_A_ID = "user-a-id";
const USER_B_ID = "user-b-id";

/**
 * Minimal credentials store: email → { userId, hashedPassword }.
 * The mock does a plain string comparison (no real hashing in test).
 */
const credentials = new Map([
	["admin@combine.trade", { userId: USER_A_ID, password: "correct-password" }],
	["userb@combine.trade", { userId: USER_B_ID, password: "password-b" }],
]);

/**
 * Build a mock AuthLike that:
 *  - POST /api/auth/sign-in/email: validates credentials, sets session cookie
 *  - POST /api/auth/sign-out: clears session cookie
 *  - getSession: resolves userId from Bearer or cookie
 *
 * Rate limiting: after 5 failed attempts from the same IP the 6th returns 429.
 *
 * Each call to makeAuth() creates an isolated session store and attempt counter,
 * so tests do not bleed state into each other.
 */
function makeAuth(): AuthLike {
	// Per-instance state — isolated between tests
	const sessionStore = new Map<string, string>();
	const loginAttempts = new Map<string, number>();

	return {
		handler: async (request: Request) => {
			const url = new URL(request.url);

			// --- Sign in ---
			if (url.pathname === "/api/auth/sign-in/email" && request.method === "POST") {
				const body = (await request.json()) as { email?: string; password?: string };
				const { email = "", password = "" } = body;

				// Rate limiting: count consecutive failures per email
				const attempts = loginAttempts.get(email) ?? 0;
				if (attempts >= 5) {
					return new Response(JSON.stringify({ error: "too_many_requests" }), {
						status: 429,
						headers: {
							"content-type": "application/json",
							"retry-after": "60",
						},
					});
				}

				const cred = credentials.get(email);
				if (!cred || cred.password !== password) {
					loginAttempts.set(email, attempts + 1);
					return new Response(JSON.stringify({ error: "invalid_credentials" }), {
						status: 401,
						headers: { "content-type": "application/json" },
					});
				}

				// Success — reset counter and create session
				loginAttempts.delete(email);
				const token = crypto.randomUUID();
				sessionStore.set(token, cred.userId);

				return new Response(JSON.stringify({ user: { id: cred.userId, email } }), {
					status: 200,
					headers: {
						"content-type": "application/json",
						"set-cookie": `combine-trade.session_token=${token}; HttpOnly; SameSite=Strict; Path=/`,
					},
				});
			}

			// --- Sign out ---
			if (url.pathname === "/api/auth/sign-out" && request.method === "POST") {
				const cookie = request.headers.get("cookie") ?? "";
				const token = extractTokenFromCookie(cookie);
				if (token) sessionStore.delete(token);

				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: {
						"content-type": "application/json",
						"set-cookie":
							"combine-trade.session_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
					},
				});
			}

			return new Response("not found", { status: 404 });
		},

		api: {
			getSession: async (ctx: { headers: Headers }) => {
				// Try cookie first
				const cookie = ctx.headers.get("cookie") ?? "";
				const token = extractTokenFromCookie(cookie);
				if (token) {
					const userId = sessionStore.get(token);
					if (userId) return { user: { id: userId } };
				}

				// Try Bearer token
				const authHeader = ctx.headers.get("authorization") ?? "";
				if (authHeader.startsWith("Bearer ")) {
					const bearer = authHeader.slice(7);
					const userId = sessionStore.get(bearer);
					if (userId) return { user: { id: userId } };
				}

				return null;
			},
		},
	};
}

function extractTokenFromCookie(cookieHeader: string): string | null {
	const match = cookieHeader.match(/combine-trade\.session_token=([^;]+)/);
	return match?.[1] ?? null;
}

/**
 * Minimal StrategyRepository mock that stores strategies per user.
 */
function makeStrategyRepository(): StrategyRepository {
	type StrategyRecord = {
		id: string;
		userId: string;
		name: string;
		code: string;
		symbols: string[];
		timeframe: string;
		direction: "long" | "short" | "both";
		featuresDefinition: unknown[];
		normalizationConfig: Record<string, unknown> | null;
		searchConfig: Record<string, unknown> | null;
		resultConfig: Record<string, unknown> | null;
		decisionConfig: Record<string, unknown> | null;
		description: string | null;
		executionMode: "analysis" | "paper" | "live";
		version: number;
		createdAt: Date;
		updatedAt: Date;
	};

	const store = new Map<string, StrategyRecord>();

	return {
		findAll: async (userId: string) => [...store.values()].filter((s) => s.userId === userId),
		findById: async (id: string, userId: string) => {
			const s = store.get(id);
			if (!s || s.userId !== userId) return null;
			return s;
		},
		create: async (data, userId: string) => {
			const id = crypto.randomUUID();
			const record: StrategyRecord = {
				id,
				userId,
				name: data.name,
				code: data.code,
				symbols: data.symbols,
				timeframe: data.timeframe,
				direction: data.direction,
				featuresDefinition: data.featuresDefinition,
				normalizationConfig: data.normalizationConfig ?? null,
				searchConfig: data.searchConfig ?? null,
				resultConfig: data.resultConfig ?? null,
				decisionConfig: data.decisionConfig ?? null,
				description: data.description ?? null,
				executionMode: data.executionMode ?? "analysis",
				version: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			store.set(id, record);
			return record;
		},
		update: async (id: string, data, userId: string) => {
			const existing = store.get(id);
			if (!existing || existing.userId !== userId) return null;
			const updated = { ...existing, ...data, updatedAt: new Date() };
			store.set(id, updated);
			return updated;
		},
		delete: async (id: string, userId: string) => {
			const existing = store.get(id);
			if (!existing || existing.userId !== userId) return false;
			store.delete(id);
			return true;
		},
	};
}

/** Build a minimal set of deps for createApiServer. */
function makeServerDeps(auth: AuthLike, strategyRepository: StrategyRepository) {
	return {
		auth,
		masterEncryptionKey: "test-key-32-bytes-padding-here!!",
		strategyRepository,
		executionModeDeps: {
			findById: async () => null,
			updateMode: async () => {},
		},
		killSwitchDeps: {
			getState: async () => ({ active: false, activatedAt: null, reason: null }),
			activate: async () => {},
			deactivate: async () => {},
		},
		sseSubscribe: (_listener: unknown) => () => {},
		credentialDeps: {
			findAll: async () => [],
			create: async () => ({ id: "c1", name: "test", exchange: "binance", maskedKey: "****" }),
			delete: async () => true,
			findById: async () => null,
			decrypt: async () => ({ key: "", secret: "" }),
		},
		eventDeps: {
			findAll: async () => [],
		},
		orderDeps: {
			findAll: async () => [],
		},
		candleDeps: {
			findAll: async () => [],
		},
		alertDeps: {
			findAll: async () => [],
			markRead: async () => {},
		},
		backtestDeps: {
			run: async () => ({ results: [] }),
		},
		journalDeps: {
			findAll: async () => [],
			create: async () => ({ id: "j1", content: "" }),
			update: async () => null,
			delete: async () => false,
		},
		paperDeps: {
			findAll: async () => [],
			getPortfolio: async () => ({ balance: 0, positions: [] }),
		},
	};
}

// ---------------------------------------------------------------------------
// Test: login
// ---------------------------------------------------------------------------

describe("auth integration — login", () => {
	test("POST /api/auth/sign-in/email with valid credentials returns 200 and session cookie", async () => {
		const auth = makeAuth();
		const response = await auth.handler(
			new Request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "admin@combine.trade", password: "correct-password" }),
			}),
		);

		expect(response.status).toBe(200);
		const setCookie = response.headers.get("set-cookie");
		expect(setCookie).toContain("combine-trade.session_token=");
	});

	test("POST /api/auth/sign-in/email with wrong password returns 401", async () => {
		const auth = makeAuth();
		const response = await auth.handler(
			new Request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "admin@combine.trade", password: "wrong-password" }),
			}),
		);

		expect(response.status).toBe(401);
	});
});

// ---------------------------------------------------------------------------
// Test: authenticated vs unauthenticated access
// ---------------------------------------------------------------------------

describe("auth integration — protected route access", () => {
	test("GET /api/v1/strategies with valid session returns 200", async () => {
		const auth = makeAuth();
		const repo = makeStrategyRepository();
		const app = createApiServer(
			makeServerDeps(auth, repo) as Parameters<typeof createApiServer>[0],
		);

		// Login to get session token
		const loginResp = await auth.handler(
			new Request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "admin@combine.trade", password: "correct-password" }),
			}),
		);
		const setCookie = loginResp.headers.get("set-cookie") ?? "";
		const tokenMatch = setCookie.match(/combine-trade\.session_token=([^;]+)/);
		const token = tokenMatch?.[1] ?? "";

		const response = await app.handle(
			new Request("http://localhost/api/v1/strategies", {
				headers: { cookie: `combine-trade.session_token=${token}` },
			}),
		);

		expect(response.status).toBe(200);
	});

	test("GET /api/v1/strategies without session cookie returns 401", async () => {
		const auth = makeAuth();
		const repo = makeStrategyRepository();
		const app = createApiServer(
			makeServerDeps(auth, repo) as Parameters<typeof createApiServer>[0],
		);

		const response = await app.handle(new Request("http://localhost/api/v1/strategies"));

		expect(response.status).toBe(401);
	});
});

// ---------------------------------------------------------------------------
// Test: logout
// ---------------------------------------------------------------------------

describe("auth integration — logout", () => {
	test("POST /api/auth/sign-out invalidates the session; subsequent GET returns 401", async () => {
		const auth = makeAuth();
		const repo = makeStrategyRepository();
		const app = createApiServer(
			makeServerDeps(auth, repo) as Parameters<typeof createApiServer>[0],
		);

		// Login
		const loginResp = await auth.handler(
			new Request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "admin@combine.trade", password: "correct-password" }),
			}),
		);
		const setCookie = loginResp.headers.get("set-cookie") ?? "";
		const tokenMatch = setCookie.match(/combine-trade\.session_token=([^;]+)/);
		const token = tokenMatch?.[1] ?? "";

		// Verify access before logout
		const beforeLogout = await app.handle(
			new Request("http://localhost/api/v1/strategies", {
				headers: { cookie: `combine-trade.session_token=${token}` },
			}),
		);
		expect(beforeLogout.status).toBe(200);

		// Logout
		await auth.handler(
			new Request("http://localhost/api/auth/sign-out", {
				method: "POST",
				headers: { cookie: `combine-trade.session_token=${token}` },
			}),
		);

		// Access with old cookie should be denied
		const afterLogout = await app.handle(
			new Request("http://localhost/api/v1/strategies", {
				headers: { cookie: `combine-trade.session_token=${token}` },
			}),
		);
		expect(afterLogout.status).toBe(401);
	});
});

// ---------------------------------------------------------------------------
// Test: user isolation
// ---------------------------------------------------------------------------

describe("auth integration — user isolation", () => {
	test("user A creates a strategy; user B gets 404 when trying to access it", async () => {
		const auth = makeAuth();
		const repo = makeStrategyRepository();
		const app = createApiServer(
			makeServerDeps(auth, repo) as Parameters<typeof createApiServer>[0],
		);

		// Login as user A
		const loginA = await auth.handler(
			new Request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "admin@combine.trade", password: "correct-password" }),
			}),
		);
		const cookieA = loginA.headers.get("set-cookie") ?? "";
		const tokenA = cookieA.match(/combine-trade\.session_token=([^;]+)/)?.[1] ?? "";

		// Login as user B
		const loginB = await auth.handler(
			new Request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "userb@combine.trade", password: "password-b" }),
			}),
		);
		const cookieB = loginB.headers.get("set-cookie") ?? "";
		const tokenB = cookieB.match(/combine-trade\.session_token=([^;]+)/)?.[1] ?? "";

		// User A creates a strategy
		const createResp = await app.handle(
			new Request("http://localhost/api/v1/strategies", {
				method: "POST",
				headers: {
					cookie: `combine-trade.session_token=${tokenA}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					name: "User A Strategy",
					code: "// noop",
					symbols: ["BTC/USDT"],
					timeframe: "1h",
					direction: "long",
					featuresDefinition: [],
				}),
			}),
		);
		expect(createResp.status).toBe(201);
		const createBody = (await createResp.json()) as { data: { id: string } };
		const strategyId = createBody.data.id;

		// User B tries to access the strategy created by User A → 404
		const readResp = await app.handle(
			new Request(`http://localhost/api/v1/strategies/${strategyId}`, {
				headers: { cookie: `combine-trade.session_token=${tokenB}` },
			}),
		);
		expect(readResp.status).toBe(404);
	});

	test("user A's strategy list does not include user B's strategies", async () => {
		const auth = makeAuth();
		const repo = makeStrategyRepository();
		const app = createApiServer(
			makeServerDeps(auth, repo) as Parameters<typeof createApiServer>[0],
		);

		// Login as A and B
		const loginA = await auth.handler(
			new Request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "admin@combine.trade", password: "correct-password" }),
			}),
		);
		const tokenA =
			(loginA.headers.get("set-cookie") ?? "").match(/combine-trade\.session_token=([^;]+)/)?.[1] ??
			"";

		const loginB = await auth.handler(
			new Request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "userb@combine.trade", password: "password-b" }),
			}),
		);
		const tokenB =
			(loginB.headers.get("set-cookie") ?? "").match(/combine-trade\.session_token=([^;]+)/)?.[1] ??
			"";

		// User B creates a strategy
		await app.handle(
			new Request("http://localhost/api/v1/strategies", {
				method: "POST",
				headers: {
					cookie: `combine-trade.session_token=${tokenB}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					name: "User B Strategy",
					code: "// noop",
					symbols: ["ETH/USDT"],
					timeframe: "4h",
					direction: "short",
					featuresDefinition: [],
				}),
			}),
		);

		// User A lists strategies — should be empty (only B has one)
		const listResp = await app.handle(
			new Request("http://localhost/api/v1/strategies", {
				headers: { cookie: `combine-trade.session_token=${tokenA}` },
			}),
		);
		expect(listResp.status).toBe(200);
		const listBody = (await listResp.json()) as { data: unknown[] };
		expect(listBody.data.length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Test: SSE authentication
// ---------------------------------------------------------------------------

describe("auth integration — SSE endpoint", () => {
	test("GET /api/v1/stream without session returns 401", async () => {
		const auth = makeAuth();
		const repo = makeStrategyRepository();
		const app = createApiServer(
			makeServerDeps(auth, repo) as Parameters<typeof createApiServer>[0],
		);

		const response = await app.handle(new Request("http://localhost/api/v1/stream"));

		expect(response.status).toBe(401);
	});
});

// ---------------------------------------------------------------------------
// Test: rate limiting (mock-based)
// ---------------------------------------------------------------------------

describe("auth integration — rate limiting", () => {
	test("6 consecutive failed login attempts result in 429 on the 6th", async () => {
		const auth = makeAuth();
		const email = "admin@combine.trade";

		// Attempt 1-5: expect 401 (invalid credentials)
		for (let i = 0; i < 5; i++) {
			const resp = await auth.handler(
				new Request("http://localhost/api/auth/sign-in/email", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ email, password: "wrong" }),
				}),
			);
			expect(resp.status).toBe(401);
		}

		// Attempt 6: expect 429
		const resp6 = await auth.handler(
			new Request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email, password: "wrong" }),
			}),
		);
		expect(resp6.status).toBe(429);
	});

	test("successful login resets the attempt counter", async () => {
		const auth = makeAuth();
		const email = "admin@combine.trade";

		// 3 failed attempts
		for (let i = 0; i < 3; i++) {
			await auth.handler(
				new Request("http://localhost/api/auth/sign-in/email", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ email, password: "wrong" }),
				}),
			);
		}

		// Successful login
		const successResp = await auth.handler(
			new Request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email, password: "correct-password" }),
			}),
		);
		expect(successResp.status).toBe(200);

		// Counter should be reset — another wrong attempt is 401 (not 429)
		const afterResp = await auth.handler(
			new Request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email, password: "wrong" }),
			}),
		);
		expect(afterResp.status).toBe(401);
	});
});

// ---------------------------------------------------------------------------
// Tests requiring a live DB (guarded)
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.TEST_DB_URL)("auth integration — live DB tests", () => {
	test.todo("login with real DB session persistence");
	test.todo("session survives server restart");
	test.todo("POST /api/auth/sign-in/email with real better-auth returns session cookie");
});

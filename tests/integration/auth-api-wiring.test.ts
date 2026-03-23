/**
 * Auth + API wiring integration test (T-195).
 *
 * Tests the full login → CRUD → logout → 401 flow against a real database.
 * Uses DATABASE_URL_TEST to avoid touching the production DB.
 *
 * Prerequisites:
 *   - DATABASE_URL_TEST set in .env
 *   - Test DB has migrations applied (shares migrate-on-startup logic)
 *   - bun run db:seed:admin must have run against the test DB once
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createAuth } from "@combine/shared/auth/better-auth.js";
import {
	authAccount,
	authSession,
	authUser,
	authVerification,
} from "../../db/schema/better-auth.js";
import { DrizzleStrategyRepository } from "@combine/core/strategy/drizzle-repository.js";
import { ExecutionModeDbService } from "@combine/execution/mode-db.js";
import { createApiServer } from "../../apps/api/src/server.js";
import { createStrategyDbDeps } from "../../apps/api/src/db/strategy-glue.js";
import { createExecutionModeDbDeps } from "../../apps/api/src/db/execution-glue.js";
import { createKillSwitchDeps } from "../../apps/api/src/db/kill-switch-glue.js";
import { createEventDeps } from "../../apps/api/src/db/events-queries.js";
import { createOrderDeps } from "../../apps/api/src/db/orders-queries.js";
import { createCandleDeps } from "../../apps/api/src/db/candles-queries.js";
import { createAlertDeps } from "../../apps/api/src/db/alerts-queries.js";
import { createCredentialDeps } from "../../apps/api/src/db/credentials-queries.js";
import { createJournalDeps } from "../../apps/api/src/db/journals-queries.js";
import { createPaperDeps } from "../../apps/api/src/db/paper-queries.js";
import { createBacktestDeps } from "../../apps/api/src/db/backtest-queries.js";
import { createSseBridge } from "../../apps/api/src/db/sse-bridge.js";
import * as schema from "../../db/schema/index.js";

const TEST_PORT = 13101;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const ADMIN_EMAIL = "admin@combine.trade";
const ADMIN_PASSWORD = "changeme-on-first-login";
const MASTER_KEY = process.env.MASTER_ENCRYPTION_KEY ?? "0".repeat(64);

let testPool: ReturnType<typeof postgres>;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let server: ReturnType<typeof createApiServer>;

beforeAll(async () => {
	const testUrl = process.env.DATABASE_URL_TEST;
	if (!testUrl) throw new Error("DATABASE_URL_TEST is required for integration tests");

	testPool = postgres(testUrl);
	testDb = drizzle(testPool, { schema });

	// Apply migrations to test DB
	await migrate(testDb, { migrationsFolder: "./db/migrations" });

	// Build server with test DB
	const auth = createAuth({
		database: drizzleAdapter(testDb, {
			provider: "pg",
			schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification },
		}),
		baseURL: BASE_URL,
		trustedOrigins: [BASE_URL],
	});
	const { sseSubscribe } = createSseBridge();

	server = createApiServer({
		auth,
		masterEncryptionKey: MASTER_KEY,
		strategyRepository: new DrizzleStrategyRepository(createStrategyDbDeps(testDb as any)),
		executionModeDeps: new ExecutionModeDbService(createExecutionModeDbDeps(testDb as any)),
		killSwitchDeps: createKillSwitchDeps(testDb as any),
		sseSubscribe,
		credentialDeps: createCredentialDeps(testDb as any, MASTER_KEY),
		eventDeps: createEventDeps(testDb as any),
		orderDeps: createOrderDeps(testDb as any),
		candleDeps: createCandleDeps(testDb as any),
		alertDeps: createAlertDeps(testDb as any),
		backtestDeps: createBacktestDeps(testDb as any),
		journalDeps: createJournalDeps(testDb as any),
		paperDeps: createPaperDeps(testDb as any),
	});

	server.listen(TEST_PORT);

	// Create admin user via sign-up API (uses better-auth's own scrypt hashing)
	await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name: "Admin", email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
	});
});

afterAll(async () => {
	// Cleanup: remove test data (FK order: children before parents)
	await testDb.delete(schema.strategies);
	await testDb.delete(schema.authSession);
	await testDb.delete(schema.authAccount);
	await testDb.delete(schema.authUser);

	server.stop();
	await testPool.end();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(email: string, password: string): Promise<{ cookie: string }> {
	const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password }),
	});
	expect(res.status).toBe(200);
	const setCookie = res.headers.get("set-cookie") ?? "";
	return { cookie: setCookie };
}

async function logout(cookie: string): Promise<void> {
	await fetch(`${BASE_URL}/api/auth/sign-out`, {
		method: "POST",
		headers: { cookie },
	});
}

// ---------------------------------------------------------------------------
// Test 1: Health check (no auth)
// ---------------------------------------------------------------------------

describe("health", () => {
	test("GET /api/v1/health → 200 without credentials", async () => {
		const res = await fetch(`${BASE_URL}/api/v1/health`);
		expect(res.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// Test 2: Login → authenticated API → logout → 401
// ---------------------------------------------------------------------------

describe("login flow", () => {
	test("full auth cycle", async () => {
		// Unauthenticated: strategies should return 401
		const unauth = await fetch(`${BASE_URL}/api/v1/strategies`);
		expect(unauth.status).toBe(401);

		// Login with admin credentials
		const { cookie } = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
		expect(cookie).toBeTruthy();

		// Authenticated: strategies should return 200
		const authed = await fetch(`${BASE_URL}/api/v1/strategies`, {
			headers: { cookie },
		});
		expect(authed.status).toBe(200);
		const body = await authed.json();
		expect(body.data).toBeInstanceOf(Array);

		// Logout
		await logout(cookie);

		// After logout: same cookie should return 401
		const afterLogout = await fetch(`${BASE_URL}/api/v1/strategies`, {
			headers: { cookie },
		});
		expect(afterLogout.status).toBe(401);
	});
});

// ---------------------------------------------------------------------------
// Test 3: CRUD flow
// ---------------------------------------------------------------------------

describe("CRUD flow", () => {
	test("create and list strategies", async () => {
		const { cookie } = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

		// Create strategy
		const createRes = await fetch(`${BASE_URL}/api/v1/strategies`, {
			method: "POST",
			headers: { "Content-Type": "application/json", cookie },
			body: JSON.stringify({
				name: "Test Strategy",
				code: "return null;",
				symbols: ["BTCUSDT"],
				timeframe: "1h",
				direction: "both",
				featuresDefinition: [],
				normalizationConfig: {},
				searchConfig: {},
				resultConfig: {},
				decisionConfig: {},
			}),
		});
		expect(createRes.status).toBe(201);
		const created = await createRes.json();
		expect(created.data.name).toBe("Test Strategy");

		// List strategies — should include created one
		const listRes = await fetch(`${BASE_URL}/api/v1/strategies`, {
			headers: { cookie },
		});
		expect(listRes.status).toBe(200);
		const list = await listRes.json();
		expect(list.data.some((s: { name: string }) => s.name === "Test Strategy")).toBe(true);

		// Kill switch status
		const ksRes = await fetch(`${BASE_URL}/api/v1/risk/kill-switch/status`, {
			headers: { cookie },
		});
		expect(ksRes.status).toBe(200);

		await logout(cookie);
	});
});

// ---------------------------------------------------------------------------
// Test 4: User isolation
// ---------------------------------------------------------------------------

describe("user isolation", () => {
	test("User A strategy not visible to User B", async () => {
		// Register User A
		await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "User A",
				email: "user-a@test.combine.trade",
				password: "passwordA123!",
			}),
		});

		// Register User B
		await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "User B",
				email: "user-b@test.combine.trade",
				password: "passwordB123!",
			}),
		});

		const { cookie: cookieA } = await login("user-a@test.combine.trade", "passwordA123!");
		const { cookie: cookieB } = await login("user-b@test.combine.trade", "passwordB123!");

		// User A creates a strategy
		const createRes = await fetch(`${BASE_URL}/api/v1/strategies`, {
			method: "POST",
			headers: { "Content-Type": "application/json", cookie: cookieA },
			body: JSON.stringify({
				name: "UserA Private Strategy",
				code: "return null;",
				symbols: ["ETHUSDT"],
				timeframe: "4h",
				direction: "long",
				featuresDefinition: [],
				normalizationConfig: {},
				searchConfig: {},
				resultConfig: {},
				decisionConfig: {},
			}),
		});
		expect(createRes.status).toBe(201);

		// User B lists strategies — should NOT see User A's strategy
		const listRes = await fetch(`${BASE_URL}/api/v1/strategies`, {
			headers: { cookie: cookieB },
		});
		expect(listRes.status).toBe(200);
		const list = await listRes.json();
		expect(list.data.every((s: { name: string }) => s.name !== "UserA Private Strategy")).toBe(true);

		await logout(cookieA);
		await logout(cookieB);
	});
});

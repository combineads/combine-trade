import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import {
	type Credential,
	type CredentialRouteDeps,
	credentialRoutes,
} from "../src/routes/credentials.js";

const MASTER_KEY = "test-master-key-for-encryption-32chars!";

function makeCred(overrides: Partial<Credential> = {}): Credential {
	return {
		id: "cred-1",
		userId: "default-user",
		exchange: "binance",
		label: "main account",
		isActive: true,
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		...overrides,
	};
}

function createMockDeps(): CredentialRouteDeps {
	const creds = new Map<string, Credential>();
	creds.set("cred-1", makeCred());

	return {
		masterKey: MASTER_KEY,
		findByUserId: async (userId: string) => [...creds.values()].filter((c) => c.userId === userId),
		findById: async (id: string) => creds.get(id) ?? null,
		create: async (input) => {
			const cred = makeCred({
				id: "cred-new",
				exchange: input.exchange,
				label: input.label,
			});
			creds.set(cred.id, cred);
			return cred;
		},
		update: async (id: string, input: { label?: string; isActive?: boolean }) => {
			const existing = creds.get(id);
			if (!existing) throw new Error("not found");
			const updated = { ...existing, ...input, updatedAt: new Date() };
			creds.set(id, updated);
			return updated;
		},
		remove: async (id: string) => {
			creds.delete(id);
		},
	};
}

function createApp(deps?: CredentialRouteDeps) {
	return new Elysia().use(errorHandlerPlugin).use(credentialRoutes(deps ?? createMockDeps()));
}

const BASE = "http://localhost/api/v1/credentials";

describe("Credential routes", () => {
	test("GET / returns user credentials", async () => {
		const app = createApp();
		const res = await app.handle(new Request(BASE));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].exchange).toBe("binance");
	});

	test("POST / creates encrypted credential", async () => {
		const app = createApp();
		const res = await app.handle(
			new Request(BASE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					exchange: "bybit",
					apiKey: "my-api-key",
					apiSecret: "my-api-secret",
					label: "test",
				}),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.exchange).toBe("bybit");
		// API key/secret must NOT be in response
		expect(JSON.stringify(body)).not.toContain("my-api-key");
		expect(JSON.stringify(body)).not.toContain("my-api-secret");
	});

	test("PUT /:id updates label", async () => {
		const app = createApp();
		const res = await app.handle(
			new Request(`${BASE}/cred-1`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ label: "updated label" }),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.label).toBe("updated label");
	});

	test("PUT /:id deactivates credential", async () => {
		const app = createApp();
		const res = await app.handle(
			new Request(`${BASE}/cred-1`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ isActive: false }),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.isActive).toBe(false);
	});

	test("PUT /:id returns 404 for unknown", async () => {
		const app = createApp();
		const res = await app.handle(
			new Request(`${BASE}/nonexistent`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ label: "x" }),
			}),
		);
		expect(res.status).toBe(404);
	});

	test("DELETE /:id removes credential", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/cred-1`, { method: "DELETE" }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.deleted).toBe(true);
	});

	test("DELETE /:id returns 404 for unknown", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/nonexistent`, { method: "DELETE" }));
		expect(res.status).toBe(404);
	});
});

import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
	createAuthApiClient,
	type AuthApiClientOptions,
} from "../src/auth/auth-api-client.js";

describe("createAuthApiClient", () => {
	let fetchMock: ReturnType<typeof mock>;
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		fetchMock = mock(() =>
			Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
	});

	test("attaches Bearer token header when token available", async () => {
		const client = createAuthApiClient({
			baseUrl: "http://localhost:3000",
			getToken: () => "my-token",
			onUnauthorized: mock(() => Promise.resolve()),
		});

		await client.get("/api/v1/test");

		const callArgs = fetchMock.mock.calls[0];
		const url = callArgs[0] as string;
		const init = callArgs[1] as RequestInit;
		expect(url).toBe("http://localhost:3000/api/v1/test");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer my-token");

		globalThis.fetch = originalFetch;
	});

	test("does not attach Authorization when no token", async () => {
		const client = createAuthApiClient({
			baseUrl: "http://localhost:3000",
			getToken: () => null,
			onUnauthorized: mock(() => Promise.resolve()),
		});

		await client.get("/api/v1/test");

		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect((init.headers as Record<string, string>).Authorization).toBeUndefined();

		globalThis.fetch = originalFetch;
	});

	test("calls onUnauthorized and retries once on 401", async () => {
		const onUnauthorized = mock(() => Promise.resolve());
		let callCount = 0;
		fetchMock = mock(() => {
			callCount++;
			if (callCount === 1) {
				return Promise.resolve(new Response("{}", { status: 401 }));
			}
			return Promise.resolve(new Response(JSON.stringify({ data: "ok" }), { status: 200 }));
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const client = createAuthApiClient({
			baseUrl: "http://localhost:3000",
			getToken: () => "old-token",
			onUnauthorized,
		});

		const result = await client.get<{ data: string }>("/api/v1/test");
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		expect(result.data).toBe("ok");
		expect(fetchMock).toHaveBeenCalledTimes(2);

		globalThis.fetch = originalFetch;
	});

	test("throws on second 401 (no infinite retry)", async () => {
		const onUnauthorized = mock(() => Promise.resolve());
		fetchMock = mock(() =>
			Promise.resolve(new Response("{}", { status: 401 })),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const client = createAuthApiClient({
			baseUrl: "http://localhost:3000",
			getToken: () => "token",
			onUnauthorized,
		});

		expect(client.get("/api/v1/test")).rejects.toThrow();

		globalThis.fetch = originalFetch;
	});
});

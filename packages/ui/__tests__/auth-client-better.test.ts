import { describe, expect, test } from "bun:test";
import {
	type BetterAuthClientInstance,
	createBetterAuthClient,
} from "../src/auth/better-auth-client.js";

describe("createBetterAuthClient", () => {
	test("returns an object with the expected shape", () => {
		const client = createBetterAuthClient({ baseURL: "http://localhost:3100" });
		expect(typeof client).toBe("object");
		expect(client).not.toBeNull();
	});

	test("exposes signIn method", () => {
		const client = createBetterAuthClient({ baseURL: "http://localhost:3100" });
		// signIn is a callable function that also has named sub-methods (e.g. .email)
		expect(typeof client.signIn).toBe("function");
		expect(typeof (client.signIn as unknown as Record<string, unknown>).email).toBe("function");
	});

	test("exposes signOut method", () => {
		const client = createBetterAuthClient({ baseURL: "http://localhost:3100" });
		expect(typeof client.signOut).toBe("function");
	});

	test("exposes useSession hook", () => {
		const client = createBetterAuthClient({ baseURL: "http://localhost:3100" });
		expect(typeof client.useSession).toBe("function");
	});

	test("exposes getSession method", () => {
		const client = createBetterAuthClient({ baseURL: "http://localhost:3100" });
		expect(typeof client.getSession).toBe("function");
	});

	test("baseURL is configurable", () => {
		const client1 = createBetterAuthClient({ baseURL: "http://localhost:3100" });
		const client2 = createBetterAuthClient({ baseURL: "https://api.example.com" });
		// Both should be valid client instances (not throw during creation)
		expect(client1).toBeDefined();
		expect(client2).toBeDefined();
	});

	test("BetterAuthClientInstance type includes expected keys", () => {
		// Type-level check — creating an instance satisfying the interface
		const client: BetterAuthClientInstance = createBetterAuthClient({
			baseURL: "http://localhost:3100",
		});
		expect(client.signIn).toBeDefined();
		expect(client.signOut).toBeDefined();
		expect(client.useSession).toBeDefined();
		expect(client.getSession).toBeDefined();
	});
});

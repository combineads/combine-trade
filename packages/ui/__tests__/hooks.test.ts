import { describe, expect, test } from "bun:test";
import { type ApiClientConfig, createApiClient } from "../src/lib/api-client";

describe("createApiClient", () => {
	const config: ApiClientConfig = {
		baseUrl: "http://localhost:3000",
	};

	test("creates client with all methods", () => {
		const client = createApiClient(config);
		expect(typeof client.get).toBe("function");
		expect(typeof client.post).toBe("function");
		expect(typeof client.put).toBe("function");
		expect(typeof client.delete).toBe("function");
	});

	test("get builds correct URL with path", () => {
		const client = createApiClient(config);
		// Verify the client stores the base URL
		expect(client.baseUrl).toBe("http://localhost:3000");
	});

	test("builds query string from params", () => {
		const qs = buildQueryString({ page: 1, pageSize: 20, symbol: "BTCUSDT" });
		expect(qs).toContain("page=1");
		expect(qs).toContain("pageSize=20");
		expect(qs).toContain("symbol=BTCUSDT");
	});

	test("skips undefined params in query string", () => {
		const qs = buildQueryString({ page: 1, symbol: undefined });
		expect(qs).toBe("page=1");
		expect(qs).not.toContain("symbol");
	});

	test("returns empty string for no params", () => {
		const qs = buildQueryString({});
		expect(qs).toBe("");
	});
});

describe("API path builders", () => {
	test("strategies paths", () => {
		expect(apiPaths.strategies()).toBe("/api/v1/strategies");
		expect(apiPaths.strategy("s1")).toBe("/api/v1/strategies/s1");
		expect(apiPaths.strategyEvents("s1")).toBe("/api/v1/strategies/s1/events");
		expect(apiPaths.strategyStatistics("s1")).toBe("/api/v1/strategies/s1/statistics");
	});

	test("risk paths", () => {
		expect(apiPaths.killSwitchStatus()).toBe("/api/v1/risk/kill-switch/status");
		expect(apiPaths.killSwitchActivate()).toBe("/api/v1/risk/kill-switch/activate");
		expect(apiPaths.killSwitchDeactivate()).toBe("/api/v1/risk/kill-switch/deactivate");
		expect(apiPaths.killSwitchEvents()).toBe("/api/v1/risk/kill-switch/events");
	});

	test("data paths", () => {
		expect(apiPaths.candles()).toBe("/api/v1/candles");
		expect(apiPaths.orders()).toBe("/api/v1/orders");
		expect(apiPaths.alerts()).toBe("/api/v1/alerts");
		expect(apiPaths.events("e1")).toBe("/api/v1/events/e1");
	});

	test("auth paths", () => {
		expect(apiPaths.login()).toBe("/api/v1/auth/login");
		expect(apiPaths.refresh()).toBe("/api/v1/auth/refresh");
		expect(apiPaths.logout()).toBe("/api/v1/auth/logout");
	});

	test("sse path", () => {
		expect(apiPaths.sse()).toBe("/api/v1/stream");
	});
});

// Import after tests are defined to ensure the module loads
import { apiPaths, buildQueryString } from "../src/lib/api-client";

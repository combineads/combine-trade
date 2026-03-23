import { describe, expect, test } from "bun:test";

describe("useSSE types and module", () => {
	test("exports SSEStatus type values", async () => {
		const mod = await import("../src/hooks/use-sse");
		expect(mod.useSSE).toBeDefined();
		expect(typeof mod.useSSE).toBe("function");
	});

	test("SSE hook returns correct shape", async () => {
		const { useSSE } = await import("../src/hooks/use-sse");
		// SSR environment — no EventSource. Hook should return safe defaults.
		const result = useSSE({ url: "/api/v1/stream/events" });
		expect(result.lastEvent).toBeNull();
		expect(result.events).toEqual([]);
		expect(result.status).toBe("closed");
		expect(result.reconnectCount).toBe(0);
		expect(typeof result.close).toBe("function");
	});

	test("hook respects enabled=false", async () => {
		const { useSSE } = await import("../src/hooks/use-sse");
		const result = useSSE({ url: "/api/v1/stream", enabled: false });
		expect(result.status).toBe("closed");
		expect(result.events).toEqual([]);
	});
});

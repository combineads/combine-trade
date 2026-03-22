import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { type SseEvent, type SseRouteDeps, sseRoutes } from "../src/routes/sse.js";

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
	};
}

function createApp(deps: SseRouteDeps) {
	return new Elysia().use(sseRoutes(deps));
}

describe("SSE routes", () => {
	test("GET /stream returns event-stream content type", async () => {
		const deps = createMockDeps();
		const app = createApp(deps);
		const res = await app.handle(new Request("http://localhost/api/v1/stream"));
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/event-stream");
	});

	test("GET /stream sends initial heartbeat", async () => {
		const deps = createMockDeps();
		const app = createApp(deps);
		const res = await app.handle(new Request("http://localhost/api/v1/stream"));

		const reader = res.body?.getReader();
		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);

		expect(text).toContain("event: heartbeat");
		expect(text).toContain('"time"');
		reader.cancel();
	});

	test("GET /stream receives pushed events", async () => {
		const deps = createMockDeps();
		const app = createApp(deps);
		const res = await app.handle(new Request("http://localhost/api/v1/stream"));

		const reader = res.body?.getReader();
		// Read initial heartbeat
		await reader.read();

		// Push a decision event
		deps.emit({ type: "decision", data: { strategyId: "s1", action: "LONG" } });

		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);
		expect(text).toContain("event: decision");
		expect(text).toContain("LONG");
		reader.cancel();
	});

	test("subscribe returns unsubscribe function", () => {
		const deps = createMockDeps();
		const events: SseEvent[] = [];
		const unsub = deps.subscribe((e) => events.push(e));

		deps.emit({ type: "alert", data: {} });
		expect(events).toHaveLength(1);

		unsub();
		deps.emit({ type: "alert", data: {} });
		expect(events).toHaveLength(1);
	});
});

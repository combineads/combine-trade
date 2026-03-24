import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import type { SseEvent, SseRouteDeps } from "../src/routes/sse.js";
import { sseRoutes } from "../src/routes/sse.js";
import { createMockAuth, makeAuthHeaders } from "./helpers/auth.js";

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
			findAll: async () => [],
			findById: async () => null,
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

describe("SSE routes", () => {
	test("GET /stream returns event-stream content type", async () => {
		const deps = createMockDeps();
		const app = createApp(deps);
		const headers = await makeAuthHeaders();
		const res = await app.handle(new Request("http://localhost/api/v1/stream", { headers }));
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/event-stream");
	});

	test("GET /stream sends initial heartbeat", async () => {
		const deps = createMockDeps();
		const app = createApp(deps);
		const headers = await makeAuthHeaders();
		const res = await app.handle(new Request("http://localhost/api/v1/stream", { headers }));

		const reader = res.body?.getReader();
		const { value } = await reader.read();
		const text = new TextDecoder().decode(value);

		expect(text).toContain("event: heartbeat");
		expect(text).toContain('"time"');
		reader.cancel();
	});

	test("GET /stream receives pushed events", async () => {
		const deps = createMockDeps();
		// Give user a strategy so decision events are forwarded
		deps.strategyRepository.findActive = async () => [
			{
				id: "s1",
				version: 1,
				name: "S1",
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
		const app = createApp(deps);
		const headers = await makeAuthHeaders();
		const res = await app.handle(new Request("http://localhost/api/v1/stream", { headers }));

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

	test("GET /stream returns 401 without auth", async () => {
		const deps = createMockDeps();
		const app = createApp(deps);
		const res = await app.handle(new Request("http://localhost/api/v1/stream"));
		expect(res.status).toBe(401);
	});
});

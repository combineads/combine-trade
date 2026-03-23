import { describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import { type KillSwitchRouteDeps, killSwitchRoutes } from "../src/routes/kill-switch.js";
import { TEST_USER_ID, withMockUserId } from "./helpers/auth.js";

function makeDeps(overrides: Partial<KillSwitchRouteDeps> = {}): KillSwitchRouteDeps {
	return {
		activate: mock(() =>
			Promise.resolve({
				id: "ks-1",
				scope: "global" as const,
				scopeTarget: null,
				active: true,
				triggeredBy: "manual" as const,
				triggeredAt: new Date("2026-03-22T12:00:00Z"),
				requiresAcknowledgment: true,
				acknowledgedAt: null,
			}),
		),
		deactivate: mock(() =>
			Promise.resolve({
				id: "ks-1",
				scope: "global" as const,
				scopeTarget: null,
				active: false,
				triggeredBy: "manual" as const,
				triggeredAt: new Date("2026-03-22T12:00:00Z"),
				requiresAcknowledgment: false,
				acknowledgedAt: null,
			}),
		),
		getActiveStates: mock(() =>
			Promise.resolve([
				{
					id: "ks-1",
					scope: "global" as const,
					scopeTarget: null,
					active: true,
					triggeredBy: "manual" as const,
					triggeredAt: new Date("2026-03-22T12:00:00Z"),
					requiresAcknowledgment: true,
					acknowledgedAt: null,
				},
			]),
		),
		getAuditEvents: mock(() =>
			Promise.resolve({
				items: [
					{
						id: "evt-1",
						scope: "global",
						triggerType: "manual",
						triggerDetail: "Manual activation",
						triggeredAt: new Date("2026-03-22T12:00:00Z"),
						deactivatedAt: null,
					},
				],
				total: 1,
			}),
		),
		...overrides,
	};
}

function createApp(deps: KillSwitchRouteDeps) {
	return new Elysia().use(withMockUserId()).use(errorHandlerPlugin).use(killSwitchRoutes(deps));
}

describe("kill switch routes", () => {
	test("POST /activate creates kill switch", async () => {
		const deps = makeDeps();
		const app = createApp(deps);

		const res = await app.handle(
			new Request("http://localhost/api/v1/risk/kill-switch/activate", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ scope: "global", trigger: "manual" }),
			}),
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.id).toBe("ks-1");
		expect(body.data.active).toBe(true);
		expect(deps.activate).toHaveBeenCalledTimes(1);
	});

	test("POST /activate with strategy scope passes scopeTarget and userId", async () => {
		const deps = makeDeps();
		const app = createApp(deps);

		await app.handle(
			new Request("http://localhost/api/v1/risk/kill-switch/activate", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ scope: "strategy", scopeTarget: "strat-1", trigger: "loss_limit" }),
			}),
		);

		const call = (deps.activate as ReturnType<typeof mock>).mock.calls[0];
		expect(call[0]).toBe("strategy");
		expect(call[1]).toBe("strat-1");
		expect(call[2]).toBe("loss_limit");
		expect(call[3]).toBe(TEST_USER_ID);
	});

	test("POST /deactivate deactivates kill switch with userId", async () => {
		const deps = makeDeps();
		const app = createApp(deps);

		const res = await app.handle(
			new Request("http://localhost/api/v1/risk/kill-switch/deactivate", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: "ks-1" }),
			}),
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.active).toBe(false);
		expect(deps.deactivate).toHaveBeenCalledWith("ks-1", TEST_USER_ID);
	});

	test("GET /status returns active states with userId", async () => {
		const deps = makeDeps();
		const app = createApp(deps);

		const res = await app.handle(new Request("http://localhost/api/v1/risk/kill-switch/status"));

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toHaveLength(1);
		expect(body.data[0].scope).toBe("global");
		expect(deps.getActiveStates).toHaveBeenCalledWith(TEST_USER_ID);
	});

	test("GET /events returns paginated audit events with userId", async () => {
		const deps = makeDeps();
		const app = createApp(deps);

		const res = await app.handle(
			new Request("http://localhost/api/v1/risk/kill-switch/events?page=1&pageSize=10"),
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toHaveLength(1);
		expect(body.meta.total).toBe(1);
		const call = (deps.getAuditEvents as ReturnType<typeof mock>).mock.calls[0];
		expect(call[2]).toBe(TEST_USER_ID);
	});

	test("POST /deactivate with not-found returns error", async () => {
		const deps = makeDeps({
			deactivate: mock(() => Promise.reject(new Error("Kill switch not found: ks-999"))),
		});
		const app = createApp(deps);

		const res = await app.handle(
			new Request("http://localhost/api/v1/risk/kill-switch/deactivate", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: "ks-999" }),
			}),
		);

		expect(res.status).toBe(500);
	});
});

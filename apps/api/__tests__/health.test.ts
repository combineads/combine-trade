import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { healthRoute } from "../src/routes/health.js";

const app = new Elysia().use(healthRoute);

describe("Health endpoint", () => {
	test("GET /api/v1/health returns 200 with status ok", async () => {
		const res = await app.handle(new Request("http://localhost/api/v1/health"));
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.status).toBe("ok");
		expect(typeof body.timestamp).toBe("string");
	});

	test("health response has valid ISO timestamp", async () => {
		const res = await app.handle(new Request("http://localhost/api/v1/health"));
		const body = await res.json();
		const date = new Date(body.timestamp);
		expect(date.toISOString()).toBe(body.timestamp);
	});

	test("unknown route returns 404", async () => {
		const res = await app.handle(new Request("http://localhost/api/v1/unknown"));
		expect(res.status).toBe(404);
	});
});

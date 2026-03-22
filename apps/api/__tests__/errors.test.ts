import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
	ApiError,
	ConflictError,
	ForbiddenError,
	NotFoundError,
	UnauthorizedError,
	ValidationError,
	errorHandlerPlugin,
} from "../src/lib/errors.js";
import { ok, paginated } from "../src/lib/response.js";

describe("ApiError", () => {
	test("constructor sets status, code, message, name", () => {
		const err = new ApiError(400, "BAD_REQUEST", "bad");
		expect(err.status).toBe(400);
		expect(err.code).toBe("BAD_REQUEST");
		expect(err.message).toBe("bad");
		expect(err.name).toBe("ApiError");
		expect(err).toBeInstanceOf(Error);
	});

	test("NotFoundError defaults", () => {
		const err = new NotFoundError();
		expect(err.status).toBe(404);
		expect(err.code).toBe("NOT_FOUND");
		expect(err.name).toBe("NotFoundError");
	});

	test("UnauthorizedError defaults", () => {
		const err = new UnauthorizedError();
		expect(err.status).toBe(401);
		expect(err.code).toBe("UNAUTHORIZED");
	});

	test("ValidationError defaults", () => {
		const err = new ValidationError();
		expect(err.status).toBe(422);
		expect(err.code).toBe("VALIDATION_ERROR");
	});

	test("ForbiddenError defaults", () => {
		const err = new ForbiddenError();
		expect(err.status).toBe(403);
		expect(err.code).toBe("FORBIDDEN");
	});

	test("ConflictError defaults", () => {
		const err = new ConflictError();
		expect(err.status).toBe(409);
		expect(err.code).toBe("CONFLICT");
	});
});

describe("Response helpers", () => {
	test("ok wraps data", () => {
		const result = ok({ id: 1 });
		expect(result).toEqual({ data: { id: 1 } });
	});

	test("paginated returns correct meta", () => {
		const items = [1, 2, 3];
		const result = paginated(items, 25, 2, 10);
		expect(result.data).toEqual([1, 2, 3]);
		expect(result.meta).toEqual({
			total: 25,
			page: 2,
			pageSize: 10,
			totalPages: 3,
		});
	});

	test("paginated totalPages rounds up", () => {
		const result = paginated([], 11, 1, 5);
		expect(result.meta.totalPages).toBe(3);
	});
});

describe("errorHandlerPlugin", () => {
	test("ApiError → correct status and body", async () => {
		const app = new Elysia().use(errorHandlerPlugin).get("/fail", () => {
			throw new NotFoundError("item not found");
		});

		const res = await app.handle(new Request("http://localhost/fail"));
		expect(res.status).toBe(404);
		const body = JSON.parse(await res.text());
		expect(body).toEqual({ error: { code: "NOT_FOUND", message: "item not found" } });
	});

	test("unexpected Error → 500 INTERNAL_ERROR", async () => {
		const app = new Elysia().use(errorHandlerPlugin).get("/crash", () => {
			throw new Error("oops");
		});

		const res = await app.handle(new Request("http://localhost/crash"));
		expect(res.status).toBe(500);
		const body = JSON.parse(await res.text());
		expect(body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
	});
});

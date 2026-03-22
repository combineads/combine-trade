import { describe, expect, test } from "bun:test";
import { BaseError, FatalError, RetryableError, SystemError, UserError } from "../index.js";

describe("Error taxonomy", () => {
	test("RetryableError requires ERR_RETRY_ prefix", () => {
		const err = new RetryableError("ERR_RETRY_NETWORK", "connection timeout");
		expect(err.code).toBe("ERR_RETRY_NETWORK");
		expect(err.message).toBe("connection timeout");
		expect(err.maxRetries).toBe(3);
		expect(err).toBeInstanceOf(BaseError);
		expect(err).toBeInstanceOf(RetryableError);
	});

	test("RetryableError rejects wrong prefix", () => {
		expect(() => new RetryableError("ERR_FATAL_X", "bad")).toThrow(
			"RetryableError code must start with ERR_RETRY_",
		);
	});

	test("RetryableError accepts custom maxRetries", () => {
		const err = new RetryableError("ERR_RETRY_RATE_LIMIT", "rate limited", 5);
		expect(err.maxRetries).toBe(5);
	});

	test("FatalError requires ERR_FATAL_ prefix", () => {
		const err = new FatalError("ERR_FATAL_INVALID_KEY", "invalid API key");
		expect(err.code).toBe("ERR_FATAL_INVALID_KEY");
		expect(err).toBeInstanceOf(BaseError);
	});

	test("FatalError rejects wrong prefix", () => {
		expect(() => new FatalError("ERR_USER_X", "bad")).toThrow(
			"FatalError code must start with ERR_FATAL_",
		);
	});

	test("UserError requires ERR_USER_ prefix", () => {
		const err = new UserError("ERR_USER_INVALID_SYMBOL", "unsupported symbol");
		expect(err.code).toBe("ERR_USER_INVALID_SYMBOL");
		expect(err).toBeInstanceOf(BaseError);
	});

	test("UserError rejects wrong prefix", () => {
		expect(() => new UserError("ERR_SYS_X", "bad")).toThrow(
			"UserError code must start with ERR_USER_",
		);
	});

	test("SystemError requires ERR_SYS_ prefix", () => {
		const err = new SystemError("ERR_SYS_OOM", "out of memory");
		expect(err.code).toBe("ERR_SYS_OOM");
		expect(err).toBeInstanceOf(BaseError);
	});

	test("SystemError rejects wrong prefix", () => {
		expect(() => new SystemError("ERR_RETRY_X", "bad")).toThrow(
			"SystemError code must start with ERR_SYS_",
		);
	});

	test("BaseError.toJSON returns structured object", () => {
		const err = new FatalError("ERR_FATAL_TEST", "test error");
		const json = err.toJSON();
		expect(json.name).toBe("FatalError");
		expect(json.code).toBe("ERR_FATAL_TEST");
		expect(json.message).toBe("test error");
		expect(json.timestamp).toBeDefined();
		expect(json.stack).toBeDefined();
	});

	test("Error cause chain works", () => {
		const cause = new Error("root cause");
		const err = new RetryableError("ERR_RETRY_DB", "db timeout", 3, { cause });
		expect(err.cause).toBe(cause);
	});
});

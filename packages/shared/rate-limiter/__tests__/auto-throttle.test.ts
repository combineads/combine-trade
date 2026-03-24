import { describe, expect, mock, test } from "bun:test";
import { TokenBucket } from "../token-bucket.js";
import {
	AutoThrottleExhaustedError,
	ThrottleBackoff,
	is429Error,
	withThrottle,
} from "../auto-throttle.js";

describe("is429Error", () => {
	test("detects HTTP 429 status on error object", () => {
		const err = Object.assign(new Error("Too Many Requests"), { status: 429 });
		expect(is429Error(err)).toBe(true);
	});

	test("detects HTTP 429 in error message", () => {
		const err = new Error("HTTP 429 Too Many Requests");
		expect(is429Error(err)).toBe(true);
	});

	test("detects rate limit message variants", () => {
		expect(is429Error(new Error("RateLimitExceeded"))).toBe(true);
		expect(is429Error(new Error("rate limit exceeded"))).toBe(true);
		expect(is429Error(new Error("Too many requests"))).toBe(true);
	});

	test("returns false for non-429 errors", () => {
		expect(is429Error(new Error("Network error"))).toBe(false);
		expect(is429Error(new Error("Invalid symbol"))).toBe(false);
		expect(is429Error(Object.assign(new Error("Forbidden"), { status: 403 }))).toBe(false);
	});

	test("returns false for non-Error values", () => {
		expect(is429Error("string error")).toBe(false);
		expect(is429Error(null)).toBe(false);
		expect(is429Error(undefined)).toBe(false);
	});
});

describe("ThrottleBackoff", () => {
	test("first delay is initialMs", () => {
		const backoff = new ThrottleBackoff({ initialMs: 1000, maxMs: 30000, factor: 2 });
		expect(backoff.nextDelay()).toBe(1000);
	});

	test("doubles each call", () => {
		const backoff = new ThrottleBackoff({ initialMs: 1000, maxMs: 30000, factor: 2 });
		expect(backoff.nextDelay()).toBe(1000);
		expect(backoff.nextDelay()).toBe(2000);
		expect(backoff.nextDelay()).toBe(4000);
	});

	test("caps at maxMs", () => {
		const backoff = new ThrottleBackoff({ initialMs: 1000, maxMs: 5000, factor: 2 });
		backoff.nextDelay(); // 1000
		backoff.nextDelay(); // 2000
		backoff.nextDelay(); // 4000
		expect(backoff.nextDelay()).toBe(5000); // capped at 5000
		expect(backoff.nextDelay()).toBe(5000); // stays at cap
	});

	test("reset restarts from initialMs", () => {
		const backoff = new ThrottleBackoff({ initialMs: 1000, maxMs: 30000, factor: 2 });
		backoff.nextDelay(); // 1000
		backoff.nextDelay(); // 2000
		backoff.reset();
		expect(backoff.nextDelay()).toBe(1000);
	});

	test("uses default options if not provided", () => {
		const backoff = new ThrottleBackoff();
		expect(backoff.nextDelay()).toBe(1000);
	});
});

describe("withThrottle", () => {
	test("calls fn and returns result when bucket has tokens", async () => {
		const bucket = new TokenBucket({ capacity: 10, refillRate: 1, refillIntervalMs: 1000 });
		const fn = mock(() => Promise.resolve(42));

		const result = await withThrottle(fn, bucket);

		expect(result).toBe(42);
		expect(fn).toHaveBeenCalledTimes(1);
		// one token consumed
		expect(bucket.available()).toBe(9);
	});

	test("retries on 429 error and succeeds", async () => {
		const bucket = new TokenBucket({ capacity: 10, refillRate: 10, refillIntervalMs: 10 });
		let callCount = 0;

		const fn = mock(() => {
			callCount++;
			if (callCount < 3) {
				const err = Object.assign(new Error("HTTP 429"), { status: 429 });
				return Promise.reject(err);
			}
			return Promise.resolve("success");
		});

		const result = await withThrottle(fn, bucket, {
			maxAttempts: 5,
			backoff: new ThrottleBackoff({ initialMs: 10, maxMs: 50, factor: 2 }),
		});

		expect(result).toBe("success");
		expect(callCount).toBe(3);
	});

	test("throws AutoThrottleExhaustedError after maxAttempts", async () => {
		const bucket = new TokenBucket({ capacity: 10, refillRate: 10, refillIntervalMs: 10 });

		const fn = mock(() => {
			const err = Object.assign(new Error("HTTP 429"), { status: 429 });
			return Promise.reject(err);
		});

		await expect(
			withThrottle(fn, bucket, {
				maxAttempts: 3,
				backoff: new ThrottleBackoff({ initialMs: 5, maxMs: 20, factor: 2 }),
			}),
		).rejects.toThrow(AutoThrottleExhaustedError);

		expect(fn).toHaveBeenCalledTimes(3);
	});

	test("does not retry on non-429 errors", async () => {
		const bucket = new TokenBucket({ capacity: 10, refillRate: 1, refillIntervalMs: 1000 });

		const fn = mock(() => Promise.reject(new Error("Invalid symbol")));

		await expect(withThrottle(fn, bucket)).rejects.toThrow("Invalid symbol");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	test("waits for bucket tokens before calling fn", async () => {
		// Bucket with 0 capacity replenishes quickly — fn should still be called
		const bucket = new TokenBucket({ capacity: 2, refillRate: 2, refillIntervalMs: 20 });
		bucket.tryAcquire(2); // drain all tokens
		expect(bucket.available()).toBe(0);

		const fn = mock(() => Promise.resolve("ok"));

		const start = Date.now();
		const result = await withThrottle(fn, bucket, {
			maxAttempts: 3,
			backoff: new ThrottleBackoff({ initialMs: 5, maxMs: 20, factor: 2 }),
		});
		const elapsed = Date.now() - start;

		expect(result).toBe("ok");
		// Must have waited for refill (at least a few ms)
		expect(elapsed).toBeGreaterThanOrEqual(10);
	});

	test("AutoThrottleExhaustedError includes attempt count", async () => {
		const bucket = new TokenBucket({ capacity: 10, refillRate: 10, refillIntervalMs: 10 });

		const fn = mock(() =>
			Promise.reject(Object.assign(new Error("429"), { status: 429 })),
		);

		try {
			await withThrottle(fn, bucket, {
				maxAttempts: 2,
				backoff: new ThrottleBackoff({ initialMs: 5, maxMs: 10, factor: 2 }),
			});
		} catch (err) {
			expect(err).toBeInstanceOf(AutoThrottleExhaustedError);
			expect((err as AutoThrottleExhaustedError).attempts).toBe(2);
		}
	});
});

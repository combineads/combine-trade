import { describe, expect, test } from "bun:test";
import {
	BINANCE_PROFILE,
	BYBIT_PROFILE,
	ExchangeRateLimiter,
	OKX_PROFILE,
	TokenBucket,
} from "../index.js";

describe("TokenBucket", () => {
	test("starts full (capacity tokens available)", () => {
		const bucket = new TokenBucket({ capacity: 10, refillRate: 1, refillIntervalMs: 1000 });
		expect(bucket.available()).toBe(10);
	});

	test("tryAcquire returns true and decrements tokens", () => {
		const bucket = new TokenBucket({ capacity: 10, refillRate: 1, refillIntervalMs: 1000 });
		const ok = bucket.tryAcquire(3);
		expect(ok).toBe(true);
		expect(bucket.available()).toBe(7);
	});

	test("tryAcquire returns false when insufficient tokens", () => {
		const bucket = new TokenBucket({ capacity: 5, refillRate: 1, refillIntervalMs: 1000 });
		const ok = bucket.tryAcquire(6);
		expect(ok).toBe(false);
		expect(bucket.available()).toBe(5);
	});

	test("tryAcquire defaults to 1 token", () => {
		const bucket = new TokenBucket({ capacity: 5, refillRate: 1, refillIntervalMs: 1000 });
		bucket.tryAcquire();
		expect(bucket.available()).toBe(4);
	});

	test("refills tokens over time", async () => {
		const bucket = new TokenBucket({ capacity: 10, refillRate: 5, refillIntervalMs: 50 });
		bucket.tryAcquire(10); // drain completely
		expect(bucket.available()).toBe(0);

		await new Promise((r) => setTimeout(r, 120));
		bucket.refill(); // force refill check
		expect(bucket.available()).toBeGreaterThanOrEqual(5);
	});

	test("refill does not exceed capacity", async () => {
		const bucket = new TokenBucket({ capacity: 10, refillRate: 100, refillIntervalMs: 50 });
		await new Promise((r) => setTimeout(r, 200));
		bucket.refill();
		expect(bucket.available()).toBeLessThanOrEqual(10);
	});

	test("acquire resolves when tokens become available", async () => {
		const bucket = new TokenBucket({ capacity: 3, refillRate: 3, refillIntervalMs: 50 });
		bucket.tryAcquire(3); // drain
		const start = Date.now();
		await bucket.acquire(1);
		const elapsed = Date.now() - start;
		expect(elapsed).toBeGreaterThanOrEqual(40);
	});

	test("acquire resolves immediately when tokens available", async () => {
		const bucket = new TokenBucket({ capacity: 10, refillRate: 1, refillIntervalMs: 1000 });
		const start = Date.now();
		await bucket.acquire(1);
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(20);
	});

	test("isLow returns true when below 20% capacity", () => {
		const bucket = new TokenBucket({ capacity: 10, refillRate: 1, refillIntervalMs: 1000 });
		bucket.tryAcquire(9); // 1 left = 10%
		expect(bucket.isLow()).toBe(true);
	});

	test("isLow returns false when above 20% capacity", () => {
		const bucket = new TokenBucket({ capacity: 10, refillRate: 1, refillIntervalMs: 1000 });
		bucket.tryAcquire(5); // 5 left = 50%
		expect(bucket.isLow()).toBe(false);
	});
});

describe("ExchangeRateLimiter", () => {
	test("wraps token bucket with named exchange", () => {
		const limiter = new ExchangeRateLimiter("binance", BINANCE_PROFILE);
		expect(limiter.exchangeId).toBe("binance");
	});

	test("tryAcquire delegates to bucket", () => {
		const limiter = new ExchangeRateLimiter("test", {
			capacity: 5,
			refillRate: 1,
			refillIntervalMs: 1000,
		});
		expect(limiter.tryAcquire()).toBe(true);
	});

	test("acquire resolves", async () => {
		const limiter = new ExchangeRateLimiter("test", {
			capacity: 5,
			refillRate: 1,
			refillIntervalMs: 1000,
		});
		await expect(limiter.acquire()).resolves.toBeUndefined();
	});

	test("available returns remaining tokens", () => {
		const limiter = new ExchangeRateLimiter("test", {
			capacity: 10,
			refillRate: 1,
			refillIntervalMs: 1000,
		});
		expect(limiter.available()).toBe(10);
	});
});

describe("Exchange profiles", () => {
	test("BINANCE_PROFILE capacity is 1200", () => {
		expect(BINANCE_PROFILE.capacity).toBe(1200);
	});

	test("OKX_PROFILE capacity is 20", () => {
		expect(OKX_PROFILE.capacity).toBe(20);
	});

	test("BYBIT_PROFILE is defined", () => {
		expect(BYBIT_PROFILE).toBeDefined();
		expect(BYBIT_PROFILE.capacity).toBeGreaterThan(0);
	});
});

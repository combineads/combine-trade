import type { TokenBucketOptions } from "./token-bucket.js";

/**
 * Binance REST API: 1200 requests per minute (weight-based).
 * Refills 1200 tokens every 60 000 ms.
 */
export const BINANCE_PROFILE: TokenBucketOptions = {
	capacity: 1200,
	refillRate: 1200,
	refillIntervalMs: 60_000,
};

/**
 * OKX REST API: 20 requests per second.
 * Refills 20 tokens every 1000 ms.
 */
export const OKX_PROFILE: TokenBucketOptions = {
	capacity: 20,
	refillRate: 20,
	refillIntervalMs: 1_000,
};

/**
 * Bybit REST API: 120 requests per second (default category).
 * Refills 120 tokens every 1000 ms.
 */
export const BYBIT_PROFILE: TokenBucketOptions = {
	capacity: 120,
	refillRate: 120,
	refillIntervalMs: 1_000,
};

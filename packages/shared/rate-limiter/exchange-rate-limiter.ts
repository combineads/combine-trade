import { TokenBucket, type TokenBucketOptions } from "./token-bucket.js";

/**
 * Per-exchange rate limiter backed by a token bucket.
 * Exchange adapters should call `acquire()` before each API request.
 */
export class ExchangeRateLimiter {
	private readonly bucket: TokenBucket;

	constructor(
		readonly exchangeId: string,
		profile: TokenBucketOptions,
	) {
		this.bucket = new TokenBucket(profile);
	}

	/** Current available tokens. */
	available(): number {
		return this.bucket.available();
	}

	/** Non-blocking acquisition. Returns false if tokens are unavailable. */
	tryAcquire(count = 1): boolean {
		return this.bucket.tryAcquire(count);
	}

	/** Blocking acquisition — waits until tokens are available. */
	async acquire(count = 1): Promise<void> {
		await this.bucket.acquire(count);
	}

	/** True when bucket is below 20% capacity. */
	isLow(): boolean {
		return this.bucket.isLow();
	}
}

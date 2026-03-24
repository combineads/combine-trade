export interface TokenBucketOptions {
	/** Maximum number of tokens the bucket can hold. */
	capacity: number;
	/** Number of tokens added per refill interval. */
	refillRate: number;
	/** Milliseconds between refill ticks. */
	refillIntervalMs: number;
}

const LOW_THRESHOLD = 0.2;

/**
 * Token bucket rate limiter.
 * Thread-safe in single-threaded Bun (no locks required).
 */
export class TokenBucket {
	private tokens: number;
	private lastRefillAt: number;

	constructor(private readonly options: TokenBucketOptions) {
		this.tokens = options.capacity;
		this.lastRefillAt = Date.now();
	}

	/** Current available token count (applies elapsed refill first). */
	available(): number {
		this.refill();
		return this.tokens;
	}

	/** True when available tokens are below 20% of capacity. */
	isLow(): boolean {
		return this.available() / this.options.capacity < LOW_THRESHOLD;
	}

	/**
	 * Attempt to consume `count` tokens without waiting.
	 * Returns true on success, false if tokens are insufficient.
	 */
	tryAcquire(count = 1): boolean {
		this.refill();
		if (this.tokens < count) return false;
		this.tokens -= count;
		return true;
	}

	/**
	 * Consume `count` tokens, waiting until they become available.
	 */
	async acquire(count = 1): Promise<void> {
		while (!this.tryAcquire(count)) {
			// Wait one refill interval before retrying
			await new Promise<void>((resolve) =>
				setTimeout(resolve, this.options.refillIntervalMs),
			);
		}
	}

	/** Apply elapsed refill ticks (called automatically by tryAcquire / available). */
	refill(): void {
		const now = Date.now();
		const elapsed = now - this.lastRefillAt;
		const ticks = Math.floor(elapsed / this.options.refillIntervalMs);
		if (ticks > 0) {
			this.tokens = Math.min(
				this.options.capacity,
				this.tokens + ticks * this.options.refillRate,
			);
			this.lastRefillAt += ticks * this.options.refillIntervalMs;
		}
	}
}

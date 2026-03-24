import type { TokenBucket } from "./token-bucket.js";

/** Error thrown when all retry attempts are exhausted */
export class AutoThrottleExhaustedError extends Error {
	readonly attempts: number;

	constructor(attempts: number, cause?: unknown) {
		super(
			`Rate limit auto-throttle exhausted after ${attempts} attempt${attempts === 1 ? "" : "s"}`,
		);
		this.name = "AutoThrottleExhaustedError";
		this.attempts = attempts;
		if (cause !== undefined) {
			this.cause = cause;
		}
	}
}

export interface ThrottleBackoffOptions {
	/** Initial delay in milliseconds. Default: 1000 */
	initialMs?: number;
	/** Maximum delay in milliseconds. Default: 30000 */
	maxMs?: number;
	/** Multiplier applied each retry. Default: 2 */
	factor?: number;
}

/**
 * Exponential backoff calculator.
 * Starts at initialMs, doubles each call (up to maxMs).
 * Call reset() to restart the sequence.
 */
export class ThrottleBackoff {
	private readonly initialMs: number;
	private readonly maxMs: number;
	private readonly factor: number;
	private current: number;

	constructor(options: ThrottleBackoffOptions = {}) {
		this.initialMs = options.initialMs ?? 1000;
		this.maxMs = options.maxMs ?? 30_000;
		this.factor = options.factor ?? 2;
		this.current = this.initialMs;
	}

	/** Returns the next delay in ms, advancing internal state. */
	nextDelay(): number {
		const delay = this.current;
		this.current = Math.min(this.current * this.factor, this.maxMs);
		return delay;
	}

	/** Resets delay back to initialMs. */
	reset(): void {
		this.current = this.initialMs;
	}
}

/**
 * Returns true if the error is a 429 / rate limit error from an exchange.
 * Checks: error.status === 429, or message contains "429" / "rate limit" / "too many requests".
 */
export function is429Error(err: unknown): boolean {
	if (!(err instanceof Error)) return false;

	// Check numeric status property (CCXT and fetch-based clients set this)
	const maybeStatus = (err as Error & { status?: unknown }).status;
	if (maybeStatus === 429) return true;

	// Check message content (case-insensitive)
	const msg = err.message.toLowerCase();
	return (
		msg.includes("429") ||
		msg.includes("rate limit") ||
		msg.includes("ratelimit") ||
		msg.includes("too many request")
	);
}

export interface WithThrottleOptions {
	/** Maximum number of attempts before giving up. Default: 5 */
	maxAttempts?: number;
	/** Backoff strategy. Defaults to ThrottleBackoff with standard settings. */
	backoff?: ThrottleBackoff;
}

/**
 * Wraps an async function with rate-limit-aware auto-throttle:
 * 1. Acquires a token from the bucket before calling fn (waits if bucket is empty).
 * 2. If fn throws a 429 / rate limit error, waits with exponential backoff and retries.
 * 3. Non-429 errors are rethrown immediately without retry.
 * 4. Throws AutoThrottleExhaustedError if maxAttempts is reached.
 */
export async function withThrottle<T>(
	fn: () => Promise<T>,
	bucket: TokenBucket,
	options: WithThrottleOptions = {},
): Promise<T> {
	const maxAttempts = options.maxAttempts ?? 5;
	const backoff = options.backoff ?? new ThrottleBackoff();

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		// Acquire token (blocks until available)
		await bucket.acquire(1);

		try {
			return await fn();
		} catch (err) {
			if (!is429Error(err)) {
				// Not a rate limit error — propagate immediately
				throw err;
			}

			if (attempt === maxAttempts) {
				throw new AutoThrottleExhaustedError(attempt, err);
			}

			// Wait exponential backoff before retrying
			const delay = backoff.nextDelay();
			await new Promise<void>((resolve) => setTimeout(resolve, delay));
		}
	}

	// Should never reach here, but TypeScript requires it
	throw new AutoThrottleExhaustedError(maxAttempts);
}

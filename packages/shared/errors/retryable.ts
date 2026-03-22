import { BaseError } from "./base.js";

/**
 * Retryable errors (ERR_RETRY_*): WARN level.
 * Retry silently; alert after N consecutive failures.
 * Examples: network timeouts, exchange rate limits, temporary outages.
 */
export class RetryableError extends BaseError {
	public readonly maxRetries: number;

	constructor(code: string, message: string, maxRetries = 3, options?: ErrorOptions) {
		if (!code.startsWith("ERR_RETRY_")) {
			throw new Error(`RetryableError code must start with ERR_RETRY_, got: ${code}`);
		}
		super(code, message, options);
		this.maxRetries = maxRetries;
	}
}

import { BaseError } from "./base.js";

/**
 * Fatal errors (ERR_FATAL_*): ERROR level.
 * Halt affected worker; page on-call.
 * Examples: invalid API keys, insufficient balance, schema violations.
 */
export class FatalError extends BaseError {
	constructor(code: string, message: string, options?: ErrorOptions) {
		if (!code.startsWith("ERR_FATAL_")) {
			throw new Error(`FatalError code must start with ERR_FATAL_, got: ${code}`);
		}
		super(code, message, options);
	}
}

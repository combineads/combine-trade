import { BaseError } from "./base.js";

/**
 * System errors (ERR_SYS_*): ERROR level.
 * Halt process; page on-call.
 * Examples: OOM, disk full, DB connection pool exhausted.
 */
export class SystemError extends BaseError {
	constructor(code: string, message: string, options?: ErrorOptions) {
		if (!code.startsWith("ERR_SYS_")) {
			throw new Error(`SystemError code must start with ERR_SYS_, got: ${code}`);
		}
		super(code, message, options);
	}
}

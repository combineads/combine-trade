import { BaseError } from "./base.js";

/**
 * User errors (ERR_USER_*): INFO level.
 * Return structured error to caller; do not alert.
 * Examples: invalid strategy syntax, missing required fields, unsupported symbol.
 */
export class UserError extends BaseError {
	constructor(code: string, message: string, options?: ErrorOptions) {
		if (!code.startsWith("ERR_USER_")) {
			throw new Error(`UserError code must start with ERR_USER_, got: ${code}`);
		}
		super(code, message, options);
	}
}

import type { Logger } from "pino";

const SENSITIVE_KEYS = new Set([
	"password",
	"secret",
	"token",
	"apiKey",
	"apiSecret",
	"accessToken",
	"refreshToken",
	"authorization",
]);

/** Redact sensitive values from arguments for logging */
function sanitizeArgs(args: unknown[]): unknown[] {
	return args.map((arg) => {
		if (arg && typeof arg === "object" && !Array.isArray(arg)) {
			const sanitized: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(arg as Record<string, unknown>)) {
				sanitized[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : value;
			}
			return sanitized;
		}
		return arg;
	});
}

/**
 * @Log decorator — logs method entry and exit with structured JSON via pino.
 * Sanitizes sensitive arguments. Logs duration in ms.
 */
export function Log(logger: Logger) {
	return (
		_target: unknown,
		propertyKey: string,
		descriptor: PropertyDescriptor,
	): PropertyDescriptor => {
		const original = descriptor.value;
		descriptor.value = async function (...args: unknown[]) {
			const sanitized = sanitizeArgs(args);
			logger.info({ method: propertyKey, args: sanitized }, `${propertyKey} entry`);

			const start = performance.now();
			try {
				const result = await original.apply(this, args);
				const duration = Math.round(performance.now() - start);
				logger.info({ method: propertyKey, result: "success", duration }, `${propertyKey} exit`);
				return result;
			} catch (err) {
				const duration = Math.round(performance.now() - start);
				logger.error(
					{
						method: propertyKey,
						result: "error",
						duration,
						error: err instanceof Error ? err.message : String(err),
						stack: err instanceof Error ? err.stack : undefined,
					},
					`${propertyKey} error`,
				);
				throw err;
			}
		};
		return descriptor;
	};
}

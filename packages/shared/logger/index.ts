import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL ?? "info";

export const logger = pino({
	level,
	...(isProduction
		? {}
		: {
				transport: {
					target: "pino-pretty",
					options: { colorize: true },
				},
			}),
});

export type Logger = pino.Logger;

export function createLogger(name: string): pino.Logger {
	return logger.child({ module: name });
}

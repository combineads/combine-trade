import { describe, expect, test } from "bun:test";
import type pino from "pino";
import { Log } from "../log.js";
import { Transactional } from "../transactional.js";
import type { TransactionContext, TransactionProvider } from "../types.js";

// --- Mock transaction provider ---
function createMockProvider() {
	const calls: string[] = [];
	const provider: TransactionProvider = {
		async begin(): Promise<TransactionContext> {
			calls.push("begin");
			return {
				async execute<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
					try {
						const result = await fn({});
						calls.push("commit");
						return result;
					} catch (err) {
						calls.push("rollback");
						throw err;
					}
				},
			};
		},
	};
	return { provider, calls };
}

// --- Mock logger ---
function createMockLogger() {
	const entries: { level: string; msg: string; data: Record<string, unknown> }[] = [];
	const logger = {
		info(data: Record<string, unknown>, msg: string) {
			entries.push({ level: "info", msg, data });
		},
		error(data: Record<string, unknown>, msg: string) {
			entries.push({ level: "error", msg, data });
		},
	} as unknown as pino.Logger;
	return { logger, entries };
}

describe("@Transactional", () => {
	test("successful method commits transaction", async () => {
		const { provider, calls } = createMockProvider();

		class Service {
			@Transactional(provider)
			async save(value: string): Promise<string> {
				return `saved:${value}`;
			}
		}

		const svc = new Service();
		const result = await svc.save("test");
		expect(result).toBe("saved:test");
		expect(calls).toEqual(["begin", "commit"]);
	});

	test("error rolls back transaction", async () => {
		const { provider, calls } = createMockProvider();

		class Service {
			@Transactional(provider)
			async fail(): Promise<void> {
				throw new Error("boom");
			}
		}

		const svc = new Service();
		expect(svc.fail()).rejects.toThrow("boom");
		// Wait for async resolution
		await new Promise((r) => setTimeout(r, 10));
		expect(calls).toEqual(["begin", "rollback"]);
	});

	test("nested @Transactional reuses existing transaction", async () => {
		const { provider, calls } = createMockProvider();

		class Service {
			@Transactional(provider)
			async outer(): Promise<string> {
				return this.inner();
			}

			@Transactional(provider)
			async inner(): Promise<string> {
				return "inner-result";
			}
		}

		const svc = new Service();
		const result = await svc.outer();
		expect(result).toBe("inner-result");
		// Only one transaction should be created (outer), inner reuses it
		expect(calls).toEqual(["begin", "commit"]);
	});
});

describe("@Log", () => {
	test("logs method entry and exit", async () => {
		const { logger, entries } = createMockLogger();

		class Service {
			@Log(logger)
			async process(input: string): Promise<string> {
				return `done:${input}`;
			}
		}

		const svc = new Service();
		await svc.process("hello");

		expect(entries.length).toBe(2);
		expect(entries[0]!.msg).toBe("process entry");
		expect(entries[0]!.data.args).toEqual(["hello"]);
		expect(entries[1]!.msg).toBe("process exit");
		expect(entries[1]!.data.result).toBe("success");
		expect(typeof entries[1]!.data.duration).toBe("number");
	});

	test("logs error with stack trace", async () => {
		const { logger, entries } = createMockLogger();

		class Service {
			@Log(logger)
			async broken(): Promise<void> {
				throw new Error("fail");
			}
		}

		const svc = new Service();
		try {
			await svc.broken();
		} catch {
			// expected
		}

		expect(entries.length).toBe(2);
		expect(entries[0]!.msg).toBe("broken entry");
		expect(entries[1]!.level).toBe("error");
		expect(entries[1]!.data.error).toBe("fail");
		expect(entries[1]!.data.stack).toBeDefined();
	});

	test("sensitive arguments are redacted", async () => {
		const { logger, entries } = createMockLogger();

		class Service {
			@Log(logger)
			async login(_creds: { username: string; password: string }): Promise<boolean> {
				return true;
			}
		}

		const svc = new Service();
		await svc.login({ username: "admin", password: "secret123" });

		const loggedArgs = entries[0]!.data.args as unknown[];
		const loggedCreds = loggedArgs[0] as Record<string, unknown>;
		expect(loggedCreds.username).toBe("admin");
		expect(loggedCreds.password).toBe("[REDACTED]");
	});
});

import { describe, expect, test } from "bun:test";
import { createLogger, logger } from "../index.js";

describe("Logger", () => {
	test("root logger exists and has expected methods", () => {
		expect(logger).toBeDefined();
		expect(typeof logger.info).toBe("function");
		expect(typeof logger.warn).toBe("function");
		expect(typeof logger.error).toBe("function");
		expect(typeof logger.debug).toBe("function");
	});

	test("createLogger returns child logger with module name", () => {
		const child = createLogger("test-module");
		expect(child).toBeDefined();
		expect(typeof child.info).toBe("function");
	});

	test("createLogger creates distinct children", () => {
		const child1 = createLogger("module-a");
		const child2 = createLogger("module-b");
		expect(child1).not.toBe(child2);
	});
});

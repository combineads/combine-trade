import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { StrategySandbox } from "../sandbox.js";

let sandbox: StrategySandbox;

beforeAll(async () => {
	sandbox = new StrategySandbox({ timeoutMs: 500, memoryLimit: 16 * 1024 * 1024 });
	await sandbox.initialize();
});

afterAll(() => {
	sandbox.dispose();
});

describe("StrategySandbox", () => {
	test("executes simple code and returns result", () => {
		const result = sandbox.execute("const x = 2 + 2;");
		expect(result).toBeDefined();
		expect(result.features).toEqual([]);
	});

	test("defineFeature collects features", () => {
		const code = `
			defineFeature("sma_diff", 0.5, { method: "minmax" });
			defineFeature("rsi_14", 65.3, { method: "zscore" });
		`;
		const result = sandbox.execute(code);
		expect(result.features.length).toBe(2);
		expect(result.features[0]!.name).toBe("sma_diff");
		expect(result.features[0]!.value).toBe(0.5);
		expect(result.features[1]!.name).toBe("rsi_14");
		expect(result.features[1]!.value).toBe(65.3);
	});

	test("setEntry and setExit collect trade conditions", () => {
		const code = `
			setEntry(true);
			setExit(false);
		`;
		const result = sandbox.execute(code);
		expect(result.entryCondition).toBe(true);
		expect(result.exitCondition).toBe(false);
	});

	test("globals are accessible in sandbox", () => {
		const code = `
			defineFeature("price_diff", close[0] - close[1], { method: "minmax" });
		`;
		const result = sandbox.execute(code, {
			close: [100, 95, 90],
		});
		expect(result.features.length).toBe(1);
		expect(result.features[0]!.value).toBe(5);
	});

	test("require is not available in sandbox", () => {
		expect(() => {
			sandbox.execute('require("fs");');
		}).toThrow();
	});

	test("fetch is not available in sandbox", () => {
		expect(() => {
			sandbox.execute('fetch("http://evil.com");');
		}).toThrow();
	});

	test("process is not available in sandbox", () => {
		expect(() => {
			sandbox.execute("process.exit(1);");
		}).toThrow();
	});

	test("timeout is enforced for infinite loop", () => {
		expect(() => {
			sandbox.execute("while(true) {}");
		}).toThrow("exceeded");
	});

	test("error in strategy code is caught", () => {
		expect(() => {
			sandbox.execute("throw new Error('strategy bug');");
		}).toThrow();
	});

	test("multiple executions are independent", () => {
		const result1 = sandbox.execute('defineFeature("a", 1, { method: "none" });');
		const result2 = sandbox.execute('defineFeature("b", 2, { method: "none" });');

		expect(result1.features.length).toBe(1);
		expect(result1.features[0]!.name).toBe("a");
		expect(result2.features.length).toBe(1);
		expect(result2.features[0]!.name).toBe("b");
	});

	test("complex object globals are marshaled correctly", () => {
		const code = `
			defineFeature("vol", candle.volume, { method: "none" });
		`;
		const result = sandbox.execute(code, {
			candle: { open: 100, high: 105, low: 95, close: 102, volume: 1000 },
		});
		expect(result.features[0]!.value).toBe(1000);
	});
});

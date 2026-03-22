import { describe, expect, test } from "bun:test";
import { validateStrategyCode } from "../validation.js";

describe("validateStrategyCode", () => {
	test("valid strategy code passes", () => {
		const code = `
			const smaValue = indicator.sma(close, 20);
			const rsiValue = indicator.rsi(close, 14);
			defineFeature("sma_diff", close[0] - smaValue[0], { method: "minmax" });
			defineFeature("rsi_14", rsiValue[0], { method: "minmax" });
		`;
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(true);
		expect(result.errors.length).toBe(0);
	});

	test("syntax error is detected", () => {
		const code = "const x = {;";
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.code === "SYNTAX_ERROR")).toBe(true);
	});

	test("eval usage is detected", () => {
		const code = 'const result = eval("1 + 1");';
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.code === "FORBIDDEN_API")).toBe(true);
		expect(result.errors.some((e) => e.message.includes("eval"))).toBe(true);
	});

	test("require is detected", () => {
		const code = 'const fs = require("fs");';
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.message.includes("require"))).toBe(true);
	});

	test("import declaration is detected", () => {
		const code = 'import fs from "fs";';
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.code === "FORBIDDEN_IMPORT")).toBe(true);
	});

	test("dynamic import is detected", () => {
		const code = 'const m = await import("child_process");';
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.message.includes("import"))).toBe(true);
	});

	test("fetch usage is detected", () => {
		const code = 'const data = await fetch("http://evil.com");';
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.message.includes("fetch"))).toBe(true);
	});

	test("process access is detected", () => {
		const code = "const env = process.env;";
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.message.includes("process"))).toBe(true);
	});

	test("globalThis access is detected", () => {
		const code = "const g = globalThis;";
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.message.includes("globalThis"))).toBe(true);
	});

	test("Bun access is detected", () => {
		const code = "Bun.write('file.txt', 'data');";
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.message.includes("Bun"))).toBe(true);
	});

	test("comments containing forbidden words are NOT flagged", () => {
		const code = `
			// This uses eval-like logic internally
			/* require careful handling of fetch patterns */
			const smaValue = indicator.sma(close, 20);
			defineFeature("x", smaValue[0], { method: "minmax" });
		`;
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(true);
	});

	test("property access with forbidden name is allowed", () => {
		const code = `
			const obj = { eval: 42 };
			const x = obj.eval;
			defineFeature("x", x, { method: "minmax" });
		`;
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(true);
	});

	test("multiple errors are all reported", () => {
		const code = `
			eval("bad");
			const x = require("fs");
			fetch("http://evil.com");
		`;
		const result = validateStrategyCode(code);
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThanOrEqual(3);
	});

	test("empty code passes syntax check", () => {
		const result = validateStrategyCode("");
		expect(result.valid).toBe(true);
	});
});

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ICON_PATH = join(import.meta.dir, "../src/app/icon.svg");

describe("Desktop WebView favicon", () => {
	test("icon.svg exists in apps/desktop/src/app/", () => {
		expect(existsSync(ICON_PATH)).toBe(true);
	});

	test("icon.svg is a valid SVG file", () => {
		const content = readFileSync(ICON_PATH, "utf-8");
		expect(content).toContain("<svg");
		expect(content).toContain("</svg>");
	});

	test("icon.svg contains Combine Trade icon elements", () => {
		const content = readFileSync(ICON_PATH, "utf-8");
		// Combine Trade favicon: dark rounded rect with red and green crossing lines
		expect(content).toContain('fill="#0A0A0F"');
		expect(content).toContain('stroke="#EF4444"');
		expect(content).toContain('stroke="#22C55E"');
	});
});

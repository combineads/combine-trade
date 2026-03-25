/**
 * Verifies that Next.js Metadata File API icon files exist in the app directory
 * with the correct format and dimensions.
 *
 * Next.js auto-discovers icon.svg and apple-icon.png when placed in app/.
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons
 */

import { describe, expect, it } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(import.meta.dir, "..", "src", "app");

describe("favicon files", () => {
	describe("icon.svg", () => {
		const iconPath = join(APP_DIR, "icon.svg");

		it("exists in the app directory", () => {
			const stat = statSync(iconPath);
			expect(stat.isFile()).toBe(true);
		});

		it("is a valid SVG", () => {
			const content = readFileSync(iconPath, "utf-8");
			expect(content).toContain("<svg");
			expect(content).toContain("</svg>");
		});

		it("has a viewBox attribute", () => {
			const content = readFileSync(iconPath, "utf-8");
			expect(content).toMatch(/viewBox="[^"]+"/);
		});
	});

	describe("apple-icon.png", () => {
		const appleIconPath = join(APP_DIR, "apple-icon.png");

		it("exists in the app directory", () => {
			const stat = statSync(appleIconPath);
			expect(stat.isFile()).toBe(true);
		});

		it("is a PNG file (magic bytes)", () => {
			const buffer = readFileSync(appleIconPath);
			// PNG magic bytes: 0x89 0x50 0x4E 0x47
			expect(buffer[0]).toBe(0x89);
			expect(buffer[1]).toBe(0x50); // P
			expect(buffer[2]).toBe(0x4e); // N
			expect(buffer[3]).toBe(0x47); // G
		});

		it("is 180x180 pixels (IHDR chunk)", () => {
			const buffer = readFileSync(appleIconPath);
			// PNG IHDR chunk: width at offset 16 (4 bytes BE), height at offset 20 (4 bytes BE)
			const width = buffer.readUInt32BE(16);
			const height = buffer.readUInt32BE(20);
			expect(width).toBe(180);
			expect(height).toBe(180);
		});
	});
});

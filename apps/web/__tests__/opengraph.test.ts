/**
 * Verifies that the Open Graph image exists in the app directory with the
 * correct format and dimensions, and that root layout metadata includes
 * openGraph and twitter configuration.
 *
 * Next.js auto-discovers opengraph-image.png when placed in app/.
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */

import { describe, expect, it } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(import.meta.dir, "..", "src", "app");

describe("opengraph-image.png", () => {
	const ogImagePath = join(APP_DIR, "opengraph-image.png");

	it("exists in the app directory", () => {
		const stat = statSync(ogImagePath);
		expect(stat.isFile()).toBe(true);
	});

	it("is a PNG file (magic bytes)", () => {
		const buffer = readFileSync(ogImagePath);
		// PNG magic bytes: 0x89 0x50 0x4E 0x47
		expect(buffer[0]).toBe(0x89);
		expect(buffer[1]).toBe(0x50); // P
		expect(buffer[2]).toBe(0x4e); // N
		expect(buffer[3]).toBe(0x47); // G
	});

	it("is 1200x630 pixels (IHDR chunk)", () => {
		const buffer = readFileSync(ogImagePath);
		// PNG IHDR chunk: width at offset 16 (4 bytes BE), height at offset 20 (4 bytes BE)
		const width = buffer.readUInt32BE(16);
		const height = buffer.readUInt32BE(20);
		expect(width).toBe(1200);
		expect(height).toBe(630);
	});
});

describe("root layout metadata", () => {
	it("includes openGraph configuration", () => {
		const layoutContent = readFileSync(
			join(APP_DIR, "layout.tsx"),
			"utf-8",
		);
		expect(layoutContent).toContain("openGraph:");
		expect(layoutContent).toContain('type: "website"');
	});

	it("includes twitter card configuration", () => {
		const layoutContent = readFileSync(
			join(APP_DIR, "layout.tsx"),
			"utf-8",
		);
		expect(layoutContent).toContain("twitter:");
		expect(layoutContent).toContain('card: "summary_large_image"');
	});
});

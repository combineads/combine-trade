import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ICONS_DIR = join(import.meta.dir, "../src-tauri/icons");
const TAURI_CONF = join(import.meta.dir, "../src-tauri/tauri.conf.json");

/**
 * Read PNG width and height from IHDR chunk.
 * PNG spec: bytes 16-19 = width (big-endian u32), bytes 20-23 = height (big-endian u32).
 */
function readPngDimensions(filePath: string): { width: number; height: number } {
	const buf = readFileSync(filePath);
	// Verify PNG signature
	const signature = buf.subarray(0, 8);
	const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	if (!signature.equals(expected)) {
		throw new Error(`Not a valid PNG file: ${filePath}`);
	}
	const width = buf.readUInt32BE(16);
	const height = buf.readUInt32BE(20);
	return { width, height };
}

describe("Tauri app icons", () => {
	const requiredPngs: Array<{ file: string; width: number; height: number }> = [
		{ file: "32x32.png", width: 32, height: 32 },
		{ file: "128x128.png", width: 128, height: 128 },
		{ file: "128x128@2x.png", width: 256, height: 256 },
		{ file: "icon.png", width: 512, height: 512 },
		{ file: "1024x1024.png", width: 1024, height: 1024 },
	];

	for (const { file, width, height } of requiredPngs) {
		test(`${file} exists with correct dimensions (${width}x${height})`, () => {
			const filePath = join(ICONS_DIR, file);
			expect(existsSync(filePath)).toBe(true);

			const dims = readPngDimensions(filePath);
			expect(dims.width).toBe(width);
			expect(dims.height).toBe(height);
		});
	}

	test("icon.icns exists and has non-zero size", () => {
		const filePath = join(ICONS_DIR, "icon.icns");
		expect(existsSync(filePath)).toBe(true);
		const stat = statSync(filePath);
		expect(stat.size).toBeGreaterThan(0);
	});

	test("icon.ico exists and has non-zero size", () => {
		const filePath = join(ICONS_DIR, "icon.ico");
		expect(existsSync(filePath)).toBe(true);
		const stat = statSync(filePath);
		expect(stat.size).toBeGreaterThan(0);
	});

	test("tauri.conf.json bundle.icon references all required formats", () => {
		const conf = JSON.parse(readFileSync(TAURI_CONF, "utf-8"));
		const icons: string[] = conf.bundle.icon;

		const requiredEntries = [
			"icons/32x32.png",
			"icons/128x128.png",
			"icons/128x128@2x.png",
			"icons/icon.png",
			"icons/icon.icns",
			"icons/icon.ico",
		];

		for (const entry of requiredEntries) {
			expect(icons).toContain(entry);
		}
	});

	test("icon.png is at least 512x512 for Tauri builds", () => {
		const filePath = join(ICONS_DIR, "icon.png");
		const dims = readPngDimensions(filePath);
		expect(dims.width).toBeGreaterThanOrEqual(512);
		expect(dims.height).toBeGreaterThanOrEqual(512);
	});
});

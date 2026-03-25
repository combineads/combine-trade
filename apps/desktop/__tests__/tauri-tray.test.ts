import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC_TAURI = join(import.meta.dir, "../src-tauri");
const ICONS_DIR = join(SRC_TAURI, "icons");
const CARGO_TOML = join(SRC_TAURI, "Cargo.toml");
const LIB_RS = join(SRC_TAURI, "src/lib.rs");

/**
 * Read PNG width and height from IHDR chunk.
 */
function readPngDimensions(filePath: string): { width: number; height: number } {
	const buf = readFileSync(filePath);
	const signature = buf.subarray(0, 8);
	const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	if (!signature.equals(expected)) {
		throw new Error(`Not a valid PNG file: ${filePath}`);
	}
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("Tauri system tray", () => {
	const trayIcons = [
		{ file: "tray-dark-22x22.png", width: 22, height: 22 },
		{ file: "tray-dark-32x32.png", width: 32, height: 32 },
		{ file: "tray-light-22x22.png", width: 22, height: 22 },
		{ file: "tray-light-32x32.png", width: 32, height: 32 },
	];

	for (const { file, width, height } of trayIcons) {
		test(`tray icon ${file} exists with correct dimensions (${width}x${height})`, () => {
			const filePath = join(ICONS_DIR, file);
			expect(existsSync(filePath)).toBe(true);
			const dims = readPngDimensions(filePath);
			expect(dims.width).toBe(width);
			expect(dims.height).toBe(height);
		});
	}

	test("Cargo.toml includes tray-icon feature for tauri", () => {
		const content = readFileSync(CARGO_TOML, "utf-8");
		expect(content).toContain("tray-icon");
	});

	test("lib.rs configures TrayIconBuilder", () => {
		const content = readFileSync(LIB_RS, "utf-8");
		expect(content).toContain("TrayIconBuilder");
	});

	test("lib.rs has Show Window menu item", () => {
		const content = readFileSync(LIB_RS, "utf-8");
		expect(content).toContain("Show Window");
	});

	test("lib.rs has Quit menu item", () => {
		const content = readFileSync(LIB_RS, "utf-8");
		expect(content).toContain("Quit");
	});

	test("lib.rs handles show and quit menu events", () => {
		const content = readFileSync(LIB_RS, "utf-8");
		expect(content).toContain("on_menu_event");
		expect(content).toMatch(/"show"/);
		expect(content).toMatch(/"quit"/);
	});

	test("lib.rs handles tray icon click event", () => {
		const content = readFileSync(LIB_RS, "utf-8");
		expect(content).toContain("on_tray_icon_event");
	});
});

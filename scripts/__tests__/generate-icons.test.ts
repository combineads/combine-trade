import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = join(import.meta.dir, "../..");
const DESKTOP_ICONS = join(ROOT, "apps/desktop/src-tauri/icons");
const WEB_APP = join(ROOT, "apps/web/src/app");
const WEB_PUBLIC_ICONS = join(ROOT, "apps/web/public/icons");

/**
 * Run the generate-icons script once before all tests.
 * The script must complete successfully (exit 0).
 */
beforeAll(async () => {
	const proc = Bun.spawn(["bun", "run", join(ROOT, "scripts/generate-icons.ts")], {
		cwd: ROOT,
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`generate-icons.ts exited with code ${exitCode}: ${stderr}`);
	}
}, 30_000);

// Helper to verify a PNG file's dimensions
async function verifyPng(filePath: string, width: number, height: number) {
	expect(existsSync(filePath)).toBe(true);
	const meta = await sharp(filePath).metadata();
	expect(meta.width).toBe(width);
	expect(meta.height).toBe(height);
	expect(meta.format).toBe("png");
}

describe("generate-icons", () => {
	describe("desktop icons", () => {
		test("32x32.png has correct dimensions", async () => {
			await verifyPng(join(DESKTOP_ICONS, "32x32.png"), 32, 32);
		});

		test("128x128.png has correct dimensions", async () => {
			await verifyPng(join(DESKTOP_ICONS, "128x128.png"), 128, 128);
		});

		test("128x128@2x.png is 256x256", async () => {
			await verifyPng(join(DESKTOP_ICONS, "128x128@2x.png"), 256, 256);
		});

		test("icon.png is 512x512", async () => {
			await verifyPng(join(DESKTOP_ICONS, "icon.png"), 512, 512);
		});

		test("1024x1024.png has correct dimensions", async () => {
			await verifyPng(join(DESKTOP_ICONS, "1024x1024.png"), 1024, 1024);
		});

		test("icon.ico exists", () => {
			expect(existsSync(join(DESKTOP_ICONS, "icon.ico"))).toBe(true);
		});

		test("icon.icns exists or icns-source PNGs exist", () => {
			// Either .icns exists (if iconutil ran) or we have the source PNGs
			const icnsExists = existsSync(join(DESKTOP_ICONS, "icon.icns"));
			const sourceExists = existsSync(join(DESKTOP_ICONS, "1024x1024.png"));
			expect(icnsExists || sourceExists).toBe(true);
		});
	});

	describe("tray icons", () => {
		test("tray-dark-22x22.png", async () => {
			await verifyPng(join(DESKTOP_ICONS, "tray-dark-22x22.png"), 22, 22);
		});

		test("tray-dark-32x32.png", async () => {
			await verifyPng(join(DESKTOP_ICONS, "tray-dark-32x32.png"), 32, 32);
		});

		test("tray-light-22x22.png", async () => {
			await verifyPng(join(DESKTOP_ICONS, "tray-light-22x22.png"), 22, 22);
		});

		test("tray-light-32x32.png", async () => {
			await verifyPng(join(DESKTOP_ICONS, "tray-light-32x32.png"), 32, 32);
		});
	});

	describe("web icons", () => {
		test("apple-icon.png is 180x180", async () => {
			await verifyPng(join(WEB_APP, "apple-icon.png"), 180, 180);
		});

		test("icon.svg exists in web app", () => {
			expect(existsSync(join(WEB_APP, "icon.svg"))).toBe(true);
		});

		test("PWA icon 192x192", async () => {
			await verifyPng(join(WEB_PUBLIC_ICONS, "icon-192x192.png"), 192, 192);
		});

		test("PWA icon 512x512", async () => {
			await verifyPng(join(WEB_PUBLIC_ICONS, "icon-512x512.png"), 512, 512);
		});

		test("opengraph-image.png is 1200x630", async () => {
			await verifyPng(join(WEB_APP, "opengraph-image.png"), 1200, 630);
		});
	});
});

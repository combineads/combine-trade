/**
 * Verifies that the Next.js Metadata File API manifest function returns
 * a valid PWA manifest with correct fields and icon entries.
 *
 * Next.js auto-serves the manifest at /manifest.webmanifest when
 * manifest.ts is placed in the app directory.
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
 */

import { describe, expect, it } from "bun:test";
import { statSync } from "node:fs";
import { join } from "node:path";
import manifest from "../src/app/manifest";

const PUBLIC_DIR = join(import.meta.dir, "..", "public");

describe("web manifest", () => {
	const result = manifest();

	it("has correct app name", () => {
		expect(result.name).toBe("Combine Trade");
	});

	it("has correct short_name", () => {
		expect(result.short_name).toBe("CombineTrade");
	});

	it("has correct theme_color", () => {
		expect(result.theme_color).toBe("#0A0A0F");
	});

	it("has correct background_color", () => {
		expect(result.background_color).toBe("#0A0A0F");
	});

	it("has standalone display mode", () => {
		expect(result.display).toBe("standalone");
	});

	it("has start_url set to /", () => {
		expect(result.start_url).toBe("/");
	});

	it("has a description", () => {
		expect(result.description).toBeTruthy();
	});

	describe("icons", () => {
		it("includes 192x192 icon entry", () => {
			const icon192 = result.icons?.find((i) => i.sizes === "192x192");
			expect(icon192).toBeDefined();
			expect(icon192?.src).toBe("/icons/icon-192x192.png");
			expect(icon192?.type).toBe("image/png");
			expect(icon192?.purpose).toBe("any maskable");
		});

		it("includes 512x512 icon entry", () => {
			const icon512 = result.icons?.find((i) => i.sizes === "512x512");
			expect(icon512).toBeDefined();
			expect(icon512?.src).toBe("/icons/icon-512x512.png");
			expect(icon512?.type).toBe("image/png");
			expect(icon512?.purpose).toBe("any maskable");
		});

		it("icon files exist in public directory", () => {
			for (const icon of result.icons ?? []) {
				const filePath = join(PUBLIC_DIR, icon.src);
				const stat = statSync(filePath);
				expect(stat.isFile()).toBe(true);
			}
		});
	});
});

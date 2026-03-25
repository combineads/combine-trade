/**
 * SVG → PNG/ICO/ICNS Icon Generation Script
 *
 * Converts source SVGs in docs/assets/logo/ to all required raster formats
 * for web (Next.js) and desktop (Tauri) apps.
 *
 * Usage: bun run generate:icons
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = join(import.meta.dir, "..");
const LOGO_DIR = join(ROOT, "docs/assets/logo");
const DESKTOP_ICONS = join(ROOT, "apps/desktop/src-tauri/icons");
const WEB_APP = join(ROOT, "apps/web/src/app");
const WEB_PUBLIC_ICONS = join(ROOT, "apps/web/public/icons");

// Source SVGs
const ICON_DARK_SVG = join(LOGO_DIR, "icon-dark.svg");
const FAVICON_SVG = join(LOGO_DIR, "favicon.svg");
const LOCKUP_DARK_SVG = join(LOGO_DIR, "lockup-dark.svg");
const TRAY_DARK_SVG = join(LOGO_DIR, "tray-dark.svg");
const TRAY_LIGHT_SVG = join(LOGO_DIR, "tray-light.svg");

function ensureDir(dir: string) {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

function requireSource(path: string) {
	if (!existsSync(path)) {
		throw new Error(`Missing source SVG: ${path}`);
	}
}

async function svgToPng(svgPath: string, outPath: string, size: number) {
	await sharp(svgPath, { density: 300 }).resize(size, size).png().toFile(outPath);
}

/**
 * Build a minimal ICO file from multiple PNG buffers.
 * ICO format: header (6 bytes) + entries (16 bytes each) + PNG data.
 */
async function buildIco(pngBuffers: { size: number; buffer: Buffer }[]): Promise<Buffer> {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // type: 1 = ICO
	header.writeUInt16LE(pngBuffers.length, 4); // count

	const entries: Buffer[] = [];
	const dataChunks: Buffer[] = [];
	let dataOffset = 6 + pngBuffers.length * 16;

	for (const { size, buffer } of pngBuffers) {
		const entry = Buffer.alloc(16);
		entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
		entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
		entry.writeUInt8(0, 2); // color palette
		entry.writeUInt8(0, 3); // reserved
		entry.writeUInt16LE(1, 4); // color planes
		entry.writeUInt16LE(32, 6); // bits per pixel
		entry.writeUInt32LE(buffer.length, 8); // data size
		entry.writeUInt32LE(dataOffset, 12); // data offset
		entries.push(entry);
		dataChunks.push(buffer);
		dataOffset += buffer.length;
	}

	return Buffer.concat([header, ...entries, ...dataChunks]);
}

async function generateDesktopIcons() {
	console.info("Generating desktop icons...");
	ensureDir(DESKTOP_ICONS);
	requireSource(ICON_DARK_SVG);

	// Standard Tauri icon sizes
	const sizes = [
		{ name: "32x32.png", size: 32 },
		{ name: "128x128.png", size: 128 },
		{ name: "128x128@2x.png", size: 256 },
		{ name: "icon.png", size: 512 },
		{ name: "1024x1024.png", size: 1024 },
	];

	for (const { name, size } of sizes) {
		await svgToPng(ICON_DARK_SVG, join(DESKTOP_ICONS, name), size);
		console.info(`  ${name} (${size}x${size})`);
	}
}

async function generateDesktopIco() {
	console.info("Generating icon.ico...");
	requireSource(FAVICON_SVG);

	const icoSizes = [16, 32, 48];
	const pngBuffers: { size: number; buffer: Buffer }[] = [];

	for (const size of icoSizes) {
		const buffer = await sharp(FAVICON_SVG, { density: 300 }).resize(size, size).png().toBuffer();
		pngBuffers.push({ size, buffer });
	}

	const icoBuffer = await buildIco(pngBuffers);
	await Bun.write(join(DESKTOP_ICONS, "icon.ico"), icoBuffer);
	console.info("  icon.ico (16, 32, 48)");
}

async function generateDesktopIcns() {
	console.info("Generating icon.icns...");

	// Try using macOS iconutil if available
	const iconsetDir = join(DESKTOP_ICONS, "icon.iconset");
	ensureDir(iconsetDir);

	// iconutil requires specific filenames
	const iconsetSizes = [
		{ name: "icon_16x16.png", size: 16 },
		{ name: "icon_16x16@2x.png", size: 32 },
		{ name: "icon_32x32.png", size: 32 },
		{ name: "icon_32x32@2x.png", size: 64 },
		{ name: "icon_128x128.png", size: 128 },
		{ name: "icon_128x128@2x.png", size: 256 },
		{ name: "icon_256x256.png", size: 256 },
		{ name: "icon_256x256@2x.png", size: 512 },
		{ name: "icon_512x512.png", size: 512 },
		{ name: "icon_512x512@2x.png", size: 1024 },
	];

	for (const { name, size } of iconsetSizes) {
		await svgToPng(ICON_DARK_SVG, join(iconsetDir, name), size);
	}

	try {
		const proc = Bun.spawnSync([
			"iconutil",
			"-c",
			"icns",
			iconsetDir,
			"-o",
			join(DESKTOP_ICONS, "icon.icns"),
		]);
		if (proc.exitCode === 0) {
			console.info("  icon.icns (via iconutil)");
		} else {
			console.warn("  iconutil failed — icon.icns not generated. Iconset PNGs preserved.");
		}
	} catch {
		console.warn(
			"  iconutil not found — icon.icns not generated. Use: iconutil -c icns icon.iconset -o icon.icns",
		);
	}

	// Clean up iconset dir if icns was created
	if (existsSync(join(DESKTOP_ICONS, "icon.icns"))) {
		const { rmSync } = await import("node:fs");
		rmSync(iconsetDir, { recursive: true });
	}
}

async function generateTrayIcons() {
	console.info("Generating tray icons...");
	requireSource(TRAY_DARK_SVG);
	requireSource(TRAY_LIGHT_SVG);

	const traySizes = [22, 32];
	for (const size of traySizes) {
		await svgToPng(TRAY_DARK_SVG, join(DESKTOP_ICONS, `tray-dark-${size}x${size}.png`), size);
		await svgToPng(TRAY_LIGHT_SVG, join(DESKTOP_ICONS, `tray-light-${size}x${size}.png`), size);
		console.info(`  tray-dark-${size}x${size}.png, tray-light-${size}x${size}.png`);
	}
}

async function generateWebIcons() {
	console.info("Generating web icons...");
	ensureDir(WEB_APP);
	ensureDir(WEB_PUBLIC_ICONS);
	requireSource(ICON_DARK_SVG);
	requireSource(FAVICON_SVG);

	// Apple Touch Icon (180x180)
	await svgToPng(ICON_DARK_SVG, join(WEB_APP, "apple-icon.png"), 180);
	console.info("  apple-icon.png (180x180)");

	// Copy favicon.svg to web app
	copyFileSync(FAVICON_SVG, join(WEB_APP, "icon.svg"));
	console.info("  icon.svg (copied from favicon.svg)");

	// PWA icons
	await svgToPng(ICON_DARK_SVG, join(WEB_PUBLIC_ICONS, "icon-192x192.png"), 192);
	console.info("  icon-192x192.png (192x192)");
	await svgToPng(ICON_DARK_SVG, join(WEB_PUBLIC_ICONS, "icon-512x512.png"), 512);
	console.info("  icon-512x512.png (512x512)");
}

async function generateOgImage() {
	console.info("Generating opengraph-image.png...");
	requireSource(LOCKUP_DARK_SVG);

	const OG_WIDTH = 1200;
	const OG_HEIGHT = 630;
	const BG_COLOR = "#0A0A0F";

	// The lockup viewBox is 416x120, scale to fit nicely in 1200x630
	const lockupWidth = 600;
	const lockupHeight = Math.round(lockupWidth * (120 / 416)); // ~173

	const lockupPng = await sharp(LOCKUP_DARK_SVG, { density: 300 })
		.resize(lockupWidth, lockupHeight, { fit: "contain", background: BG_COLOR })
		.png()
		.toBuffer();

	// Create background and composite the lockup centered
	const left = Math.round((OG_WIDTH - lockupWidth) / 2);
	const top = Math.round((OG_HEIGHT - lockupHeight) / 2);

	await sharp({
		create: {
			width: OG_WIDTH,
			height: OG_HEIGHT,
			channels: 4,
			background: BG_COLOR,
		},
	})
		.composite([{ input: lockupPng, left, top }])
		.png()
		.toFile(join(WEB_APP, "opengraph-image.png"));

	console.info("  opengraph-image.png (1200x630)");
}

// Main
async function main() {
	console.info("=== Combine Trade Icon Generator ===\n");

	await generateDesktopIcons();
	await generateDesktopIco();
	await generateDesktopIcns();
	await generateTrayIcons();
	await generateWebIcons();
	await generateOgImage();

	console.info("\nDone! All icons generated.");
}

main().catch((err) => {
	console.error("Icon generation failed:", err);
	process.exit(1);
});

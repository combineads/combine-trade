import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

describe("Dockerfile.api", () => {
	const filePath = join(ROOT, "Dockerfile.api");

	test("file exists", () => {
		expect(existsSync(filePath)).toBe(true);
	});

	test("contains FROM instruction", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("FROM");
	});

	test("contains COPY instruction", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("COPY");
	});

	test("contains CMD instruction", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("CMD");
	});

	test("uses multi-stage build with builder and runner", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("AS builder");
		expect(content).toContain("AS runner");
	});

	test("pins bun base image version (not latest)", () => {
		const content = readFileSync(filePath, "utf-8");
		// Must use a versioned tag, not 'latest'
		expect(content).toMatch(/oven\/bun:\d+\.\d+/);
		expect(content).not.toContain("oven/bun:latest");
	});

	test("sets NODE_ENV=production in runner", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("NODE_ENV=production");
	});

	test("exposes port", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("EXPOSE");
	});

	test("uses bun install --frozen-lockfile", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("--frozen-lockfile");
	});
});

describe("Dockerfile.workers", () => {
	const filePath = join(ROOT, "Dockerfile.workers");

	test("file exists", () => {
		expect(existsSync(filePath)).toBe(true);
	});

	test("contains FROM instruction", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("FROM");
	});

	test("contains COPY instruction", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("COPY");
	});

	test("contains CMD instruction", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("CMD");
	});

	test("uses multi-stage build with builder and runner", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("AS builder");
		expect(content).toContain("AS runner");
	});

	test("pins bun base image version (not latest)", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toMatch(/oven\/bun:\d+\.\d+/);
		expect(content).not.toContain("oven/bun:latest");
	});

	test("sets NODE_ENV=production in runner", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("NODE_ENV=production");
	});

	test("uses bun install --frozen-lockfile", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("--frozen-lockfile");
	});

	test("copies workers directory", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("workers");
	});

	test("copies supervisor.ts", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("supervisor");
	});
});

describe("Dockerfile.web", () => {
	const filePath = join(ROOT, "Dockerfile.web");

	test("file exists", () => {
		expect(existsSync(filePath)).toBe(true);
	});

	test("contains FROM instruction", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("FROM");
	});

	test("contains COPY instruction", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("COPY");
	});

	test("contains CMD instruction", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("CMD");
	});

	test("uses multi-stage build", () => {
		const content = readFileSync(filePath, "utf-8");
		// At least deps + builder + runner = 3 FROM lines
		const fromCount = (content.match(/^FROM /gm) ?? []).length;
		expect(fromCount).toBeGreaterThanOrEqual(2);
	});

	test("runner stage uses node (not bun) for Next.js standalone", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("node:");
	});

	test("sets NODE_ENV=production in runner", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("NODE_ENV=production");
	});

	test("exposes a port", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("EXPOSE");
	});

	test("copies Next.js static and public directories", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain(".next/static");
		expect(content).toContain("public");
	});
});

describe(".dockerignore", () => {
	const filePath = join(ROOT, ".dockerignore");

	test("file exists", () => {
		expect(existsSync(filePath)).toBe(true);
	});

	test("excludes .env files", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain(".env");
	});

	test("excludes node_modules", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("node_modules");
	});

	test("excludes docs/", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("docs/");
	});

	test("excludes .git", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain(".git");
	});
});

describe("apps/web/next.config.ts — standalone output", () => {
	const filePath = join(ROOT, "apps/web/next.config.ts");

	test("file exists", () => {
		expect(existsSync(filePath)).toBe(true);
	});

	test("has output: 'standalone' set", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("standalone");
	});
});

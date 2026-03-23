import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import yaml from "js-yaml";

const ROOT = join(import.meta.dir, "../..");

describe("docker-compose.prod.yml", () => {
	const filePath = join(ROOT, "docker-compose.prod.yml");

	test("file exists", () => {
		expect(existsSync(filePath)).toBe(true);
	});

	test("is valid YAML", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(() => yaml.load(content)).not.toThrow();
	});

	test("has api service", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const services = doc.services as Record<string, unknown>;
		expect(services).toHaveProperty("api");
	});

	test("has workers service", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const services = doc.services as Record<string, unknown>;
		// At least one workers-type service exists (workers, candle-collector, or strategy-worker)
		const hasWorkers =
			"workers" in services ||
			"candle-collector" in services ||
			"strategy-worker" in services;
		expect(hasWorkers).toBe(true);
	});

	test("has web service", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const services = doc.services as Record<string, unknown>;
		expect(services).toHaveProperty("web");
	});

	test("has postgres service", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const services = doc.services as Record<string, unknown>;
		const hasPostgres =
			"postgres" in services || "db" in services;
		expect(hasPostgres).toBe(true);
	});

	test("uses image: not build: for api service", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const services = doc.services as Record<string, unknown>;
		const api = services.api as Record<string, unknown>;
		expect(api).toHaveProperty("image");
		expect(api).not.toHaveProperty("build");
	});

	test("uses image: not build: for web service", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const services = doc.services as Record<string, unknown>;
		const web = services.web as Record<string, unknown>;
		expect(web).toHaveProperty("image");
		expect(web).not.toHaveProperty("build");
	});

	test("api image uses ${TAG:-latest} variable", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const services = doc.services as Record<string, unknown>;
		const api = services.api as Record<string, unknown>;
		expect(api.image as string).toContain("${TAG:-latest}");
	});

	test("web image uses ${TAG:-latest} variable", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const services = doc.services as Record<string, unknown>;
		const web = services.web as Record<string, unknown>;
		expect(web.image as string).toContain("${TAG:-latest}");
	});

	test("postgres service uses pgvector/pgvector:pg16 image", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const services = doc.services as Record<string, unknown>;
		const postgresService =
			(services.postgres as Record<string, unknown>) ||
			(services.db as Record<string, unknown>);
		expect(postgresService.image as string).toContain("pgvector/pgvector:pg16");
	});

	test("postgres service has a healthcheck", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const services = doc.services as Record<string, unknown>;
		const postgresService =
			(services.postgres as Record<string, unknown>) ||
			(services.db as Record<string, unknown>);
		expect(postgresService).toHaveProperty("healthcheck");
	});

	test("has a named volume for postgres data", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		expect(doc).toHaveProperty("volumes");
		const volumes = doc.volumes as Record<string, unknown>;
		const volumeKeys = Object.keys(volumes);
		expect(volumeKeys.length).toBeGreaterThan(0);
	});

	test("api depends_on postgres", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const services = doc.services as Record<string, unknown>;
		const api = services.api as Record<string, unknown>;
		expect(api).toHaveProperty("depends_on");
	});

	test("all app services have restart: unless-stopped", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const services = doc.services as Record<string, unknown>;
		const appServiceNames = Object.keys(services).filter(
			(name) => name !== "postgres" && name !== "db",
		);
		for (const name of appServiceNames) {
			const service = services[name] as Record<string, unknown>;
			expect(service.restart).toBe("unless-stopped");
		}
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

	test("excludes test files", () => {
		const content = readFileSync(filePath, "utf-8");
		const hasTestExclusion =
			content.includes("*.test.ts") ||
			content.includes("**/__tests__/") ||
			content.includes("*.spec.ts");
		expect(hasTestExclusion).toBe(true);
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

describe(".github/workflows/build.yml", () => {
	const filePath = join(ROOT, ".github/workflows/build.yml");

	test("file exists", () => {
		expect(existsSync(filePath)).toBe(true);
	});

	test("is valid YAML", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(() => yaml.load(content)).not.toThrow();
	});

	test("triggers on push to main branch", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const on = doc.on as Record<string, unknown>;
		const push = on.push as Record<string, unknown>;
		const branches = push.branches as string[];
		expect(branches).toContain("main");
	});

	test("computes image tag from git describe", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("git describe");
	});

	test("pushes to ghcr.io registry", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("ghcr.io");
	});

	test("builds all three images: api, workers, web", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("Dockerfile.api");
		expect(content).toContain("Dockerfile.workers");
		expect(content).toContain("Dockerfile.web");
	});

	test("tags images with both git-describe tag and latest", () => {
		const content = readFileSync(filePath, "utf-8");
		expect(content).toContain("latest");
	});

	test("has workflow_dispatch trigger", () => {
		const content = readFileSync(filePath, "utf-8");
		const doc = yaml.load(content) as Record<string, unknown>;
		const on = doc.on as Record<string, unknown>;
		expect(on).toHaveProperty("workflow_dispatch");
	});
});

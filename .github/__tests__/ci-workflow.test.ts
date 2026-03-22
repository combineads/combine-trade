/**
 * CI workflow structure validation tests (RED → GREEN cycle for T-166)
 *
 * These tests validate that .github/workflows/ci.yml exists, is parseable YAML,
 * and contains the required jobs and configuration as specified in T-166.
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { load as parseYaml } from "js-yaml";

const ROOT = path.resolve(import.meta.dir, "../..");
const CI_WORKFLOW_PATH = path.join(ROOT, ".github/workflows/ci.yml");
const DEPENDABOT_PATH = path.join(ROOT, ".github/dependabot.yml");

type WorkflowJob = {
	"runs-on": string;
	steps: Array<{
		uses?: string;
		run?: string;
		name?: string;
		env?: Record<string, string>;
		services?: unknown;
	}>;
	services?: Record<string, unknown>;
	env?: Record<string, string>;
	needs?: string | string[];
};

type Workflow = {
	name?: string;
	on: {
		push?: { branches?: string[] };
		pull_request?: unknown;
	};
	concurrency?: {
		group: string;
		"cancel-in-progress": boolean;
	};
	jobs: Record<string, WorkflowJob>;
};

type DependabotConfig = {
	version: number;
	updates: Array<{
		"package-ecosystem": string;
		directory: string;
		schedule: { interval: string };
		"open-pull-requests-limit"?: number;
	}>;
};

describe("ci.yml — file existence and parseability", () => {
	test("file exists at .github/workflows/ci.yml", () => {
		expect(fs.existsSync(CI_WORKFLOW_PATH)).toBe(true);
	});

	test("file is valid YAML", () => {
		const content = fs.readFileSync(CI_WORKFLOW_PATH, "utf8");
		expect(() => parseYaml(content)).not.toThrow();
	});
});

describe("ci.yml — trigger configuration", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(CI_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	test("triggers on push to main branch", () => {
		const workflow = loadWorkflow();
		expect(workflow.on.push?.branches).toContain("main");
	});

	test("triggers on pull_request", () => {
		const workflow = loadWorkflow();
		expect(workflow.on.pull_request).toBeDefined();
	});
});

describe("ci.yml — concurrency configuration", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(CI_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	test("has concurrency group configured", () => {
		const workflow = loadWorkflow();
		expect(workflow.concurrency).toBeDefined();
		expect(workflow.concurrency?.group).toBeDefined();
	});

	test("cancel-in-progress is true", () => {
		const workflow = loadWorkflow();
		expect(workflow.concurrency?.["cancel-in-progress"]).toBe(true);
	});

	test("concurrency group references github.ref", () => {
		const workflow = loadWorkflow();
		expect(workflow.concurrency?.group).toContain("github.ref");
	});
});

describe("ci.yml — required jobs", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(CI_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	const requiredJobs = ["lint", "typecheck", "test-unit", "test-integration", "build"];

	for (const jobName of requiredJobs) {
		test(`job "${jobName}" exists`, () => {
			const workflow = loadWorkflow();
			expect(workflow.jobs[jobName]).toBeDefined();
		});

		test(`job "${jobName}" runs on ubuntu-latest`, () => {
			const workflow = loadWorkflow();
			expect(workflow.jobs[jobName]?.["runs-on"]).toBe("ubuntu-latest");
		});
	}
});

describe("ci.yml — job steps", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(CI_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	function getJobStepUses(jobName: string): string[] {
		const workflow = loadWorkflow();
		return (workflow.jobs[jobName]?.steps ?? [])
			.map((s) => s.uses)
			.filter((u): u is string => u !== undefined);
	}

	function getJobStepRuns(jobName: string): string[] {
		const workflow = loadWorkflow();
		return (workflow.jobs[jobName]?.steps ?? [])
			.map((s) => s.run)
			.filter((r): r is string => r !== undefined);
	}

	const allJobs = ["lint", "typecheck", "test-unit", "test-integration", "build"];

	for (const jobName of allJobs) {
		test(`job "${jobName}" uses actions/checkout@v4`, () => {
			const uses = getJobStepUses(jobName);
			expect(uses.some((u) => u.startsWith("actions/checkout@v4"))).toBe(true);
		});

		test(`job "${jobName}" uses oven-sh/setup-bun@v2`, () => {
			const uses = getJobStepUses(jobName);
			expect(uses.some((u) => u.startsWith("oven-sh/setup-bun@v2"))).toBe(true);
		});

		test(`job "${jobName}" runs bun install --frozen-lockfile`, () => {
			const runs = getJobStepRuns(jobName);
			expect(runs.some((r) => r.includes("bun install --frozen-lockfile"))).toBe(true);
		});
	}

	test('lint job runs "bun run lint"', () => {
		const runs = getJobStepRuns("lint");
		expect(runs.some((r) => r.includes("bun run lint"))).toBe(true);
	});

	test('typecheck job runs "bun run typecheck"', () => {
		const runs = getJobStepRuns("typecheck");
		expect(runs.some((r) => r.includes("bun run typecheck"))).toBe(true);
	});

	test('test-unit job runs "bun run test:unit"', () => {
		const runs = getJobStepRuns("test-unit");
		expect(runs.some((r) => r.includes("bun run test:unit"))).toBe(true);
	});

	test('test-integration job runs "bun run test:integration"', () => {
		const runs = getJobStepRuns("test-integration");
		expect(runs.some((r) => r.includes("bun run test:integration"))).toBe(true);
	});

	test('build job runs "bun run build"', () => {
		const runs = getJobStepRuns("build");
		expect(runs.some((r) => r.includes("bun run build"))).toBe(true);
	});

	test("test-integration job does NOT run db:migrate in test-unit", () => {
		const runs = getJobStepRuns("test-unit");
		expect(runs.some((r) => r.includes("db:migrate"))).toBe(false);
	});

	test("test-integration job runs db:migrate", () => {
		const runs = getJobStepRuns("test-integration");
		expect(runs.some((r) => r.includes("db:migrate"))).toBe(true);
	});
});

describe("ci.yml — test-integration PostgreSQL service", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(CI_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	test("test-integration job has services defined", () => {
		const workflow = loadWorkflow();
		expect(workflow.jobs["test-integration"]?.services).toBeDefined();
	});

	test("test-integration postgres service uses pgvector/pgvector:pg16 image", () => {
		const workflow = loadWorkflow();
		const services = workflow.jobs["test-integration"]?.services as
			| Record<string, { image?: string }>
			| undefined;
		expect(services?.postgres?.image).toBe("pgvector/pgvector:pg16");
	});

	test("test-integration has DATABASE_URL env", () => {
		const workflow = loadWorkflow();
		const job = workflow.jobs["test-integration"];
		expect(job?.env?.DATABASE_URL).toBeDefined();
		expect(job?.env?.DATABASE_URL).toContain("postgres://");
	});
});

describe("ci.yml — jobs run in parallel (no cross-job needs)", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(CI_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	const parallelJobs = ["lint", "typecheck", "test-unit", "test-integration", "build"];

	for (const jobName of parallelJobs) {
		test(`job "${jobName}" has no "needs" dependency`, () => {
			const workflow = loadWorkflow();
			expect(workflow.jobs[jobName]?.needs).toBeUndefined();
		});
	}
});

describe("dependabot.yml — file existence and structure", () => {
	test("file exists at .github/dependabot.yml", () => {
		expect(fs.existsSync(DEPENDABOT_PATH)).toBe(true);
	});

	test("file is valid YAML", () => {
		const content = fs.readFileSync(DEPENDABOT_PATH, "utf8");
		expect(() => parseYaml(content)).not.toThrow();
	});

	test("version is 2", () => {
		const content = fs.readFileSync(DEPENDABOT_PATH, "utf8");
		const config = parseYaml(content) as DependabotConfig;
		expect(config.version).toBe(2);
	});

	test("has npm ecosystem update entry", () => {
		const content = fs.readFileSync(DEPENDABOT_PATH, "utf8");
		const config = parseYaml(content) as DependabotConfig;
		const npmUpdate = config.updates.find((u) => u["package-ecosystem"] === "npm");
		expect(npmUpdate).toBeDefined();
	});

	test("npm update schedule is weekly", () => {
		const content = fs.readFileSync(DEPENDABOT_PATH, "utf8");
		const config = parseYaml(content) as DependabotConfig;
		const npmUpdate = config.updates.find((u) => u["package-ecosystem"] === "npm");
		expect(npmUpdate?.schedule.interval).toBe("weekly");
	});
});

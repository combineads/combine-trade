/**
 * Release workflow structure validation tests (RED → GREEN cycle for T-175)
 *
 * These tests validate that .github/workflows/release.yml exists, is parseable YAML,
 * and contains the required jobs and configuration as specified in T-175.
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { load as parseYaml } from "js-yaml";

const ROOT = path.resolve(import.meta.dir, "../..");
const RELEASE_WORKFLOW_PATH = path.join(ROOT, ".github/workflows/release.yml");

type WorkflowStep = {
	uses?: string;
	run?: string;
	name?: string;
	id?: string;
	with?: Record<string, unknown>;
	env?: Record<string, string>;
};

type WorkflowJob = {
	"runs-on"?: string;
	needs?: string | string[];
	steps?: WorkflowStep[];
	uses?: string;
	permissions?: Record<string, string>;
};

type WorkflowDispatchInput = {
	description?: string;
	required?: boolean;
	type?: string;
	default?: string;
};

type Workflow = {
	name?: string;
	on: {
		workflow_dispatch?: {
			inputs?: Record<string, WorkflowDispatchInput>;
		};
		push?: unknown;
		pull_request?: unknown;
	};
	jobs: Record<string, WorkflowJob>;
};

describe("release.yml — file existence and parseability", () => {
	test("file exists at .github/workflows/release.yml", () => {
		expect(fs.existsSync(RELEASE_WORKFLOW_PATH)).toBe(true);
	});

	test("file is valid YAML", () => {
		const content = fs.readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
		expect(() => parseYaml(content)).not.toThrow();
	});
});

describe("release.yml — trigger configuration", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	test("triggers only on workflow_dispatch (not push or pull_request)", () => {
		const workflow = loadWorkflow();
		expect(workflow.on.workflow_dispatch).toBeDefined();
		expect(workflow.on.push).toBeUndefined();
		expect(workflow.on.pull_request).toBeUndefined();
	});

	test("workflow_dispatch has version input", () => {
		const workflow = loadWorkflow();
		const inputs = workflow.on.workflow_dispatch?.inputs;
		expect(inputs?.version).toBeDefined();
	});

	test("version input is required", () => {
		const workflow = loadWorkflow();
		const inputs = workflow.on.workflow_dispatch?.inputs;
		expect(inputs?.version?.required).toBe(true);
	});

	test("version input has a description", () => {
		const workflow = loadWorkflow();
		const inputs = workflow.on.workflow_dispatch?.inputs;
		expect(inputs?.version?.description).toBeDefined();
		expect(typeof inputs?.version?.description).toBe("string");
	});
});

describe("release.yml — required jobs", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	test("has validate job", () => {
		const workflow = loadWorkflow();
		expect(workflow.jobs.validate).toBeDefined();
	});

	test("has ci job", () => {
		const workflow = loadWorkflow();
		expect(workflow.jobs.ci).toBeDefined();
	});

	test("has release job", () => {
		const workflow = loadWorkflow();
		expect(workflow.jobs.release).toBeDefined();
	});
});

describe("release.yml — job ordering (needs chain)", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	test("ci job needs validate", () => {
		const workflow = loadWorkflow();
		const needs = workflow.jobs.ci?.needs;
		const needsList = Array.isArray(needs) ? needs : [needs];
		expect(needsList).toContain("validate");
	});

	test("release job needs ci", () => {
		const workflow = loadWorkflow();
		const needs = workflow.jobs.release?.needs;
		const needsList = Array.isArray(needs) ? needs : [needs];
		expect(needsList).toContain("ci");
	});
});

describe("release.yml — validate job", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	test("validate job runs on ubuntu-latest", () => {
		const workflow = loadWorkflow();
		expect(workflow.jobs.validate?.["runs-on"]).toBe("ubuntu-latest");
	});

	test("validate job has a step that checks semver format", () => {
		const workflow = loadWorkflow();
		const steps = workflow.jobs.validate?.steps ?? [];
		const runSteps = steps.filter((s) => s.run).map((s) => s.run as string);
		const hasSemverCheck = runSteps.some(
			(r) => r.includes("v[0-9]") || r.includes("[0-9]+\\.[0-9]+\\.[0-9]+") || r.includes("semver"),
		);
		expect(hasSemverCheck).toBe(true);
	});

	test("validate job step exits 1 on invalid version (has exit 1 in run)", () => {
		const workflow = loadWorkflow();
		const steps = workflow.jobs.validate?.steps ?? [];
		const runSteps = steps.filter((s) => s.run).map((s) => s.run as string);
		const hasExit1 = runSteps.some((r) => r.includes("exit 1"));
		expect(hasExit1).toBe(true);
	});
});

describe("release.yml — ci job", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	test("ci job uses the local ci.yml workflow", () => {
		const workflow = loadWorkflow();
		const ciJob = workflow.jobs.ci;
		// ci job should either call the reusable ci.yml or have equivalent steps
		const usesPath = ciJob?.uses;
		expect(usesPath).toBeDefined();
		expect(usesPath).toContain("ci.yml");
	});
});

describe("release.yml — release job", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	function getReleaseSteps(): WorkflowStep[] {
		const workflow = loadWorkflow();
		return workflow.jobs.release?.steps ?? [];
	}

	function getReleaseStepUses(): string[] {
		return getReleaseSteps()
			.map((s) => s.uses)
			.filter((u): u is string => u !== undefined);
	}

	function getReleaseStepRuns(): string[] {
		return getReleaseSteps()
			.map((s) => s.run)
			.filter((r): r is string => r !== undefined);
	}

	test("release job runs on ubuntu-latest", () => {
		const workflow = loadWorkflow();
		expect(workflow.jobs.release?.["runs-on"]).toBe("ubuntu-latest");
	});

	test("release job has contents: write permission", () => {
		const workflow = loadWorkflow();
		const permissions = workflow.jobs.release?.permissions;
		expect(permissions?.contents).toBe("write");
	});

	test("release job has packages: write permission", () => {
		const workflow = loadWorkflow();
		const permissions = workflow.jobs.release?.permissions;
		expect(permissions?.packages).toBe("write");
	});

	test("release job uses actions/checkout@v4 with fetch-depth: 0", () => {
		const steps = getReleaseSteps();
		const checkoutStep = steps.find((s) => s.uses?.startsWith("actions/checkout@v4"));
		expect(checkoutStep).toBeDefined();
		expect(checkoutStep?.with?.["fetch-depth"]).toBe(0);
	});

	test("release job configures git user", () => {
		const runs = getReleaseStepRuns();
		const hasGitConfig = runs.some(
			(r) => r.includes("git config user.name") || r.includes("git config user.email"),
		);
		expect(hasGitConfig).toBe(true);
	});

	test("release job generates changelog with git log", () => {
		const runs = getReleaseStepRuns();
		const hasGitLog = runs.some((r) => r.includes("git log") && r.includes("--oneline"));
		expect(hasGitLog).toBe(true);
	});

	test("release job updates CHANGELOG.md with [skip ci] in commit message", () => {
		const runs = getReleaseStepRuns();
		const hasSkipCi = runs.some((r) => r.includes("[skip ci]"));
		expect(hasSkipCi).toBe(true);
	});

	test("release job creates annotated tag", () => {
		const runs = getReleaseStepRuns();
		const hasAnnotatedTag = runs.some((r) => r.includes("git tag -a"));
		expect(hasAnnotatedTag).toBe(true);
	});

	test("release job pushes tag to origin", () => {
		const runs = getReleaseStepRuns();
		const hasPushTag = runs.some((r) => r.includes("git push origin"));
		expect(hasPushTag).toBe(true);
	});

	test("release job creates GitHub Release via action or gh cli", () => {
		const uses = getReleaseStepUses();
		const runs = getReleaseStepRuns();
		const hasReleaseAction = uses.some(
			(u) => u.includes("softprops/action-gh-release") || u.includes("ncipollo/release-action"),
		);
		const hasGhRelease = runs.some((r) => r.includes("gh release create"));
		expect(hasReleaseAction || hasGhRelease).toBe(true);
	});

	test("release job logs into ghcr.io", () => {
		const uses = getReleaseStepUses();
		const hasDockerLogin = uses.some((u) => u.includes("docker/login-action"));
		expect(hasDockerLogin).toBe(true);
	});

	test("release job pushes api docker image with version tag", () => {
		const steps = getReleaseSteps();
		const buildPushSteps = steps.filter((s) => s.uses?.includes("docker/build-push-action"));
		const apiStep = buildPushSteps.find((s) => {
			const file = s.with?.file as string | undefined;
			const tags = s.with?.tags as string | undefined;
			return (file?.includes("Dockerfile.api") || tags?.includes("api")) && s.with?.push === true;
		});
		expect(apiStep).toBeDefined();
	});

	test("release job pushes workers docker image with version tag", () => {
		const steps = getReleaseSteps();
		const buildPushSteps = steps.filter((s) => s.uses?.includes("docker/build-push-action"));
		const workersStep = buildPushSteps.find((s) => {
			const file = s.with?.file as string | undefined;
			const tags = s.with?.tags as string | undefined;
			return (
				(file?.includes("Dockerfile.workers") || tags?.includes("workers")) && s.with?.push === true
			);
		});
		expect(workersStep).toBeDefined();
	});

	test("release job pushes web docker image with version tag", () => {
		const steps = getReleaseSteps();
		const buildPushSteps = steps.filter((s) => s.uses?.includes("docker/build-push-action"));
		const webStep = buildPushSteps.find((s) => {
			const file = s.with?.file as string | undefined;
			const tags = s.with?.tags as string | undefined;
			return (file?.includes("Dockerfile.web") || tags?.includes("web")) && s.with?.push === true;
		});
		expect(webStep).toBeDefined();
	});

	test("docker image tags reference ghcr.io", () => {
		const steps = getReleaseSteps();
		const buildPushSteps = steps.filter((s) => s.uses?.includes("docker/build-push-action"));
		const allTagsRefGhcr = buildPushSteps.every((s) => {
			const tags = s.with?.tags as string | undefined;
			return tags?.includes("ghcr.io");
		});
		expect(allTagsRefGhcr).toBe(true);
	});
});

/**
 * PR lint workflow structure validation tests (RED → GREEN cycle for T-175)
 *
 * These tests validate that .github/workflows/pr-lint.yml exists, is parseable YAML,
 * and contains the required configuration as specified in T-175.
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { load as parseYaml } from "js-yaml";

const ROOT = path.resolve(import.meta.dir, "../..");
const PR_LINT_WORKFLOW_PATH = path.join(ROOT, ".github/workflows/pr-lint.yml");

type WorkflowStep = {
	uses?: string;
	run?: string;
	name?: string;
	with?: Record<string, unknown>;
	env?: Record<string, string>;
};

type WorkflowJob = {
	"runs-on": string;
	steps: WorkflowStep[];
};

type PullRequestTrigger = {
	types?: string[];
};

type Workflow = {
	name?: string;
	on: {
		pull_request?: PullRequestTrigger;
		push?: unknown;
		workflow_dispatch?: unknown;
	};
	jobs: Record<string, WorkflowJob>;
};

describe("pr-lint.yml — file existence and parseability", () => {
	test("file exists at .github/workflows/pr-lint.yml", () => {
		expect(fs.existsSync(PR_LINT_WORKFLOW_PATH)).toBe(true);
	});

	test("file is valid YAML", () => {
		const content = fs.readFileSync(PR_LINT_WORKFLOW_PATH, "utf8");
		expect(() => parseYaml(content)).not.toThrow();
	});
});

describe("pr-lint.yml — trigger configuration", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(PR_LINT_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	test("triggers on pull_request event", () => {
		const workflow = loadWorkflow();
		expect(workflow.on.pull_request).toBeDefined();
	});

	test("pull_request trigger includes opened type", () => {
		const workflow = loadWorkflow();
		const types = workflow.on.pull_request?.types ?? [];
		expect(types).toContain("opened");
	});

	test("pull_request trigger includes edited type", () => {
		const workflow = loadWorkflow();
		const types = workflow.on.pull_request?.types ?? [];
		expect(types).toContain("edited");
	});

	test("pull_request trigger includes synchronize type", () => {
		const workflow = loadWorkflow();
		const types = workflow.on.pull_request?.types ?? [];
		expect(types).toContain("synchronize");
	});

	test("pull_request trigger includes reopened type", () => {
		const workflow = loadWorkflow();
		const types = workflow.on.pull_request?.types ?? [];
		expect(types).toContain("reopened");
	});
});

describe("pr-lint.yml — job structure", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(PR_LINT_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	test("has at least one job", () => {
		const workflow = loadWorkflow();
		expect(Object.keys(workflow.jobs).length).toBeGreaterThan(0);
	});

	test("pr-title job (or equivalent) exists", () => {
		const workflow = loadWorkflow();
		const jobNames = Object.keys(workflow.jobs);
		// Accept either 'pr-title' or other names like 'lint', 'check'
		expect(jobNames.length).toBeGreaterThan(0);
	});

	test("job runs on ubuntu-latest", () => {
		const workflow = loadWorkflow();
		const firstJob = Object.values(workflow.jobs)[0];
		expect(firstJob?.["runs-on"]).toBe("ubuntu-latest");
	});
});

describe("pr-lint.yml — semantic pull request action", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(PR_LINT_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	function getAllSteps(): WorkflowStep[] {
		const workflow = loadWorkflow();
		return Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
	}

	test("uses amannn/action-semantic-pull-request@v5", () => {
		const steps = getAllSteps();
		const hasAction = steps.some((s) =>
			s.uses?.startsWith("amannn/action-semantic-pull-request@v5"),
		);
		expect(hasAction).toBe(true);
	});

	test("action step has GITHUB_TOKEN env variable", () => {
		const steps = getAllSteps();
		const actionStep = steps.find((s) =>
			s.uses?.startsWith("amannn/action-semantic-pull-request@v5"),
		);
		expect(actionStep?.env?.GITHUB_TOKEN).toBeDefined();
	});
});

describe("pr-lint.yml — enforced conventional commit types", () => {
	function loadWorkflow(): Workflow {
		const content = fs.readFileSync(PR_LINT_WORKFLOW_PATH, "utf8");
		return parseYaml(content) as Workflow;
	}

	function getActionWith(): Record<string, unknown> | undefined {
		const workflow = loadWorkflow();
		const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
		const actionStep = steps.find((s) =>
			s.uses?.startsWith("amannn/action-semantic-pull-request@v5"),
		);
		return actionStep?.with;
	}

	test("action has types configured", () => {
		const withConfig = getActionWith();
		expect(withConfig?.types).toBeDefined();
	});

	const requiredTypes = [
		"feat",
		"fix",
		"chore",
		"docs",
		"refactor",
		"test",
		"perf",
		"security",
		"ci",
	];

	for (const commitType of requiredTypes) {
		test(`enforces "${commitType}" type`, () => {
			const withConfig = getActionWith();
			const types = withConfig?.types as string | undefined;
			expect(types).toContain(commitType);
		});
	}

	test("requireScope is false (scope is optional)", () => {
		const withConfig = getActionWith();
		expect(withConfig?.requireScope).toBe(false);
	});
});

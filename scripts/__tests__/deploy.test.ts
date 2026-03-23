/**
 * Tests for scripts/deploy.ts
 *
 * These tests exercise the pure functions that perform pre-flight checks,
 * deploy-history append logic, post-deploy health verification, and dry-run
 * plan building. No actual Docker commands, DB connections, or HTTP requests
 * are issued — all I/O dependencies are injected as stubs.
 */
import { describe, expect, test } from "bun:test";
import {
	DEPLOY_ERROR_CODES,
	GRACEFUL_SHUTDOWN_TIMEOUT_MS,
	HEALTH_POLL_INTERVAL_MS,
	POST_DEPLOY_HEALTH_TIMEOUT_MS,
	appendDeployEntry,
	buildDeployPlan,
	buildDeployRecord,
	checkCiPassed,
	checkKillSwitch,
	checkNoOpenOrders,
	checkSystemHealth,
	evaluatePostDeployHealth,
	getPreviousTag,
	parseDeployArgs,
} from "../deploy";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("deploy constants", () => {
	test("GRACEFUL_SHUTDOWN_TIMEOUT_MS is 30_000", () => {
		expect(GRACEFUL_SHUTDOWN_TIMEOUT_MS).toBe(30_000);
	});

	test("HEALTH_POLL_INTERVAL_MS is 3_000", () => {
		expect(HEALTH_POLL_INTERVAL_MS).toBe(3_000);
	});

	test("POST_DEPLOY_HEALTH_TIMEOUT_MS is 60_000", () => {
		expect(POST_DEPLOY_HEALTH_TIMEOUT_MS).toBe(60_000);
	});

	test("all error codes are defined", () => {
		expect(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_CI_NOT_GREEN).toBeDefined();
		expect(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_UNHEALTHY).toBeDefined();
		expect(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_KILL_SWITCH_ACTIVE).toBeDefined();
		expect(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_OPEN_ORDERS).toBeDefined();
		expect(DEPLOY_ERROR_CODES.ERR_FATAL_DEPLOY_SHUTDOWN_TIMEOUT).toBeDefined();
		expect(DEPLOY_ERROR_CODES.ERR_POSTDEPLOY_UNHEALTHY).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// parseDeployArgs
// ---------------------------------------------------------------------------

describe("parseDeployArgs", () => {
	test("parses --tag argument", () => {
		const result = parseDeployArgs(["--tag", "v1.0.0"]);
		expect(result.tag).toBe("v1.0.0");
	});

	test("parses --dry-run flag", () => {
		const result = parseDeployArgs(["--tag", "v1.0.0", "--dry-run"]);
		expect(result.dryRun).toBe(true);
	});

	test("dry-run defaults to false when not provided", () => {
		const result = parseDeployArgs(["--tag", "v1.0.0"]);
		expect(result.dryRun).toBe(false);
	});

	test("parses --force-kill-switch flag", () => {
		const result = parseDeployArgs(["--tag", "v1.0.0", "--force-kill-switch"]);
		expect(result.forceKillSwitch).toBe(true);
	});

	test("forceKillSwitch defaults to false when not provided", () => {
		const result = parseDeployArgs(["--tag", "v1.0.0"]);
		expect(result.forceKillSwitch).toBe(false);
	});

	test("returns error when --tag is missing", () => {
		const result = parseDeployArgs(["--dry-run"]);
		expect(result.error).toBeDefined();
		expect(result.tag).toBeUndefined();
	});

	test("returns error when --tag value is missing", () => {
		const result = parseDeployArgs(["--tag"]);
		expect(result.error).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// checkCiPassed
// ---------------------------------------------------------------------------

describe("checkCiPassed", () => {
	test("returns ok when env indicates CI passed", () => {
		const result = checkCiPassed({ CI_STATUS: "success", COMMIT_SHA: "abc123" });
		expect(result.ok).toBe(true);
		expect(result.errorCode).toBeUndefined();
	});

	test("returns error when CI_STATUS is not success", () => {
		const result = checkCiPassed({ CI_STATUS: "failure", COMMIT_SHA: "abc123" });
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_CI_NOT_GREEN);
	});

	test("returns error when CI_STATUS is absent", () => {
		const result = checkCiPassed({});
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_CI_NOT_GREEN);
	});

	test("returns error when CI_STATUS is pending", () => {
		const result = checkCiPassed({ CI_STATUS: "pending" });
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_CI_NOT_GREEN);
	});
});

// ---------------------------------------------------------------------------
// checkSystemHealth
// ---------------------------------------------------------------------------

describe("checkSystemHealth", () => {
	test("returns ok when HTTP status is 200", () => {
		const result = checkSystemHealth({ httpStatus: 200 });
		expect(result.ok).toBe(true);
	});

	test("returns error when HTTP status is 503", () => {
		const result = checkSystemHealth({ httpStatus: 503 });
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_UNHEALTHY);
	});

	test("returns error when HTTP status is 500", () => {
		const result = checkSystemHealth({ httpStatus: 500 });
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_UNHEALTHY);
	});

	test("returns error when health check throws (network error)", () => {
		const result = checkSystemHealth({ httpStatus: null, networkError: "ECONNREFUSED" });
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_UNHEALTHY);
	});
});

// ---------------------------------------------------------------------------
// checkKillSwitch
// ---------------------------------------------------------------------------

describe("checkKillSwitch", () => {
	test("returns ok when globalHalt is false", () => {
		const result = checkKillSwitch({ globalHalt: false, forceKillSwitch: false });
		expect(result.ok).toBe(true);
		expect(result.warning).toBeUndefined();
	});

	test("returns error when globalHalt is true and forceKillSwitch is false", () => {
		const result = checkKillSwitch({ globalHalt: true, forceKillSwitch: false });
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_KILL_SWITCH_ACTIVE);
	});

	test("returns ok with warning when globalHalt is true and forceKillSwitch is true", () => {
		const result = checkKillSwitch({ globalHalt: true, forceKillSwitch: true });
		expect(result.ok).toBe(true);
		expect(result.warning).toBeDefined();
		expect(result.warning).toContain("kill switch");
	});

	test("no warning when globalHalt is false regardless of force flag", () => {
		const result = checkKillSwitch({ globalHalt: false, forceKillSwitch: true });
		expect(result.ok).toBe(true);
		expect(result.warning).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// checkNoOpenOrders
// ---------------------------------------------------------------------------

describe("checkNoOpenOrders", () => {
	test("returns ok when openOrderCount is 0", () => {
		const result = checkNoOpenOrders({ openOrderCount: 0 });
		expect(result.ok).toBe(true);
	});

	test("returns error when openOrderCount is greater than 0", () => {
		const result = checkNoOpenOrders({ openOrderCount: 3 });
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_OPEN_ORDERS);
	});

	test("error message includes count of open orders", () => {
		const result = checkNoOpenOrders({ openOrderCount: 5 });
		expect(result.ok).toBe(false);
		expect(result.message).toContain("5");
	});

	test("returns error when openOrderCount is 1", () => {
		const result = checkNoOpenOrders({ openOrderCount: 1 });
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_PREFLIGHT_OPEN_ORDERS);
	});
});

// ---------------------------------------------------------------------------
// evaluatePostDeployHealth
// ---------------------------------------------------------------------------

describe("evaluatePostDeployHealth", () => {
	test("returns ok when all checks pass", () => {
		const result = evaluatePostDeployHealth({
			httpStatus: 200,
			candleGaps: 0,
			pipelineP95Ms: 1500,
		});
		expect(result.ok).toBe(true);
	});

	test("returns error when HTTP status is not 200", () => {
		const result = evaluatePostDeployHealth({
			httpStatus: 503,
			candleGaps: 0,
			pipelineP95Ms: 1500,
		});
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_POSTDEPLOY_UNHEALTHY);
	});

	test("returns error when candleGaps is greater than 0", () => {
		const result = evaluatePostDeployHealth({
			httpStatus: 200,
			candleGaps: 2,
			pipelineP95Ms: 1500,
		});
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_POSTDEPLOY_UNHEALTHY);
		expect(result.message).toContain("candle gap");
	});

	test("returns error when pipelineP95Ms exceeds 2000", () => {
		const result = evaluatePostDeployHealth({
			httpStatus: 200,
			candleGaps: 0,
			pipelineP95Ms: 2001,
		});
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_POSTDEPLOY_UNHEALTHY);
		expect(result.message).toContain("p95");
	});

	test("passes when pipelineP95Ms is exactly 2000 (boundary)", () => {
		const result = evaluatePostDeployHealth({
			httpStatus: 200,
			candleGaps: 0,
			pipelineP95Ms: 2000,
		});
		expect(result.ok).toBe(true);
	});

	test("returns error when health response is null (network failure)", () => {
		const result = evaluatePostDeployHealth(null);
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(DEPLOY_ERROR_CODES.ERR_POSTDEPLOY_UNHEALTHY);
	});
});

// ---------------------------------------------------------------------------
// buildDeployRecord
// ---------------------------------------------------------------------------

describe("buildDeployRecord", () => {
	test("builds a success record with all required fields", () => {
		const record = buildDeployRecord({
			sha: "abc123",
			tag: "v1.0.0",
			deployedBy: "operator",
			status: "success",
		});
		expect(record.sha).toBe("abc123");
		expect(record.tag).toBe("v1.0.0");
		expect(record.deployed_by).toBe("operator");
		expect(record.status).toBe("success");
		expect(record.deployed_at).toBeDefined();
		// deployed_at should be a valid ISO 8601 date
		expect(() => new Date(record.deployed_at)).not.toThrow();
	});

	test("builds a failed record", () => {
		const record = buildDeployRecord({
			sha: "def456",
			tag: "v1.1.0",
			deployedBy: "ci",
			status: "failed",
		});
		expect(record.status).toBe("failed");
	});

	test("builds a rolled_back record", () => {
		const record = buildDeployRecord({
			sha: "ghi789",
			tag: "v0.9.0",
			deployedBy: "operator",
			status: "rolled_back",
		});
		expect(record.status).toBe("rolled_back");
	});
});

// ---------------------------------------------------------------------------
// appendDeployEntry
// ---------------------------------------------------------------------------

describe("appendDeployEntry", () => {
	test("appends to an empty array", () => {
		const existing: unknown[] = [];
		const newRecord = {
			sha: "abc",
			tag: "v1.0.0",
			deployed_at: "2026-03-23T10:00:00Z",
			deployed_by: "operator",
			status: "success" as const,
		};
		const result = appendDeployEntry(existing, newRecord);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual(newRecord);
	});

	test("appends to a non-empty array without mutating original", () => {
		const existing = [
			{
				sha: "old",
				tag: "v0.9.0",
				deployed_at: "2026-03-01T00:00:00Z",
				deployed_by: "operator",
				status: "success" as const,
			},
		];
		const newRecord = {
			sha: "new",
			tag: "v1.0.0",
			deployed_at: "2026-03-23T10:00:00Z",
			deployed_by: "operator",
			status: "success" as const,
		};
		const result = appendDeployEntry(existing, newRecord);
		expect(result).toHaveLength(2);
		expect(existing).toHaveLength(1); // original not mutated
		expect(result[1]).toEqual(newRecord);
	});

	test("preserves existing entries in order", () => {
		const existing = [
			{
				sha: "a",
				tag: "v0.1.0",
				deployed_at: "2026-01-01T00:00:00Z",
				deployed_by: "op",
				status: "success" as const,
			},
			{
				sha: "b",
				tag: "v0.2.0",
				deployed_at: "2026-02-01T00:00:00Z",
				deployed_by: "op",
				status: "failed" as const,
			},
		];
		const newRecord = {
			sha: "c",
			tag: "v0.3.0",
			deployed_at: "2026-03-01T00:00:00Z",
			deployed_by: "op",
			status: "success" as const,
		};
		const result = appendDeployEntry(existing, newRecord);
		expect(result).toHaveLength(3);
		expect((result[0] as { sha: string }).sha).toBe("a");
		expect((result[1] as { sha: string }).sha).toBe("b");
		expect((result[2] as { sha: string }).sha).toBe("c");
	});
});

// ---------------------------------------------------------------------------
// getPreviousTag
// ---------------------------------------------------------------------------

describe("getPreviousTag", () => {
	test("returns null when history is empty", () => {
		const tag = getPreviousTag([]);
		expect(tag).toBeNull();
	});

	test("returns the tag of the most recent successful deploy", () => {
		const history = [
			{
				sha: "a",
				tag: "v0.9.0",
				deployed_at: "2026-01-01T00:00:00Z",
				deployed_by: "op",
				status: "success" as const,
			},
			{
				sha: "b",
				tag: "v1.0.0",
				deployed_at: "2026-02-01T00:00:00Z",
				deployed_by: "op",
				status: "success" as const,
			},
		];
		const tag = getPreviousTag(history);
		expect(tag).toBe("v1.0.0");
	});

	test("skips failed entries when looking for previous tag", () => {
		const history = [
			{
				sha: "a",
				tag: "v0.9.0",
				deployed_at: "2026-01-01T00:00:00Z",
				deployed_by: "op",
				status: "success" as const,
			},
			{
				sha: "b",
				tag: "v1.0.0",
				deployed_at: "2026-02-01T00:00:00Z",
				deployed_by: "op",
				status: "failed" as const,
			},
		];
		const tag = getPreviousTag(history);
		expect(tag).toBe("v0.9.0");
	});

	test("returns null when all entries are failed", () => {
		const history = [
			{
				sha: "a",
				tag: "v1.0.0",
				deployed_at: "2026-01-01T00:00:00Z",
				deployed_by: "op",
				status: "failed" as const,
			},
		];
		const tag = getPreviousTag(history);
		expect(tag).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// buildDeployPlan (dry-run mode)
// ---------------------------------------------------------------------------

describe("buildDeployPlan", () => {
	test("returns a plan with all expected step names", () => {
		const plan = buildDeployPlan({ tag: "v1.0.0", forceKillSwitch: false });
		const stepNames = plan.steps.map((s) => s.name);
		expect(stepNames).toContain("preflight-ci");
		expect(stepNames).toContain("preflight-health");
		expect(stepNames).toContain("preflight-kill-switch");
		expect(stepNames).toContain("preflight-open-orders");
		expect(stepNames).toContain("graceful-shutdown");
		expect(stepNames).toContain("docker-pull");
		expect(stepNames).toContain("docker-up");
		expect(stepNames).toContain("post-deploy-health");
		expect(stepNames).toContain("append-history");
	});

	test("plan includes the requested tag", () => {
		const plan = buildDeployPlan({ tag: "v2.3.1", forceKillSwitch: false });
		expect(plan.tag).toBe("v2.3.1");
	});

	test("plan notes force-kill-switch when active", () => {
		const plan = buildDeployPlan({ tag: "v1.0.0", forceKillSwitch: true });
		const killSwitchStep = plan.steps.find((s) => s.name === "preflight-kill-switch");
		expect(killSwitchStep?.note).toContain("force");
	});

	test("each step has a description", () => {
		const plan = buildDeployPlan({ tag: "v1.0.0", forceKillSwitch: false });
		for (const step of plan.steps) {
			expect(step.description.length).toBeGreaterThan(0);
		}
	});
});

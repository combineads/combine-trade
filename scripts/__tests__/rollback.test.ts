/**
 * Tests for scripts/rollback.ts
 *
 * These tests exercise the pure functions that parse CLI arguments,
 * resolve the rollback target from deploy history, build the rollback record,
 * and evaluate post-rollback health. No actual Docker commands, filesystem
 * operations, or HTTP requests are issued — all I/O dependencies are injected
 * as stubs.
 */
import { describe, expect, test } from "bun:test";
import {
	ROLLBACK_ERROR_CODES,
	ROLLBACK_HEALTH_TIMEOUT_MS,
	ROLLBACK_HEALTH_POLL_INTERVAL_MS,
	buildRollbackPlan,
	buildRollbackRecord,
	evaluatePostRollbackHealth,
	getPreviousSuccessfulTag,
	parseRollbackArgs,
} from "../rollback";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("rollback constants", () => {
	test("ROLLBACK_HEALTH_TIMEOUT_MS is 60_000", () => {
		expect(ROLLBACK_HEALTH_TIMEOUT_MS).toBe(60_000);
	});

	test("ROLLBACK_HEALTH_POLL_INTERVAL_MS is 3_000", () => {
		expect(ROLLBACK_HEALTH_POLL_INTERVAL_MS).toBe(3_000);
	});

	test("all rollback error codes are defined", () => {
		expect(ROLLBACK_ERROR_CODES.ERR_NO_PREVIOUS_DEPLOY).toBeDefined();
		expect(ROLLBACK_ERROR_CODES.ERR_DOCKER_SWAP_FAILED).toBeDefined();
		expect(ROLLBACK_ERROR_CODES.ERR_ROLLBACK_HEALTH_FAILED).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// parseRollbackArgs
// ---------------------------------------------------------------------------

describe("parseRollbackArgs", () => {
	test("defaults: no dry-run, no target-tag", () => {
		const result = parseRollbackArgs([]);
		expect(result.dryRun).toBe(false);
		expect(result.targetTag).toBeUndefined();
	});

	test("parses --dry-run flag", () => {
		const result = parseRollbackArgs(["--dry-run"]);
		expect(result.dryRun).toBe(true);
	});

	test("parses --target-tag argument", () => {
		const result = parseRollbackArgs(["--target-tag", "v0.9.0"]);
		expect(result.targetTag).toBe("v0.9.0");
	});

	test("parses both --dry-run and --target-tag", () => {
		const result = parseRollbackArgs(["--dry-run", "--target-tag", "v0.8.0"]);
		expect(result.dryRun).toBe(true);
		expect(result.targetTag).toBe("v0.8.0");
	});

	test("returns error when --target-tag value is missing", () => {
		const result = parseRollbackArgs(["--target-tag"]);
		expect(result.error).toBeDefined();
	});

	test("returns error when --target-tag is followed by another flag", () => {
		const result = parseRollbackArgs(["--target-tag", "--dry-run"]);
		expect(result.error).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// getPreviousSuccessfulTag
// ---------------------------------------------------------------------------

describe("getPreviousSuccessfulTag", () => {
	test("returns null for empty history", () => {
		const result = getPreviousSuccessfulTag([], undefined);
		expect(result).toBeNull();
	});

	test("returns null when all entries are failed", () => {
		const history = [
			{ sha: "a", tag: "v1.0.0", deployed_at: "2026-01-01T00:00:00Z", deployed_by: "ci", status: "failed" as const },
		];
		const result = getPreviousSuccessfulTag(history, undefined);
		expect(result).toBeNull();
	});

	test("returns the most recent success tag when no currentTag specified", () => {
		const history = [
			{ sha: "a", tag: "v0.9.0", deployed_at: "2026-01-01T00:00:00Z", deployed_by: "ci", status: "success" as const },
			{ sha: "b", tag: "v1.0.0", deployed_at: "2026-02-01T00:00:00Z", deployed_by: "ci", status: "success" as const },
		];
		const result = getPreviousSuccessfulTag(history, undefined);
		expect(result).toBe("v1.0.0");
	});

	test("skips the current tag and returns the previous success tag", () => {
		const history = [
			{ sha: "a", tag: "v0.9.0", deployed_at: "2026-01-01T00:00:00Z", deployed_by: "ci", status: "success" as const },
			{ sha: "b", tag: "v1.0.0", deployed_at: "2026-02-01T00:00:00Z", deployed_by: "ci", status: "success" as const },
		];
		const result = getPreviousSuccessfulTag(history, "v1.0.0");
		expect(result).toBe("v0.9.0");
	});

	test("skips failed entries between current and previous success", () => {
		const history = [
			{ sha: "a", tag: "v0.9.0", deployed_at: "2026-01-01T00:00:00Z", deployed_by: "ci", status: "success" as const },
			{ sha: "b", tag: "v1.0.0", deployed_at: "2026-02-01T00:00:00Z", deployed_by: "ci", status: "failed" as const },
			{ sha: "c", tag: "v1.1.0", deployed_at: "2026-03-01T00:00:00Z", deployed_by: "ci", status: "success" as const },
		];
		const result = getPreviousSuccessfulTag(history, "v1.1.0");
		expect(result).toBe("v0.9.0");
	});

	test("returns targetTag override directly when provided", () => {
		const history = [
			{ sha: "a", tag: "v0.8.0", deployed_at: "2026-01-01T00:00:00Z", deployed_by: "ci", status: "success" as const },
			{ sha: "b", tag: "v0.9.0", deployed_at: "2026-02-01T00:00:00Z", deployed_by: "ci", status: "success" as const },
			{ sha: "c", tag: "v1.0.0", deployed_at: "2026-03-01T00:00:00Z", deployed_by: "ci", status: "success" as const },
		];
		// When targetTag is explicitly provided, return it directly if it exists in history
		const result = getPreviousSuccessfulTag(history, "v1.0.0", "v0.8.0");
		expect(result).toBe("v0.8.0");
	});

	test("skips rolled_back entries and returns the previous success", () => {
		const history = [
			{ sha: "a", tag: "v0.9.0", deployed_at: "2026-01-01T00:00:00Z", deployed_by: "ci", status: "success" as const },
			{ sha: "b", tag: "v1.0.0", deployed_at: "2026-02-01T00:00:00Z", deployed_by: "ci", status: "rolled_back" as const },
			{ sha: "c", tag: "v1.1.0", deployed_at: "2026-03-01T00:00:00Z", deployed_by: "ci", status: "success" as const },
		];
		const result = getPreviousSuccessfulTag(history, "v1.1.0");
		expect(result).toBe("v0.9.0");
	});

	test("returns null when current is the only success entry", () => {
		const history = [
			{ sha: "a", tag: "v1.0.0", deployed_at: "2026-01-01T00:00:00Z", deployed_by: "ci", status: "success" as const },
		];
		const result = getPreviousSuccessfulTag(history, "v1.0.0");
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// buildRollbackRecord
// ---------------------------------------------------------------------------

describe("buildRollbackRecord", () => {
	test("builds a rollback record with rolled_back status", () => {
		const record = buildRollbackRecord({
			tag: "v0.9.0",
			rolledBackFrom: "v1.0.0",
		});
		expect(record.sha).toBeNull();
		expect(record.tag).toBe("v0.9.0");
		expect(record.deployed_by).toBe("rollback");
		expect(record.status).toBe("rolled_back");
		expect(record.rolled_back_from).toBe("v1.0.0");
		expect(record.deployed_at).toBeDefined();
		expect(() => new Date(record.deployed_at)).not.toThrow();
	});

	test("deployed_at is a valid ISO 8601 string", () => {
		const record = buildRollbackRecord({ tag: "v0.9.0", rolledBackFrom: "v1.0.0" });
		const d = new Date(record.deployed_at);
		expect(Number.isNaN(d.getTime())).toBe(false);
	});

	test("deployed_by is always 'rollback'", () => {
		const record = buildRollbackRecord({ tag: "v0.5.0", rolledBackFrom: "v0.6.0" });
		expect(record.deployed_by).toBe("rollback");
	});
});

// ---------------------------------------------------------------------------
// evaluatePostRollbackHealth
// ---------------------------------------------------------------------------

describe("evaluatePostRollbackHealth", () => {
	test("returns ok when HTTP 200 with no gaps and acceptable p95", () => {
		const result = evaluatePostRollbackHealth({
			httpStatus: 200,
			candleGaps: 0,
			pipelineP95Ms: 1500,
		});
		expect(result.ok).toBe(true);
	});

	test("returns error when response is null (timeout)", () => {
		const result = evaluatePostRollbackHealth(null);
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(ROLLBACK_ERROR_CODES.ERR_ROLLBACK_HEALTH_FAILED);
	});

	test("returns error when HTTP status is not 200", () => {
		const result = evaluatePostRollbackHealth({ httpStatus: 503, candleGaps: 0, pipelineP95Ms: 0 });
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(ROLLBACK_ERROR_CODES.ERR_ROLLBACK_HEALTH_FAILED);
	});

	test("returns error when candleGaps is greater than 0", () => {
		const result = evaluatePostRollbackHealth({ httpStatus: 200, candleGaps: 1, pipelineP95Ms: 0 });
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(ROLLBACK_ERROR_CODES.ERR_ROLLBACK_HEALTH_FAILED);
	});

	test("returns error when pipelineP95Ms exceeds 2000", () => {
		const result = evaluatePostRollbackHealth({ httpStatus: 200, candleGaps: 0, pipelineP95Ms: 2001 });
		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe(ROLLBACK_ERROR_CODES.ERR_ROLLBACK_HEALTH_FAILED);
	});

	test("passes when pipelineP95Ms is exactly 2000 (boundary)", () => {
		const result = evaluatePostRollbackHealth({ httpStatus: 200, candleGaps: 0, pipelineP95Ms: 2000 });
		expect(result.ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// buildRollbackPlan (dry-run mode)
// ---------------------------------------------------------------------------

describe("buildRollbackPlan", () => {
	test("returns a plan with all expected step names", () => {
		const plan = buildRollbackPlan({ previousTag: "v0.9.0", currentTag: "v1.0.0" });
		const stepNames = plan.steps.map((s) => s.name);
		expect(stepNames).toContain("resolve-target");
		expect(stepNames).toContain("docker-pull");
		expect(stepNames).toContain("docker-up");
		expect(stepNames).toContain("post-rollback-health");
		expect(stepNames).toContain("append-history");
	});

	test("plan includes the previous tag", () => {
		const plan = buildRollbackPlan({ previousTag: "v0.9.0", currentTag: "v1.0.0" });
		expect(plan.previousTag).toBe("v0.9.0");
	});

	test("plan includes the current tag being replaced", () => {
		const plan = buildRollbackPlan({ previousTag: "v0.9.0", currentTag: "v1.0.0" });
		expect(plan.currentTag).toBe("v1.0.0");
	});

	test("each step has a non-empty description", () => {
		const plan = buildRollbackPlan({ previousTag: "v0.9.0", currentTag: "v1.0.0" });
		for (const step of plan.steps) {
			expect(step.description.length).toBeGreaterThan(0);
		}
	});
});

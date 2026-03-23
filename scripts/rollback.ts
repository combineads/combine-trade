/**
 * rollback.ts — Rollback orchestrator for Combine Trade.
 *
 * Reads the previous successful image tag from deploy-history.json,
 * pulls that image, swaps containers via docker compose, verifies
 * system health, appends a rollback event to the history log, and
 * optionally sends a Slack notification.
 *
 * Usage:
 *   bun run scripts/rollback.ts [--target-tag <tag>] [--dry-run]
 *
 * Exit codes:
 *   0 — Rollback succeeded and health check passed
 *   1 — No previous successful deploy found in history
 *   2 — Docker swap failed
 *   3 — Post-rollback health check timed out
 *
 * All pure helper functions are exported for unit testing.
 * The main() entry point is guarded by import.meta.main.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Re-use types and utilities from deploy.ts where possible
import {
	DEPLOY_HISTORY_PATH,
	DOCKER_COMPOSE_FILE,
	type DeployRecord,
	HEALTH_URL,
	POST_DEPLOY_PIPELINE_P95_LIMIT_MS,
	appendDeployEntry,
} from "./deploy";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ROLLBACK_HEALTH_TIMEOUT_MS = 60_000;
export const ROLLBACK_HEALTH_POLL_INTERVAL_MS = 3_000;

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const ROLLBACK_ERROR_CODES = {
	ERR_NO_PREVIOUS_DEPLOY: "ERR_NO_PREVIOUS_DEPLOY",
	ERR_DOCKER_SWAP_FAILED: "ERR_DOCKER_SWAP_FAILED",
	ERR_ROLLBACK_HEALTH_FAILED: "ERR_ROLLBACK_HEALTH_FAILED",
} as const;

export type RollbackErrorCode = (typeof ROLLBACK_ERROR_CODES)[keyof typeof ROLLBACK_ERROR_CODES];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RollbackCheckResult {
	ok: boolean;
	errorCode?: RollbackErrorCode;
	message?: string;
}

export interface RollbackRecord {
	sha: null;
	tag: string;
	deployed_at: string;
	deployed_by: "rollback";
	status: "rolled_back";
	rolled_back_from: string;
}

export interface RollbackArgs {
	dryRun: boolean;
	targetTag?: string;
	error?: string;
}

export interface HealthResponse {
	httpStatus: number | null;
	networkError?: string;
	candleGaps?: number;
	pipelineP95Ms?: number;
}

export interface RollbackPlanStep {
	name: string;
	description: string;
	note?: string;
}

export interface RollbackPlan {
	previousTag: string;
	currentTag: string;
	steps: RollbackPlanStep[];
}

// ---------------------------------------------------------------------------
// parseRollbackArgs — parse CLI arguments into a typed object
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments for the rollback script.
 * Returns an error field if required argument values are missing.
 */
export function parseRollbackArgs(args: string[]): RollbackArgs {
	const result: RollbackArgs = {
		dryRun: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--dry-run") {
			result.dryRun = true;
		} else if (arg === "--target-tag") {
			const next = args[i + 1];
			if (!next || next.startsWith("--")) {
				result.error = "--target-tag requires a value (e.g., --target-tag v0.9.0)";
				return result;
			}
			result.targetTag = next;
			i++;
		}
	}

	return result;
}

// ---------------------------------------------------------------------------
// getPreviousSuccessfulTag — resolve rollback target from history
// ---------------------------------------------------------------------------

/**
 * Find the rollback target tag from deploy history.
 *
 * Resolution order:
 *   1. If `overrideTag` is provided, return it directly (CLI --target-tag).
 *   2. Otherwise, scan history in reverse for the most recent "success" entry
 *      that does not match `currentTag`.
 *
 * Returns null if no suitable entry is found.
 */
export function getPreviousSuccessfulTag(
	history: DeployRecord[],
	currentTag: string | undefined,
	overrideTag?: string,
): string | null {
	// Override takes precedence
	if (overrideTag !== undefined) {
		return overrideTag;
	}

	// Scan in reverse to find the most recent success entry excluding current
	for (let i = history.length - 1; i >= 0; i--) {
		const entry = history[i];
		if (!entry) continue;
		if (entry.status !== "success") continue;
		if (currentTag !== undefined && entry.tag === currentTag) continue;
		return entry.tag;
	}

	return null;
}

// ---------------------------------------------------------------------------
// buildRollbackRecord — construct the history append entry
// ---------------------------------------------------------------------------

/**
 * Build a RollbackRecord with the current timestamp.
 * sha is always null for rollback events (no new code commit).
 */
export function buildRollbackRecord(opts: {
	tag: string;
	rolledBackFrom: string;
}): RollbackRecord {
	return {
		sha: null,
		tag: opts.tag,
		deployed_at: new Date().toISOString(),
		deployed_by: "rollback",
		status: "rolled_back",
		rolled_back_from: opts.rolledBackFrom,
	};
}

// ---------------------------------------------------------------------------
// evaluatePostRollbackHealth — validate health after rollback
// ---------------------------------------------------------------------------

/**
 * Evaluate the post-rollback health response against required thresholds:
 *   - HTTP 200
 *   - candle_gaps == 0
 *   - pipeline_p95_ms <= 2000
 *
 * Accepts the parsed health response, or null to indicate timeout/network failure.
 */
export function evaluatePostRollbackHealth(
	response: {
		httpStatus: number | null;
		candleGaps?: number;
		pipelineP95Ms?: number;
	} | null,
): RollbackCheckResult {
	if (response === null) {
		return {
			ok: false,
			errorCode: ROLLBACK_ERROR_CODES.ERR_ROLLBACK_HEALTH_FAILED,
			message: "Post-rollback health check failed: no response (network error or timeout)",
		};
	}

	if (response.httpStatus !== 200) {
		return {
			ok: false,
			errorCode: ROLLBACK_ERROR_CODES.ERR_ROLLBACK_HEALTH_FAILED,
			message: `Post-rollback health returned HTTP ${response.httpStatus}, expected 200`,
		};
	}

	const candleGaps = response.candleGaps ?? 0;
	if (candleGaps > 0) {
		return {
			ok: false,
			errorCode: ROLLBACK_ERROR_CODES.ERR_ROLLBACK_HEALTH_FAILED,
			message: `Post-rollback health check failed: ${candleGaps} candle gap(s) detected`,
		};
	}

	const p95 = response.pipelineP95Ms ?? 0;
	if (p95 > POST_DEPLOY_PIPELINE_P95_LIMIT_MS) {
		return {
			ok: false,
			errorCode: ROLLBACK_ERROR_CODES.ERR_ROLLBACK_HEALTH_FAILED,
			message: `Post-rollback health check failed: p95 latency ${p95}ms exceeds limit of ${POST_DEPLOY_PIPELINE_P95_LIMIT_MS}ms`,
		};
	}

	return { ok: true };
}

// ---------------------------------------------------------------------------
// buildRollbackPlan — dry-run plan builder
// ---------------------------------------------------------------------------

/**
 * Build a human-readable rollback plan for --dry-run mode.
 * Returns all steps that would be executed without performing them.
 */
export function buildRollbackPlan(opts: {
	previousTag: string;
	currentTag: string;
}): RollbackPlan {
	const steps: RollbackPlanStep[] = [
		{
			name: "resolve-target",
			description: `Resolved rollback target: ${opts.previousTag} (rolling back from ${opts.currentTag})`,
		},
		{
			name: "docker-pull",
			description: `docker compose -f docker-compose.prod.yml pull (TAG=${opts.previousTag})`,
		},
		{
			name: "docker-up",
			description: `TAG=${opts.previousTag} docker compose -f docker-compose.prod.yml up -d`,
		},
		{
			name: "post-rollback-health",
			description: `Poll ${HEALTH_URL} every ${ROLLBACK_HEALTH_POLL_INTERVAL_MS / 1000}s up to ${ROLLBACK_HEALTH_TIMEOUT_MS / 1000}s — verify HTTP 200, candle_gaps=0, pipeline_p95_ms <= ${POST_DEPLOY_PIPELINE_P95_LIMIT_MS}`,
		},
		{
			name: "append-history",
			description: `Append rollback entry to ${DEPLOY_HISTORY_PATH} with status "rolled_back"`,
		},
	];

	return { previousTag: opts.previousTag, currentTag: opts.currentTag, steps };
}

// ---------------------------------------------------------------------------
// I/O helpers (non-pure; not exported for test)
// ---------------------------------------------------------------------------

function readDeployHistory(): DeployRecord[] {
	if (!existsSync(DEPLOY_HISTORY_PATH)) {
		return [];
	}
	try {
		const raw = readFileSync(DEPLOY_HISTORY_PATH, "utf-8");
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed as DeployRecord[];
	} catch {
		return [];
	}
}

function writeDeployHistory(history: unknown[]): void {
	writeFileSync(DEPLOY_HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`, "utf-8");
}

async function fetchHealth(url: string): Promise<HealthResponse> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
		if (!res.ok) {
			return { httpStatus: res.status };
		}
		// biome-ignore lint/suspicious/noExplicitAny: health response shape is not typed
		const body = (await res.json()) as any;
		return {
			httpStatus: res.status,
			candleGaps: typeof body.candle_gaps === "number" ? body.candle_gaps : 0,
			pipelineP95Ms: typeof body.pipeline_p95_ms === "number" ? body.pipeline_p95_ms : 0,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { httpStatus: null, networkError: message };
	}
}

function runDocker(args: string[], tag: string): boolean {
	const result = spawnSync("docker", ["compose", "-f", DOCKER_COMPOSE_FILE, ...args], {
		stdio: "inherit",
		env: { ...process.env, TAG: tag },
	});
	return result.status === 0;
}

async function pollHealthUntilReady(
	url: string,
	timeoutMs: number,
	pollMs: number,
): Promise<HealthResponse | null> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const response = await fetchHealth(url);
		if (response.httpStatus === 200) {
			return response;
		}
		await new Promise((r) => setTimeout(r, pollMs));
	}
	return null;
}

async function sendSlackAlert(webhookUrl: string, message: string): Promise<void> {
	try {
		await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text: message }),
		});
	} catch (err) {
		// Slack failure must never abort rollback
		const msg = err instanceof Error ? err.message : String(err);
		log(`WARNING: Slack notification failed: ${msg}`);
	}
}

// ---------------------------------------------------------------------------
// main — orchestration entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const historyPath = process.env.DEPLOY_HISTORY_PATH ?? DEPLOY_HISTORY_PATH;

	const args = parseRollbackArgs(process.argv.slice(2));

	if (args.error) {
		console.error(`[rollback] ERROR: ${args.error}`);
		console.error("[rollback] Usage: bun run scripts/rollback.ts [--target-tag <tag>] [--dry-run]");
		process.exit(1);
	}

	if (args.dryRun) {
		log("DRY-RUN mode — no Docker commands will execute, history will not be written");
	}

	// -------------------------------------------------------------------------
	// Step 1: Read history and resolve rollback target
	// -------------------------------------------------------------------------

	const historyExists = existsSync(historyPath);
	if (!historyExists) {
		console.error("[rollback] No deploy history found — cannot rollback");
		process.exit(1);
	}

	let rawHistory: DeployRecord[];
	try {
		const raw = readFileSync(historyPath, "utf-8").trim();
		if (!raw) {
			console.error("[rollback] No deploy history found — cannot rollback");
			process.exit(1);
		}
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed) || parsed.length === 0) {
			console.error("[rollback] No deploy history found — cannot rollback");
			process.exit(1);
		}
		rawHistory = parsed as DeployRecord[];
	} catch {
		console.error("[rollback] No deploy history found — cannot rollback");
		process.exit(1);
	}

	// Determine the currently running tag: last success in history
	let currentTag: string | undefined;
	for (let i = rawHistory.length - 1; i >= 0; i--) {
		const entry = rawHistory[i];
		if (entry && entry.status === "success") {
			currentTag = entry.tag;
			break;
		}
	}

	const previousTag = getPreviousSuccessfulTag(rawHistory, currentTag, args.targetTag);

	if (previousTag === null) {
		console.error("[rollback] No previous successful deploy found — cannot rollback");
		process.exit(1);
	}

	log(`Rollback target resolved: ${previousTag}`);
	if (currentTag) {
		log(`Rolling back from: ${currentTag}`);
	}

	// -------------------------------------------------------------------------
	// Dry-run: print plan and exit
	// -------------------------------------------------------------------------

	if (args.dryRun) {
		const plan = buildRollbackPlan({
			previousTag,
			currentTag: currentTag ?? "(unknown)",
		});
		log(`\nRollback plan: ${plan.currentTag} → ${plan.previousTag}`);
		for (const step of plan.steps) {
			const note = step.note ? ` [${step.note}]` : "";
			log(`  [${step.name}] ${step.description}${note}`);
		}
		log("\nDRY-RUN complete. No changes made.");
		process.exit(0);
	}

	// -------------------------------------------------------------------------
	// Step 2: Pull previous image
	// -------------------------------------------------------------------------

	log(`\n[step 1/3] Pulling image TAG=${previousTag}`);
	if (!runDocker(["pull"], previousTag)) {
		console.error("[rollback] ERROR: docker compose pull failed.");
		process.exit(2);
	}
	log("  [docker-pull] DONE");

	// -------------------------------------------------------------------------
	// Step 3: Swap containers
	// -------------------------------------------------------------------------

	log(`\n[step 2/3] Swapping containers to TAG=${previousTag}`);
	if (!runDocker(["up", "-d"], previousTag)) {
		console.error("[rollback] ERROR: docker compose up -d failed.");
		process.exit(2);
	}
	log("  [docker-up] DONE");

	// -------------------------------------------------------------------------
	// Step 4: Post-rollback health verification
	// -------------------------------------------------------------------------

	log("\n[step 3/3] Post-rollback health verification...");
	log(
		`  Polling ${HEALTH_URL} every ${ROLLBACK_HEALTH_POLL_INTERVAL_MS / 1000}s for up to ${ROLLBACK_HEALTH_TIMEOUT_MS / 1000}s`,
	);

	const healthResponse = await pollHealthUntilReady(
		HEALTH_URL,
		ROLLBACK_HEALTH_TIMEOUT_MS,
		ROLLBACK_HEALTH_POLL_INTERVAL_MS,
	);

	const healthResult = evaluatePostRollbackHealth(healthResponse);

	if (!healthResult.ok) {
		console.error(
			`[rollback] ${ROLLBACK_ERROR_CODES.ERR_ROLLBACK_HEALTH_FAILED}: ${healthResult.message}`,
		);
		console.error("[rollback] Manual intervention required — previous image may also be broken.");
		process.exit(3);
	}

	log("  [post-rollback-health] PASS");

	// -------------------------------------------------------------------------
	// Step 5: Append rollback event to history
	// -------------------------------------------------------------------------

	const rollbackRecord = buildRollbackRecord({
		tag: previousTag,
		rolledBackFrom: currentTag ?? "(unknown)",
	});

	// Re-read history to get the latest state (in case deploy ran concurrently)
	const freshHistory = readDeployHistory();
	writeDeployHistory(appendDeployEntry(freshHistory, rollbackRecord));
	log(`  Rollback entry appended to ${historyPath}`);

	// -------------------------------------------------------------------------
	// Step 6: Optional Slack notification
	// -------------------------------------------------------------------------

	const slackWebhook = process.env.SLACK_WEBHOOK_URL;
	if (slackWebhook) {
		const message = `Rollback complete: ${currentTag ?? "(unknown)"} → ${previousTag} at ${new Date().toISOString()}`;
		await sendSlackAlert(slackWebhook, message);
		log("  Slack notification sent.");
	}

	log("\n[rollback] SUCCESS");
	log(`  Rolled back to:  ${previousTag}`);
	log(`  Rolled back from: ${currentTag ?? "(unknown)"}`);
	log(`  History:         ${historyPath}`);
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function log(_msg: string): void {}

// ---------------------------------------------------------------------------
// Entry point guard
// ---------------------------------------------------------------------------

if (import.meta.main) {
	main().catch((err) => {
		console.error("[rollback] Unexpected error:", err);
		process.exit(1);
	});
}

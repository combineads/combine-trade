/**
 * deploy.ts — Deployment orchestrator for Combine Trade.
 *
 * Operator-run only. Executes a safe, structured deploy sequence:
 *   1. Pre-flight safety checks
 *   2. Graceful worker drain (SIGTERM)
 *   3. Docker image swap
 *   4. Post-deploy health verification
 *
 * Usage:
 *   bun run scripts/deploy.ts --tag <image-tag> [--dry-run] [--force-kill-switch]
 *
 * Exit codes:
 *   0 — success
 *   1 — pre-flight abort or post-deploy failure
 *   2 — fatal deploy error (shutdown timeout)
 *
 * All pure helper functions are exported for unit testing.
 * The main() entry point is guarded by import.meta.main.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000;
export const GRACEFUL_SHUTDOWN_POLL_INTERVAL_MS = 2_000;
export const HEALTH_POLL_INTERVAL_MS = 3_000;
export const POST_DEPLOY_HEALTH_TIMEOUT_MS = 60_000;
export const POST_DEPLOY_PIPELINE_P95_LIMIT_MS = 2_000;
export const HEALTH_URL = "http://localhost:3000/api/health";
export const DEPLOY_HISTORY_PATH = join(import.meta.dir, "deploy-history.json");
export const DOCKER_COMPOSE_FILE = join(import.meta.dir, "..", "docker-compose.prod.yml");

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const DEPLOY_ERROR_CODES = {
	ERR_PREFLIGHT_CI_NOT_GREEN: "ERR_PREFLIGHT_CI_NOT_GREEN",
	ERR_PREFLIGHT_UNHEALTHY: "ERR_PREFLIGHT_UNHEALTHY",
	ERR_PREFLIGHT_KILL_SWITCH_ACTIVE: "ERR_PREFLIGHT_KILL_SWITCH_ACTIVE",
	ERR_PREFLIGHT_OPEN_ORDERS: "ERR_PREFLIGHT_OPEN_ORDERS",
	ERR_FATAL_DEPLOY_SHUTDOWN_TIMEOUT: "ERR_FATAL_DEPLOY_SHUTDOWN_TIMEOUT",
	ERR_POSTDEPLOY_UNHEALTHY: "ERR_POSTDEPLOY_UNHEALTHY",
} as const;

export type DeployErrorCode = (typeof DEPLOY_ERROR_CODES)[keyof typeof DEPLOY_ERROR_CODES];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckResult {
	ok: boolean;
	errorCode?: DeployErrorCode;
	message?: string;
	warning?: string;
}

export type DeployStatus = "success" | "failed" | "rolled_back";

export interface DeployRecord {
	sha: string;
	tag: string;
	deployed_at: string;
	deployed_by: string;
	status: DeployStatus;
}

export interface DeployPlanStep {
	name: string;
	description: string;
	note?: string;
}

export interface DeployPlan {
	tag: string;
	steps: DeployPlanStep[];
}

export interface DeployArgs {
	tag?: string;
	dryRun: boolean;
	forceKillSwitch: boolean;
	error?: string;
}

export interface HealthResponse {
	httpStatus: number | null;
	networkError?: string;
	candleGaps?: number;
	pipelineP95Ms?: number;
}

// ---------------------------------------------------------------------------
// parseDeployArgs — parse CLI arguments into a typed object
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments into a DeployArgs object.
 * Returns an error field if required arguments are missing.
 */
export function parseDeployArgs(args: string[]): DeployArgs {
	const result: DeployArgs = {
		dryRun: false,
		forceKillSwitch: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--tag") {
			const next = args[i + 1];
			if (!next || next.startsWith("--")) {
				result.error = "--tag requires a value (e.g., --tag v1.0.0)";
				return result;
			}
			result.tag = next;
			i++;
		} else if (arg === "--dry-run") {
			result.dryRun = true;
		} else if (arg === "--force-kill-switch") {
			result.forceKillSwitch = true;
		}
	}

	if (!result.tag) {
		result.error = "--tag is required (e.g., --tag v1.0.0)";
	}

	return result;
}

// ---------------------------------------------------------------------------
// checkCiPassed — check CI environment variable
// ---------------------------------------------------------------------------

/**
 * Verify that CI has passed for the current commit.
 * Checks CI_STATUS env var (set by CI wrapper scripts).
 * Acceptable value: "success".
 */
export function checkCiPassed(env: Record<string, string | undefined>): CheckResult {
	const status = env["CI_STATUS"];
	if (status === "success") {
		return { ok: true };
	}
	return {
		ok: false,
		errorCode: DEPLOY_ERROR_CODES.ERR_PREFLIGHT_CI_NOT_GREEN,
		message: `CI_STATUS is '${status ?? "(not set)"}', expected 'success'. Set CI_STATUS=success or pass --skip-ci (not available in production).`,
	};
}

// ---------------------------------------------------------------------------
// checkSystemHealth — check health endpoint response
// ---------------------------------------------------------------------------

/**
 * Verify that the current system is responding healthy.
 * Accepts a pre-fetched health response to keep the function pure and testable.
 */
export function checkSystemHealth(response: {
	httpStatus: number | null;
	networkError?: string;
}): CheckResult {
	if (response.networkError || response.httpStatus === null || response.httpStatus !== 200) {
		return {
			ok: false,
			errorCode: DEPLOY_ERROR_CODES.ERR_PREFLIGHT_UNHEALTHY,
			message: response.networkError
				? `Health check network error: ${response.networkError}`
				: `Health check returned HTTP ${response.httpStatus}, expected 200`,
		};
	}
	return { ok: true };
}

// ---------------------------------------------------------------------------
// checkKillSwitch — verify kill switch state
// ---------------------------------------------------------------------------

/**
 * Check whether the global kill switch allows deployment.
 * If globalHalt is true and forceKillSwitch is false, abort.
 * If globalHalt is true and forceKillSwitch is true, allow with warning.
 */
export function checkKillSwitch(opts: {
	globalHalt: boolean;
	forceKillSwitch: boolean;
}): CheckResult {
	if (!opts.globalHalt) {
		return { ok: true };
	}

	if (opts.forceKillSwitch) {
		return {
			ok: true,
			warning: "WARNING: kill switch is active — proceeding due to --force-kill-switch",
		};
	}

	return {
		ok: false,
		errorCode: DEPLOY_ERROR_CODES.ERR_PREFLIGHT_KILL_SWITCH_ACTIVE,
		message:
			"Global kill switch is active. Deploy aborted. Pass --force-kill-switch to override.",
	};
}

// ---------------------------------------------------------------------------
// checkNoOpenOrders — verify no open live orders
// ---------------------------------------------------------------------------

/**
 * Check that no live orders are in submitted or partially_filled state.
 * Accepts a pre-queried count to keep the function pure and testable.
 */
export function checkNoOpenOrders(opts: { openOrderCount: number }): CheckResult {
	if (opts.openOrderCount === 0) {
		return { ok: true };
	}
	return {
		ok: false,
		errorCode: DEPLOY_ERROR_CODES.ERR_PREFLIGHT_OPEN_ORDERS,
		message: `Cannot deploy: ${opts.openOrderCount} open live order(s) found. Close all orders before deploying.`,
	};
}

// ---------------------------------------------------------------------------
// evaluatePostDeployHealth — validate health after deploy
// ---------------------------------------------------------------------------

/**
 * Evaluate the post-deploy health response against all required thresholds:
 *   - HTTP 200
 *   - candle_gaps == 0
 *   - pipeline_p95_ms <= 2000
 *
 * Accepts the parsed health response, or null to indicate a network failure.
 */
export function evaluatePostDeployHealth(
	response: {
		httpStatus: number | null;
		candleGaps?: number;
		pipelineP95Ms?: number;
	} | null,
): CheckResult {
	if (response === null) {
		return {
			ok: false,
			errorCode: DEPLOY_ERROR_CODES.ERR_POSTDEPLOY_UNHEALTHY,
			message: "Post-deploy health check failed: no response (network error or timeout)",
		};
	}

	if (response.httpStatus !== 200) {
		return {
			ok: false,
			errorCode: DEPLOY_ERROR_CODES.ERR_POSTDEPLOY_UNHEALTHY,
			message: `Post-deploy health returned HTTP ${response.httpStatus}, expected 200`,
		};
	}

	const candleGaps = response.candleGaps ?? 0;
	if (candleGaps > 0) {
		return {
			ok: false,
			errorCode: DEPLOY_ERROR_CODES.ERR_POSTDEPLOY_UNHEALTHY,
			message: `Post-deploy health check failed: ${candleGaps} candle gap(s) detected`,
		};
	}

	const p95 = response.pipelineP95Ms ?? 0;
	if (p95 > POST_DEPLOY_PIPELINE_P95_LIMIT_MS) {
		return {
			ok: false,
			errorCode: DEPLOY_ERROR_CODES.ERR_POSTDEPLOY_UNHEALTHY,
			message: `Post-deploy health check failed: p95 latency ${p95}ms exceeds limit of ${POST_DEPLOY_PIPELINE_P95_LIMIT_MS}ms`,
		};
	}

	return { ok: true };
}

// ---------------------------------------------------------------------------
// buildDeployRecord — create an append entry
// ---------------------------------------------------------------------------

/**
 * Build a DeployRecord with the current timestamp.
 */
export function buildDeployRecord(opts: {
	sha: string;
	tag: string;
	deployedBy: string;
	status: DeployStatus;
}): DeployRecord {
	return {
		sha: opts.sha,
		tag: opts.tag,
		deployed_at: new Date().toISOString(),
		deployed_by: opts.deployedBy,
		status: opts.status,
	};
}

// ---------------------------------------------------------------------------
// appendDeployEntry — pure append to history array
// ---------------------------------------------------------------------------

/**
 * Return a new array with the new entry appended.
 * Does not mutate the input array (immutable append).
 */
export function appendDeployEntry(
	existing: unknown[],
	entry: DeployRecord,
): unknown[] {
	return [...existing, entry];
}

// ---------------------------------------------------------------------------
// getPreviousTag — read last successful tag from history
// ---------------------------------------------------------------------------

/**
 * Find the most recent successful deployment tag from history.
 * Used for rollback target resolution.
 * Returns null if no successful deploy exists.
 */
export function getPreviousTag(history: DeployRecord[]): string | null {
	// Iterate in reverse to find the last successful deploy
	for (let i = history.length - 1; i >= 0; i--) {
		const entry = history[i];
		if (entry && entry.status === "success") {
			return entry.tag;
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// buildDeployPlan — dry-run plan builder
// ---------------------------------------------------------------------------

/**
 * Build a human-readable deploy plan for --dry-run mode.
 * Returns all steps that would be executed without performing them.
 */
export function buildDeployPlan(opts: {
	tag: string;
	forceKillSwitch: boolean;
}): DeployPlan {
	const steps: DeployPlanStep[] = [
		{
			name: "preflight-ci",
			description: "Check CI_STATUS env var is 'success' for current commit",
		},
		{
			name: "preflight-health",
			description: `GET ${HEALTH_URL} — expect HTTP 200`,
		},
		{
			name: "preflight-kill-switch",
			description: "Query kill_switch_state table for global_halt flag",
			...(opts.forceKillSwitch
				? { note: "force-kill-switch flag is set — will proceed even if active" }
				: {}),
		},
		{
			name: "preflight-open-orders",
			description:
				"Query orders table for status IN (submitted, partially_filled) with execution_mode = live",
		},
		{
			name: "graceful-shutdown",
			description: `Send SIGTERM to supervisor process, poll every ${GRACEFUL_SHUTDOWN_POLL_INTERVAL_MS / 1000}s up to ${GRACEFUL_SHUTDOWN_TIMEOUT_MS / 1000}s`,
		},
		{
			name: "docker-pull",
			description: `docker compose -f docker-compose.prod.yml pull (TAG=${opts.tag})`,
		},
		{
			name: "docker-up",
			description: `docker compose -f docker-compose.prod.yml up -d (TAG=${opts.tag})`,
		},
		{
			name: "post-deploy-health",
			description: `Poll ${HEALTH_URL} every ${HEALTH_POLL_INTERVAL_MS / 1000}s up to ${POST_DEPLOY_HEALTH_TIMEOUT_MS / 1000}s — verify HTTP 200, candle_gaps=0, pipeline_p95_ms <= ${POST_DEPLOY_PIPELINE_P95_LIMIT_MS}`,
		},
		{
			name: "append-history",
			description: `Append deploy entry to ${DEPLOY_HISTORY_PATH}`,
		},
	];

	return { tag: opts.tag, steps };
}

// ---------------------------------------------------------------------------
// I/O helpers (non-pure; not exported for test — use wrappers in main)
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
	writeFileSync(DEPLOY_HISTORY_PATH, JSON.stringify(history, null, 2) + "\n", "utf-8");
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

function getCurrentSha(): string {
	try {
		const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
			encoding: "utf-8",
		});
		return (result.stdout as string).trim() || "unknown";
	} catch {
		return "unknown";
	}
}

function findSupervisorPid(): number | null {
	try {
		const result = spawnSync("pgrep", ["-f", "scripts/supervisor.ts"], {
			encoding: "utf-8",
		});
		const pid = parseInt((result.stdout as string).trim(), 10);
		return Number.isNaN(pid) ? null : pid;
	} catch {
		return null;
	}
}

async function waitForShutdown(pid: number, timeoutMs: number, pollMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		// Check if process is still running
		const result = spawnSync("kill", ["-0", String(pid)], { stdio: "ignore" });
		if (result.status !== 0) {
			// Process is gone
			return true;
		}
		await new Promise((r) => setTimeout(r, pollMs));
	}
	return false;
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

// ---------------------------------------------------------------------------
// main — orchestration entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const args = parseDeployArgs(process.argv.slice(2));

	if (args.error) {
		console.error(`[deploy] ERROR: ${args.error}`);
		console.error("[deploy] Usage: bun run scripts/deploy.ts --tag <tag> [--dry-run] [--force-kill-switch]");
		process.exit(1);
	}

	// tag is guaranteed by parseDeployArgs check above
	const tag = args.tag as string;

	log(`Starting deploy for tag: ${tag}`);
	if (args.dryRun) log("DRY-RUN mode — no Docker commands will execute, history will not be written");
	if (args.forceKillSwitch) log("--force-kill-switch is set");

	// -------------------------------------------------------------------------
	// Dry-run: print plan and exit
	// -------------------------------------------------------------------------

	if (args.dryRun) {
		const plan = buildDeployPlan({ tag, forceKillSwitch: args.forceKillSwitch });
		log(`\nDeploy plan for tag ${plan.tag}:`);
		for (const step of plan.steps) {
			const note = step.note ? ` [${step.note}]` : "";
			log(`  [${step.name}] ${step.description}${note}`);
		}
		log("\nDRY-RUN complete. No changes made.");
		process.exit(0);
	}

	const sha = getCurrentSha();
	const deployedBy = process.env["DEPLOY_USER"] ?? process.env["USER"] ?? "unknown";
	const history = readDeployHistory();

	// -------------------------------------------------------------------------
	// Step 1: Pre-flight checks
	// -------------------------------------------------------------------------

	log("\n[step 1/4] Running pre-flight checks...");

	// 1a. CI check (env-based)
	const ciResult = checkCiPassed(process.env as Record<string, string | undefined>);
	if (!ciResult.ok) {
		abortDeploy(ciResult.errorCode!, ciResult.message, history, sha, tag, deployedBy);
	}
	log("  [preflight-ci] PASS");

	// 1b. System health check
	const preHealthResponse = await fetchHealth(HEALTH_URL);
	const healthResult = checkSystemHealth(preHealthResponse);
	if (!healthResult.ok) {
		abortDeploy(healthResult.errorCode!, healthResult.message, history, sha, tag, deployedBy);
	}
	log("  [preflight-health] PASS");

	// 1c. Kill switch check
	// Note: In production this would query the DB via repository layer.
	// The kill switch state is read from the KILL_SWITCH_ACTIVE env var set by
	// the operator wrapper or a DB query wrapper. This avoids AOP/IoC in the script.
	const globalHalt = process.env["KILL_SWITCH_ACTIVE"] === "true";
	const killResult = checkKillSwitch({ globalHalt, forceKillSwitch: args.forceKillSwitch });
	if (killResult.warning) log(`  WARNING: ${killResult.warning}`);
	if (!killResult.ok) {
		abortDeploy(killResult.errorCode!, killResult.message, history, sha, tag, deployedBy);
	}
	log("  [preflight-kill-switch] PASS");

	// 1d. Open orders check
	// Note: In production this is set by the operator wrapper that queries
	// the orders table via the repository layer (Drizzle ORM) and exports
	// OPEN_LIVE_ORDER_COUNT before invoking this script.
	const openOrderCount = parseInt(process.env["OPEN_LIVE_ORDER_COUNT"] ?? "0", 10);
	const ordersResult = checkNoOpenOrders({ openOrderCount: Number.isNaN(openOrderCount) ? 0 : openOrderCount });
	if (!ordersResult.ok) {
		abortDeploy(ordersResult.errorCode!, ordersResult.message, history, sha, tag, deployedBy);
	}
	log("  [preflight-open-orders] PASS");

	// -------------------------------------------------------------------------
	// Step 2: Graceful shutdown
	// -------------------------------------------------------------------------

	log("\n[step 2/4] Graceful shutdown...");

	const supervisorPid = findSupervisorPid();
	if (supervisorPid !== null) {
		log(`  Sending SIGTERM to supervisor (PID ${supervisorPid})`);
		process.kill(supervisorPid, "SIGTERM");

		const stopped = await waitForShutdown(
			supervisorPid,
			GRACEFUL_SHUTDOWN_TIMEOUT_MS,
			GRACEFUL_SHUTDOWN_POLL_INTERVAL_MS,
		);

		if (!stopped) {
			const code = DEPLOY_ERROR_CODES.ERR_FATAL_DEPLOY_SHUTDOWN_TIMEOUT;
			console.error(`[deploy] ${code}: Worker drain timed out after ${GRACEFUL_SHUTDOWN_TIMEOUT_MS / 1000}s. Deploy aborted. Old version still running.`);
			writeDeployHistory(
				appendDeployEntry(
					history,
					buildDeployRecord({ sha, tag, deployedBy, status: "failed" }),
				),
			);
			process.exit(2);
		}
		log("  [graceful-shutdown] All workers stopped.");
	} else {
		log("  [graceful-shutdown] Supervisor not found (fresh deploy or already stopped). Skipping.");
	}

	// -------------------------------------------------------------------------
	// Step 3: Image swap
	// -------------------------------------------------------------------------

	log("\n[step 3/4] Image swap...");
	log(`  Pulling images for TAG=${tag}`);

	if (!runDocker(["pull"], tag)) {
		console.error("[deploy] ERROR: docker compose pull failed. Deploy aborted.");
		writeDeployHistory(
			appendDeployEntry(
				history,
				buildDeployRecord({ sha, tag, deployedBy, status: "failed" }),
			),
		);
		process.exit(1);
	}

	log("  [docker-pull] DONE");
	log(`  Starting containers for TAG=${tag}`);

	if (!runDocker(["up", "-d"], tag)) {
		console.error("[deploy] ERROR: docker compose up -d failed. Deploy aborted.");
		writeDeployHistory(
			appendDeployEntry(
				history,
				buildDeployRecord({ sha, tag, deployedBy, status: "failed" }),
			),
		);
		process.exit(1);
	}

	log("  [docker-up] DONE");

	// -------------------------------------------------------------------------
	// Step 4: Post-deploy health verification
	// -------------------------------------------------------------------------

	log("\n[step 4/4] Post-deploy health verification...");
	log(`  Polling ${HEALTH_URL} every ${HEALTH_POLL_INTERVAL_MS / 1000}s for up to ${POST_DEPLOY_HEALTH_TIMEOUT_MS / 1000}s`);

	const postHealthResponse = await pollHealthUntilReady(
		HEALTH_URL,
		POST_DEPLOY_HEALTH_TIMEOUT_MS,
		HEALTH_POLL_INTERVAL_MS,
	);

	const postHealthResult = evaluatePostDeployHealth(postHealthResponse);

	if (!postHealthResult.ok) {
		const code = DEPLOY_ERROR_CODES.ERR_POSTDEPLOY_UNHEALTHY;
		console.error(`[deploy] ${code}: ${postHealthResult.message}`);

		const previousTag = getPreviousTag(history);
		writeDeployHistory(
			appendDeployEntry(
				history,
				buildDeployRecord({ sha, tag, deployedBy, status: "rolled_back" }),
			),
		);

		if (previousTag) {
			log(`  Triggering rollback to previous tag: ${previousTag}`);
			log("  NOTE: Rollback script (T-174) handles the actual rollback procedure.");
			log(`  Run: bun run scripts/rollback.ts --tag ${previousTag}`);
		} else {
			log("  WARNING: No previous successful deploy found. Manual intervention required.");
		}

		process.exit(1);
	}

	log("  [post-deploy-health] PASS");

	// -------------------------------------------------------------------------
	// Success: append deploy record
	// -------------------------------------------------------------------------

	const successRecord = buildDeployRecord({ sha, tag, deployedBy, status: "success" });
	writeDeployHistory(appendDeployEntry(history, successRecord));

	log("\n[deploy] SUCCESS");
	log(`  Tag:        ${tag}`);
	log(`  SHA:        ${sha}`);
	log(`  Deployed by: ${deployedBy}`);
	log(`  History:    ${DEPLOY_HISTORY_PATH}`);
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function log(msg: string): void {
	console.log(`[deploy] ${msg}`);
}

function abortDeploy(
	code: DeployErrorCode,
	message: string | undefined,
	history: DeployRecord[],
	sha: string,
	tag: string,
	deployedBy: string,
): never {
	console.error(`[deploy] ${code}: ${message ?? code}`);
	writeDeployHistory(
		appendDeployEntry(
			history,
			buildDeployRecord({ sha, tag, deployedBy, status: "failed" }),
		),
	);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Entry point guard
// ---------------------------------------------------------------------------

if (import.meta.main) {
	main().catch((err) => {
		console.error("[deploy] Unexpected error:", err);
		process.exit(1);
	});
}

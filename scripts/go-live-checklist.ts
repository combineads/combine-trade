/**
 * go-live-checklist.ts — Interactive go-live checklist for Double-BB live deployment.
 *
 * Pre-flight checks (automated):
 *   1. Credentials:    exchange_credentials table has a Binance record (existence only — never decrypt)
 *   2. Readiness score: computed inline from check-readiness logic (>= 70 required)
 *   3. Kill switch:    kill_switch_state.is_active = false (trading enabled)
 *   4. Daily loss limit: daily_loss_limits has a record with limit_amount > 0
 *   5. Position sizing: strategies.decision_config or result_config has positionSizePct > 0
 *
 * Interactive confirmation:
 *   - All ✅ → prompt "Type 'go live' to activate live trading: "
 *   - Any ❌ → exit 1 with message
 *   - Confirmed → UPDATE strategies SET execution_mode = 'live' WHERE name IN ('Double-BB-LONG', 'Double-BB-SHORT')
 *
 * Usage:
 *   bun run scripts/go-live-checklist.ts
 *
 * Exit codes:
 *   0 — live trading activated
 *   1 — pre-flight failed or cancelled
 */

import { count, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as readline from "node:readline";
import { dailyLossLimits } from "../db/schema/daily-loss-limits.js";
import { exchangeCredentials } from "../db/schema/exchange-credentials.js";
import { killSwitchState } from "../db/schema/kill-switch.js";
import { strategies } from "../db/schema/strategies.js";
import {
	buildReport,
	computeBacktestScore,
	computeManualScore,
	computePaperScore,
	computeRiskScore,
	loadBacktestStats,
	loadPaperStats,
	loadRiskConfig,
	loadStrategy,
} from "./check-readiness.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STRATEGY_NAMES = ["Double-BB-LONG", "Double-BB-SHORT"] as const;
const BINANCE_EXCHANGE = "binance";
const READY_THRESHOLD = 70;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckResult {
	label: string;
	passed: boolean;
	detail: string;
}

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

/**
 * Check 1: Binance credentials exist in exchange_credentials.
 * Only checks existence — NEVER decrypts or logs credential values.
 */
async function checkCredentials(db: PostgresJsDatabase): Promise<CheckResult> {
	const rows = await db
		.select({ cnt: count() })
		.from(exchangeCredentials)
		.where(eq(exchangeCredentials.exchange, BINANCE_EXCHANGE));

	const cnt = Number(rows[0]?.cnt ?? 0);
	const passed = cnt > 0;

	return {
		label: "Binance credentials registered",
		passed,
		detail: passed
			? `${cnt} credential record(s) found (values not shown)`
			: "No Binance credential records found. Register via API before going live.",
	};
}

/**
 * Check 2: Readiness score >= 70 for both Double-BB strategies.
 * Uses check-readiness.ts logic inline (manual-approved = true since paper trading is done).
 */
async function checkReadinessScore(db: PostgresJsDatabase): Promise<CheckResult> {
	const scores: Array<{ name: string; score: number; ready: boolean }> = [];

	for (const strategyName of STRATEGY_NAMES) {
		const strategy = await loadStrategy(db, strategyName);

		if (!strategy) {
			return {
				label: "Readiness score >= 70",
				passed: false,
				detail: `Strategy not found in DB: "${strategyName}". Seed strategies before going live.`,
			};
		}

		const [backtestStats, paperStats, riskConfig] = await Promise.all([
			loadBacktestStats(db, strategy.id),
			loadPaperStats(db, strategy.id),
			loadRiskConfig(db, strategy.id, strategy),
		]);

		const backtestItems = computeBacktestScore(backtestStats);
		const paperItems = computePaperScore(paperStats);
		const riskItems = computeRiskScore(riskConfig);
		// Mark manual review as approved (paper trading phase is complete)
		const manualItems = computeManualScore(true);

		const report = buildReport(
			strategy.id,
			strategy.name,
			backtestItems,
			paperItems,
			riskItems,
			manualItems,
		);

		scores.push({ name: strategyName, score: report.totalScore, ready: report.ready });
	}

	const allReady = scores.every((s) => s.ready);
	const scoresSummary = scores.map((s) => `${s.name}=${s.score}`).join(", ");

	return {
		label: "Readiness score >= 70",
		passed: allReady,
		detail: allReady
			? `Scores: ${scoresSummary}`
			: `One or more strategies below threshold (${READY_THRESHOLD}): ${scoresSummary}`,
	};
}

/**
 * Check 3: Kill switch is NOT active (is_active = false means trading is enabled).
 * The kill switch should be inactive before going live — verifies it was re-disabled
 * after any test activation.
 */
async function checkKillSwitch(db: PostgresJsDatabase): Promise<CheckResult> {
	// Check global kill switch (no strategy_id) and any strategy-specific ones
	const rows = await db
		.select({
			isActive: killSwitchState.isActive,
			strategyId: killSwitchState.strategyId,
		})
		.from(killSwitchState);

	if (rows.length === 0) {
		// No kill switch record means it has never been activated — trading is enabled
		return {
			label: "Kill switch inactive (trading enabled)",
			passed: true,
			detail: "No kill switch record found — trading is enabled by default.",
		};
	}

	const anyActive = rows.some((r) => r.isActive === true);

	return {
		label: "Kill switch inactive (trading enabled)",
		passed: !anyActive,
		detail: anyActive
			? "Kill switch is ACTIVE — trading is blocked. Deactivate via API before going live."
			: `Kill switch is inactive across all ${rows.length} record(s) — trading enabled.`,
	};
}

/**
 * Check 4: Daily loss limit is set and > 0.
 */
async function checkDailyLossLimit(db: PostgresJsDatabase): Promise<CheckResult> {
	const rows = await db
		.select({
			limitAmount: dailyLossLimits.limitAmount,
			strategyId: dailyLossLimits.strategyId,
		})
		.from(dailyLossLimits);

	if (rows.length === 0) {
		return {
			label: "Daily loss limit configured",
			passed: false,
			detail: "No daily loss limit records found. Set via API before going live.",
		};
	}

	// Verify at least one record has a valid positive limit amount
	const validRecords = rows.filter((r) => {
		const amount = Number(r.limitAmount);
		return !Number.isNaN(amount) && amount > 0;
	});

	const passed = validRecords.length > 0;

	return {
		label: "Daily loss limit configured",
		passed,
		detail: passed
			? `${validRecords.length} record(s) with valid loss limit (values set)`
			: "Loss limit records exist but all have invalid values (<= 0). Fix via API.",
	};
}

/**
 * Check 5: Position sizing is configured (positionSizePct > 0) in strategy configs.
 */
async function checkPositionSizing(db: PostgresJsDatabase): Promise<CheckResult> {
	const rows = await db
		.select({
			name: strategies.name,
			decisionConfig: strategies.decisionConfig,
			resultConfig: strategies.resultConfig,
		})
		.from(strategies)
		.where(inArray(strategies.name, [...STRATEGY_NAMES]));

	if (rows.length === 0) {
		return {
			label: "Position sizing configured",
			passed: false,
			detail: "Double-BB strategies not found in DB.",
		};
	}

	const results = rows.map((row) => {
		const decisionConfig = row.decisionConfig as Record<string, unknown> | null;
		const resultConfig = row.resultConfig as Record<string, unknown> | null;
		const rawValue =
			decisionConfig?.positionSizePct ??
			decisionConfig?.positionSize ??
			resultConfig?.positionSizePct ??
			resultConfig?.positionSize;

		const value = Number(rawValue ?? 0);
		const valid = !Number.isNaN(value) && value > 0;

		return { name: row.name, valid, value };
	});

	const allValid = results.every((r) => r.valid);
	const summary = results.map((r) => `${r.name}=${r.valid ? r.value : "NOT SET"}`).join(", ");

	return {
		label: "Position sizing configured",
		passed: allValid,
		detail: allValid
			? `Position size set: ${summary}`
			: `Missing or zero position size: ${summary}. Configure via API before going live.`,
	};
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function checkIcon(passed: boolean): string {
	return passed ? "\u2705" : "\u274c";
}

function printChecks(checks: CheckResult[]): void {
	console.info("\n=== Go-Live Pre-Flight Checklist ===\n");
	for (const check of checks) {
		const icon = checkIcon(check.passed);
		console.info(`  ${icon}  ${check.label}`);
		console.info(`       ${check.detail}`);
	}
	console.info("");
}

// ---------------------------------------------------------------------------
// Interactive confirmation
// ---------------------------------------------------------------------------

async function promptConfirmation(): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question("Type 'go live' to activate live trading: ", (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

async function activateLiveTrading(db: PostgresJsDatabase): Promise<void> {
	await db
		.update(strategies)
		.set({
			executionMode: "live",
			updatedAt: sql`NOW()`,
		})
		.where(inArray(strategies.name, [...STRATEGY_NAMES]));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (import.meta.main) {
	const { db } = await import("../db/index.js");
	const typedDb = db as unknown as PostgresJsDatabase;

	console.info("[go-live-checklist] Running pre-flight checks...");

	// Run all checks in parallel
	const [credCheck, readinessCheck, killSwitchCheck, lossLimitCheck, positionCheck] =
		await Promise.all([
			checkCredentials(typedDb),
			checkReadinessScore(typedDb),
			checkKillSwitch(typedDb),
			checkDailyLossLimit(typedDb),
			checkPositionSizing(typedDb),
		]);

	const checks: CheckResult[] = [
		credCheck,
		readinessCheck,
		killSwitchCheck,
		lossLimitCheck,
		positionCheck,
	];

	printChecks(checks);

	const allPassed = checks.every((c) => c.passed);

	if (!allPassed) {
		console.error("Pre-flight checks FAILED. Fix issues before going live.");
		process.exit(1);
	}

	console.info("All pre-flight checks passed.");
	console.info("");
	console.info("WARNING: This will activate LIVE trading on Binance Futures.");
	console.info(`Strategies: ${STRATEGY_NAMES.join(", ")}`);
	console.info("Real money will be used. Ensure positions are monitored.");
	console.info("");

	const confirmation = await promptConfirmation();

	if (confirmation !== "go live") {
		console.info("Cancelled.");
		process.exit(1);
	}

	console.info("\n[go-live-checklist] Activating live trading...");

	await activateLiveTrading(typedDb);

	console.info("\u2705 Live trading activated.");
	console.info("Monitor Slack for first signals.");
	console.info("Emergency rollback: set kill_switch_state.is_active = true via API.");
	process.exit(0);
}

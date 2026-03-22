import Decimal from "decimal.js";
import type { DailyLossConfig, LimitCheckResult, PnlRecord } from "./types.js";

export interface LossTrackerDeps {
	loadTodayRecords(): Promise<PnlRecord[]>;
	loadWeekRecords(): Promise<PnlRecord[]>;
	saveRecord(record: PnlRecord): Promise<void>;
}

/** Create and persist a new PnL record. */
export async function addLoss(pnl: string, deps: LossTrackerDeps): Promise<PnlRecord> {
	const record: PnlRecord = {
		id: crypto.randomUUID(),
		pnl,
		closedAt: new Date(),
	};
	await deps.saveRecord(record);
	return record;
}

/** Compute the net realized loss for today as a non-negative absolute value string. */
export async function getTodayLoss(deps: LossTrackerDeps): Promise<string> {
	const records = await deps.loadTodayRecords();
	return computeNetLoss(records);
}

/** Compute the net realized loss for the current week as a non-negative absolute value string. */
export async function getWeekLoss(deps: LossTrackerDeps): Promise<string> {
	const records = await deps.loadWeekRecords();
	return computeNetLoss(records);
}

function computeNetLoss(records: PnlRecord[]): string {
	const net = records.reduce((sum, r) => sum.plus(new Decimal(r.pnl)), new Decimal(0));
	// Net is negative when losing overall; return the absolute value
	// If net is positive (profitable), loss is 0
	return net.isNeg() ? net.abs().toString() : "0";
}

/** Count trailing consecutive losses scanning records from most recent first. */
export async function getConsecutiveLosses(deps: LossTrackerDeps): Promise<number> {
	const records = await deps.loadTodayRecords();
	// Records are expected in chronological order (most recent first by closedAt)
	const sorted = [...records].sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime());

	let count = 0;
	for (const record of sorted) {
		if (new Decimal(record.pnl).isNeg()) {
			count++;
		} else {
			break;
		}
	}
	return count;
}

/** Check daily, weekly, and consecutive SL limits in order. Returns first breach found. */
export async function checkLimits(
	balance: string,
	config: DailyLossConfig,
	deps: LossTrackerDeps,
): Promise<LimitCheckResult> {
	const balanceDec = new Decimal(balance);

	// 1. Daily loss check
	const todayLoss = new Decimal(await getTodayLoss(deps));
	const dailyLimitAbs = balanceDec.mul(config.dailyLimitPct).div(100);
	if (todayLoss.gt(dailyLimitAbs)) {
		const pct = todayLoss.div(balanceDec).mul(100).toFixed(1);
		return {
			breached: true,
			reason: `daily loss limit breached: ${pct}% > ${config.dailyLimitPct}%`,
		};
	}

	// 2. Weekly loss check
	const weekLoss = new Decimal(await getWeekLoss(deps));
	const weeklyLimitAbs = balanceDec.mul(config.weeklyLimitPct).div(100);
	if (weekLoss.gt(weeklyLimitAbs)) {
		const pct = weekLoss.div(balanceDec).mul(100).toFixed(1);
		return {
			breached: true,
			reason: `weekly loss limit breached: ${pct}% > ${config.weeklyLimitPct}%`,
		};
	}

	// 3. Consecutive SL check
	const consecutiveLosses = await getConsecutiveLosses(deps);
	if (consecutiveLosses >= config.maxConsecutiveSl) {
		return {
			breached: true,
			reason: `consecutive SL limit breached: ${consecutiveLosses} >= ${config.maxConsecutiveSl}`,
		};
	}

	return { breached: false };
}

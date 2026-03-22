import type { LabelResult } from "@combine/core/label";
import Decimal from "decimal.js";
import type { BacktestEvent } from "./types.js";

export interface LabeledEvent {
	event: BacktestEvent;
	label: LabelResult;
}

export interface MonthlyBreakdown {
	yearMonth: string;
	winCount: number;
	lossCount: number;
	winrate: number;
	pnlPct: number;
}

export interface SlippageStats {
	avgSlippagePct: number;
	maxSlippagePct: number;
	p95SlippagePct: number;
}

export interface BacktestReport {
	totalEvents: number;
	winCount: number;
	lossCount: number;
	timeExitCount: number;
	winrate: number;
	expectancy: number;
	avgWin: number;
	avgLoss: number;
	maxConsecutiveLoss: number;
	maxDrawdownPct: number;
	simultaneousTpSlRatio: number;
	coldStartEvents: number;
	coldStartEndTime: Date | null;
	monthlyBreakdown: MonthlyBreakdown[];
	slippageStats: SlippageStats | null;
}

function isWin(label: LabelResult): boolean {
	return label.resultType === "WIN" || (label.resultType === "TIME_EXIT" && label.pnlPct > 0);
}

function isLoss(label: LabelResult): boolean {
	return !isWin(label);
}

/** Compute max drawdown from an equity curve (cumulative pnl values). */
export function computeMaxDrawdown(equityCurve: number[]): number {
	if (equityCurve.length === 0) return 0;
	let peak = equityCurve[0]!;
	let maxDd = 0;
	for (const val of equityCurve) {
		if (val > peak) peak = val;
		const dd = peak - val;
		if (dd > maxDd) maxDd = dd;
	}
	return maxDd;
}

/** Compute max consecutive loss streak. TIME_EXIT with pnl <= 0 counts as loss. */
export function computeMaxConsecutiveLoss(events: LabeledEvent[]): number {
	let maxStreak = 0;
	let currentStreak = 0;
	for (const { label } of events) {
		if (isLoss(label)) {
			currentStreak++;
			if (currentStreak > maxStreak) maxStreak = currentStreak;
		} else {
			currentStreak = 0;
		}
	}
	return maxStreak;
}

/** Compute monthly breakdown sorted by yearMonth ascending. */
export function computeMonthlyBreakdown(events: LabeledEvent[]): MonthlyBreakdown[] {
	const map = new Map<
		string,
		{ winCount: number; lossCount: number; pnlSum: Decimal }
	>();

	for (const { event, label } of events) {
		const ym = `${event.openTime.getUTCFullYear()}-${String(event.openTime.getUTCMonth() + 1).padStart(2, "0")}`;
		let entry = map.get(ym);
		if (!entry) {
			entry = { winCount: 0, lossCount: 0, pnlSum: new Decimal(0) };
			map.set(ym, entry);
		}
		if (isWin(label)) {
			entry.winCount++;
		} else {
			entry.lossCount++;
		}
		entry.pnlSum = entry.pnlSum.plus(label.pnlPct);
	}

	return Array.from(map.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([yearMonth, data]) => {
			const total = data.winCount + data.lossCount;
			return {
				yearMonth,
				winCount: data.winCount,
				lossCount: data.lossCount,
				winrate: total > 0 ? data.winCount / total : 0,
				pnlPct: data.pnlSum.toNumber(),
			};
		});
}

function computeSlippage(
	events: LabeledEvent[],
	nextOpenPrices?: Map<string, string>,
): SlippageStats | null {
	if (!nextOpenPrices || nextOpenPrices.size === 0) return null;

	const slippageValues: number[] = [];
	for (const { event } of events) {
		const nextOpen = nextOpenPrices.get(event.eventId);
		if (!nextOpen) continue;

		const entry = new Decimal(event.entryPrice);
		const open = new Decimal(nextOpen);
		const slippage =
			event.direction === "long"
				? open.minus(entry).div(entry).mul(100)
				: entry.minus(open).div(entry).mul(100);
		slippageValues.push(slippage.toNumber());
	}

	if (slippageValues.length === 0) return null;

	const sorted = [...slippageValues].sort((a, b) => a - b);
	const sum = slippageValues.reduce((a, b) => a + b, 0);
	const p95Index = Math.floor(0.95 * sorted.length);

	return {
		avgSlippagePct: sum / slippageValues.length,
		maxSlippagePct: sorted[sorted.length - 1]!,
		p95SlippagePct: sorted[Math.min(p95Index, sorted.length - 1)]!,
	};
}

/** Compute full backtest report from labeled events. */
export function computeReport(
	events: LabeledEvent[],
	nextOpenPrices?: Map<string, string>,
): BacktestReport {
	if (events.length === 0) {
		return {
			totalEvents: 0,
			winCount: 0,
			lossCount: 0,
			timeExitCount: 0,
			winrate: 0,
			expectancy: 0,
			avgWin: 0,
			avgLoss: 0,
			maxConsecutiveLoss: 0,
			maxDrawdownPct: 0,
			simultaneousTpSlRatio: 0,
			coldStartEvents: 0,
			coldStartEndTime: null,
			monthlyBreakdown: [],
			slippageStats: null,
		};
	}

	let winCount = 0;
	let lossCount = 0;
	let timeExitCount = 0;
	let winSum = new Decimal(0);
	let lossSum = new Decimal(0);
	let slHitFirstCount = 0;

	const equityCurve: number[] = [];
	let cumPnl = new Decimal(0);

	for (const { label } of events) {
		if (label.resultType === "TIME_EXIT") timeExitCount++;

		if (isWin(label)) {
			winCount++;
			winSum = winSum.plus(Math.abs(label.pnlPct));
		} else {
			lossCount++;
			lossSum = lossSum.plus(Math.abs(label.pnlPct));
		}

		if (label.slHitFirst) slHitFirstCount++;

		cumPnl = cumPnl.plus(label.pnlPct);
		equityCurve.push(cumPnl.toNumber());
	}

	const total = events.length;
	const winrate = winCount / total;
	const avgWin = winCount > 0 ? winSum.div(winCount).toNumber() : 0;
	const avgLoss = lossCount > 0 ? lossSum.div(lossCount).toNumber() : 0;
	const expectancy = winrate * avgWin - (1 - winrate) * avgLoss;

	// Cold start
	const coldStartEvents = Math.min(total, 30);
	const coldStartEndTime =
		total >= 30 ? events[29]!.event.openTime : null;

	return {
		totalEvents: total,
		winCount,
		lossCount,
		timeExitCount,
		winrate,
		expectancy,
		avgWin,
		avgLoss,
		maxConsecutiveLoss: computeMaxConsecutiveLoss(events),
		maxDrawdownPct: computeMaxDrawdown(equityCurve),
		simultaneousTpSlRatio: slHitFirstCount / total,
		coldStartEvents,
		coldStartEndTime,
		monthlyBreakdown: computeMonthlyBreakdown(events),
		slippageStats: computeSlippage(events, nextOpenPrices),
	};
}

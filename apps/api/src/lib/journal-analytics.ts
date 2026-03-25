import Decimal from "decimal.js";

export type GroupByDimension = "tag" | "symbol" | "strategy" | "timeframe";

export interface JournalRawEntry {
	id: string;
	userId: string;
	strategyId: string;
	symbol: string;
	direction: string;
	netPnl: string | null;
	entryTime: Date;
	tags: string[] | null;
	timeframe: string;
}

export interface AnalyticsGroup {
	key: string;
	winrate: string;
	expectancy: string;
	avgPnl: string;
	tradeCount: number;
}

export interface JournalAnalyticsGroupFilter {
	groupBy: GroupByDimension;
	from?: string;
	to?: string;
	strategyId?: string;
	symbol?: string;
	userId: string;
}

/**
 * Compute per-group analytics from a list of raw journal entries.
 *
 * Winrate formula:  WIN count / (WIN + LOSS count) × 100  [as percentage string]
 * Expectancy:       (winrate × avgWin) − ((1 − winrate) × |avgLoss|)
 * AvgPnl:           sum(netPnl) / tradeCount  (PASS netPnl treated as zero)
 *
 * PASS trades (direction === "PASS") are:
 *   - counted in tradeCount
 *   - excluded from winrate/expectancy numerators and denominators
 *   - treated as zero-PnL for avgPnl calculation
 *
 * groupBy=tag: each trade may appear in multiple tag groups (multi-label expansion).
 */
export function computeGroupStats(
	entries: JournalRawEntry[],
	groupBy: GroupByDimension,
): AnalyticsGroup[] {
	// Build buckets: key → list of entries
	const buckets = new Map<string, JournalRawEntry[]>();

	for (const entry of entries) {
		const keys = getGroupKeys(entry, groupBy);
		for (const key of keys) {
			const bucket = buckets.get(key);
			if (bucket) {
				bucket.push(entry);
			} else {
				buckets.set(key, [entry]);
			}
		}
	}

	const groups: AnalyticsGroup[] = [];
	for (const [key, bucket] of buckets) {
		groups.push(computeBucketStats(key, bucket));
	}
	return groups;
}

function getGroupKeys(entry: JournalRawEntry, groupBy: GroupByDimension): string[] {
	switch (groupBy) {
		case "symbol":
			return [entry.symbol];
		case "strategy":
			return [entry.strategyId];
		case "timeframe":
			return [entry.timeframe];
		case "tag": {
			const tags = entry.tags ?? [];
			return tags.length > 0 ? tags : ["(untagged)"];
		}
	}
}

function computeBucketStats(key: string, entries: JournalRawEntry[]): AnalyticsGroup {
	const tradeCount = entries.length;

	// Separate PASS from tradeable (LONG/SHORT)
	const tradeable = entries.filter((e) => e.direction !== "PASS");
	const wins = tradeable.filter((e) => {
		const pnl = e.netPnl ? new Decimal(e.netPnl) : new Decimal(0);
		return pnl.gt(0);
	});
	const losses = tradeable.filter((e) => {
		const pnl = e.netPnl ? new Decimal(e.netPnl) : new Decimal(0);
		return pnl.lte(0);
	});

	const winCount = wins.length;
	const lossCount = losses.length;
	const tradeableCount = winCount + lossCount;

	// Winrate as percentage string
	let winrate: Decimal;
	if (tradeableCount === 0) {
		winrate = new Decimal(0);
	} else {
		winrate = new Decimal(winCount).div(tradeableCount).mul(100);
	}

	// avgWin / avgLoss
	let avgWin = new Decimal(0);
	if (wins.length > 0) {
		const sumWin = wins.reduce(
			(acc, e) => acc.plus(e.netPnl ? new Decimal(e.netPnl) : new Decimal(0)),
			new Decimal(0),
		);
		avgWin = sumWin.div(wins.length);
	}

	let avgLoss = new Decimal(0);
	if (losses.length > 0) {
		const sumLoss = losses.reduce(
			(acc, e) => acc.plus(e.netPnl ? new Decimal(e.netPnl) : new Decimal(0)),
			new Decimal(0),
		);
		// avgLoss is already negative; expectancy uses absolute value for loss term
		avgLoss = sumLoss.div(losses.length).abs();
	}

	// Expectancy = (winrate × avgWin) − ((1 − winrate) × avgLoss)
	let expectancy: Decimal;
	if (tradeableCount === 0) {
		expectancy = new Decimal(0);
	} else {
		const winrateFraction = winrate.div(100);
		const lossrateFraction = new Decimal(1).minus(winrateFraction);
		expectancy = winrateFraction.mul(avgWin).minus(lossrateFraction.mul(avgLoss));
	}

	// avgPnl over all trades (PASS = 0)
	let avgPnl: Decimal;
	if (tradeCount === 0) {
		avgPnl = new Decimal(0);
	} else {
		const sumPnl = entries.reduce(
			(acc, e) => (e.direction !== "PASS" && e.netPnl ? acc.plus(new Decimal(e.netPnl)) : acc),
			new Decimal(0),
		);
		avgPnl = sumPnl.div(tradeCount);
	}

	return {
		key,
		winrate: winrate.toSignificantDigits(20).toFixed(),
		expectancy: expectancy.toSignificantDigits(20).toFixed(),
		avgPnl: avgPnl.toSignificantDigits(20).toFixed(),
		tradeCount,
	};
}

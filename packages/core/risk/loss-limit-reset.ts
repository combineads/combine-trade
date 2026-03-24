/**
 * LossLimitResetScheduler
 *
 * Determines when daily and weekly loss counters should be reset and executes
 * those resets via injected side-effect functions.
 *
 * Rules:
 *  - Daily counters reset at UTC 00:00 each day.
 *  - Weekly counters reset at Monday UTC 00:00 each week.
 *  - Consecutive SL counter is intentionally excluded — manual reset only.
 */

export interface LossLimitResetDeps {
	/** Returns the current timestamp. Injectable for testability. */
	getNow(): Date;
	/** Returns the timestamp of the last daily reset, or null if never reset. */
	getLastDailyReset(): Promise<Date | null>;
	/** Returns the timestamp of the last weekly reset, or null if never reset. */
	getLastWeeklyReset(): Promise<Date | null>;
	/** Persists the timestamp of the most recent daily reset. */
	persistDailyReset(at: Date): Promise<void>;
	/** Persists the timestamp of the most recent weekly reset. */
	persistWeeklyReset(at: Date): Promise<void>;
	/** Resets daily loss counters (not consecutive SL). */
	resetDailyCounters(): Promise<void>;
	/** Resets weekly loss counters (not consecutive SL). */
	resetWeeklyCounters(): Promise<void>;
	/** Logs a reset event. */
	log(event: string, at: Date): void;
}

/**
 * Returns true when `now` is on a different UTC calendar day than `lastReset`.
 * A null `lastReset` is treated as "never reset" → always returns true.
 */
export function shouldResetDaily(now: Date, lastReset: Date | null): boolean {
	if (lastReset === null) return true;
	// Compare UTC year/month/day
	const nowDay = utcDateKey(now);
	const lastDay = utcDateKey(lastReset);
	return nowDay > lastDay;
}

/**
 * Returns true when `now` falls in a different ISO week than `lastReset`, where
 * weeks start on Monday UTC 00:00.
 * A null `lastReset` is treated as "never reset" → always returns true.
 */
export function shouldResetWeekly(now: Date, lastReset: Date | null): boolean {
	if (lastReset === null) return true;
	return mondayEpoch(now) > mondayEpoch(lastReset);
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export class LossLimitResetScheduler {
	constructor(private readonly deps: LossLimitResetDeps) {}

	/**
	 * Call this once per minute (or at any cadence) to trigger resets when due.
	 * The function is idempotent within a UTC day / ISO week.
	 */
	async tick(): Promise<void> {
		const now = this.deps.getNow();

		const [lastDaily, lastWeekly] = await Promise.all([
			this.deps.getLastDailyReset(),
			this.deps.getLastWeeklyReset(),
		]);

		if (shouldResetDaily(now, lastDaily)) {
			await this.deps.resetDailyCounters();
			await this.deps.persistDailyReset(now);
			this.deps.log("daily loss counters reset", now);
		}

		if (shouldResetWeekly(now, lastWeekly)) {
			await this.deps.resetWeeklyCounters();
			await this.deps.persistWeeklyReset(now);
			this.deps.log("weekly loss counters reset", now);
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a numeric key YYYYMMDD for a UTC date (for chronological ordering). */
function utcDateKey(d: Date): number {
	return d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/**
 * Returns the Unix epoch (ms) of Monday 00:00 UTC for the ISO week containing `d`.
 * Used to compare whether two dates belong to the same ISO week.
 */
function mondayEpoch(d: Date): number {
	// getUTCDay(): 0 = Sunday, 1 = Monday, …, 6 = Saturday
	// ISO week starts on Monday; map Sunday (0) → 7 so Monday is always 1.
	const dayOfWeek = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
	const daysToMonday = dayOfWeek - 1;

	// Truncate to start of UTC day then subtract days to reach Monday
	const startOfDay =
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
		daysToMonday * 86_400_000;

	return startOfDay;
}

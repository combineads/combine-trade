import type { TransferResult } from "./executor";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransferSchedulerDeps = {
  /**
   * Run the actual transfer for a given exchange.
   * Injected so daemon can wire in executeTransfer + its deps.
   */
  runTransfer: (exchange: string) => Promise<TransferResult>;
  /**
   * Read a CommonCode value from the TRANSFER group by code key.
   * Returns the value as unknown (caller casts as needed).
   */
  getConfig: (code: string) => Promise<unknown>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse "HH:MM" string into { hour, minute } (UTC).
 * Returns { hour: 0, minute: 30 } for "00:30".
 */
function parseTimeUtc(timeStr: string): { hour: number; minute: number } {
  const parts = timeStr.split(":");
  const hour = parseInt(parts[0] ?? "0", 10);
  const minute = parseInt(parts[1] ?? "0", 10);
  return { hour, minute };
}

/**
 * Returns milliseconds until the target UTC time on a given Date.
 * If the target time has already passed (or is exactly now) → target is next day.
 */
function msUntilDaily(now: Date, hour: number, minute: number): number {
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0),
  );

  if (now.getTime() >= target.getTime()) {
    // Already passed today → tomorrow
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return target.getTime() - now.getTime();
}

/**
 * Returns milliseconds until next Monday at the given UTC time.
 * If today is Monday and the time has not yet passed → returns this Monday's time.
 */
function msUntilNextMonday(now: Date, hour: number, minute: number): number {
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const daysUntilMonday = dayOfWeek === 1 ? 0 : (8 - dayOfWeek) % 7;

  const target = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysUntilMonday,
      hour,
      minute,
      0,
      0,
    ),
  );

  if (now.getTime() >= target.getTime()) {
    // This Monday already passed (or it's not Monday) → next Monday
    target.setUTCDate(target.getUTCDate() + 7);
  }

  return target.getTime() - now.getTime();
}

// ─── TransferScheduler ────────────────────────────────────────────────────────

/**
 * Schedules automatic futures → spot transfers based on CommonCode configuration.
 *
 * Uses a setTimeout chain (not setInterval) to prevent timer drift.
 * The scheduler must be started via start() and stopped via stop() to match
 * daemon lifecycle.
 */
export class TransferScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(private readonly deps: TransferSchedulerDeps) {}

  /** Returns true if the scheduler has been started and not yet stopped. */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Calculate the next run time for the given schedule and transfer time.
   *
   * @param schedule  "daily" | "weekly"
   * @param timeUtc   "HH:MM" string (UTC)
   * @param now       Reference time (defaults to current UTC time). Provided for testability.
   */
  getNextRunTime(schedule: string, timeUtc: string, now: Date = new Date()): Date {
    const { hour, minute } = parseTimeUtc(timeUtc);

    const msDelay =
      schedule === "weekly"
        ? msUntilNextMonday(now, hour, minute)
        : msUntilDaily(now, hour, minute);

    return new Date(now.getTime() + msDelay);
  }

  /**
   * Start the scheduler — arms an immediate timer that will run runOnce(),
   * which reads config, executes the transfer (if enabled), and schedules the
   * next proper run via setTimeout chain.
   *
   * The first runOnce() call fires immediately (delay = 0) so that the timer
   * handle is available synchronously after start() returns. runOnce() then
   * re-schedules itself at the correct next-run time.
   *
   * @param exchange  Exchange identifier forwarded to runTransfer()
   */
  start(exchange = "binance"): void {
    this.running = true;
    // Arm the timer immediately so start() returns with timer !== null.
    // runOnce() will read config, execute the transfer, and re-schedule.
    this.timer = setTimeout(() => {
      void this.runOnce(exchange);
    }, 0);
  }

  /**
   * Stop the scheduler and clear any pending timer.
   */
  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  /**
   * Execute a single transfer cycle and schedule the next one.
   *
   * - Reads transfer_enabled from config; if false → skips transfer but still schedules next run.
   * - Calls deps.runTransfer(exchange) when enabled.
   * - Arms the next setTimeout at the end (setTimeout chain).
   *
   * @param exchange  Exchange identifier forwarded to runTransfer()
   */
  async runOnce(exchange = "binance"): Promise<void> {
    try {
      const [enabledRaw, scheduleRaw, timeUtcRaw] = await Promise.all([
        this.deps.getConfig("transfer_enabled"),
        this.deps.getConfig("transfer_schedule"),
        this.deps.getConfig("transfer_time_utc"),
      ]);

      const enabled = String(enabledRaw).toLowerCase() === "true";
      const schedule = typeof scheduleRaw === "string" ? scheduleRaw : "daily";
      const timeUtc = typeof timeUtcRaw === "string" ? timeUtcRaw : "00:30";

      if (!enabled) {
        console.log("[TransferScheduler] transfer_enabled=false — skipping");
      } else {
        await this.deps.runTransfer(exchange);
      }

      // Schedule next run regardless of enabled/disabled state.
      // The caller (stop()) is responsible for cancelling if needed.
      const now = new Date();
      const next = this.getNextRunTime(schedule, timeUtc, now);
      const delay = next.getTime() - now.getTime();

      this.timer = setTimeout(() => {
        void this.runOnce(exchange);
      }, delay);
    } catch (err) {
      console.error("[TransferScheduler] runOnce() error:", err);

      // Even on error, schedule next run with a fallback 24h delay.
      const fallbackDelay = 24 * 60 * 60 * 1000;
      this.timer = setTimeout(() => {
        void this.runOnce(exchange);
      }, fallbackDelay);
    }
  }
}

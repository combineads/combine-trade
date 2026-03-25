import type { PipelineMetrics } from "./metrics.js";

/** A single flushed metrics record for one pipeline stage. */
export interface MetricsRecord {
	/** Pipeline stage name (e.g. "vector", "strategy"). */
	stage: string;
	/** p50 latency in milliseconds. */
	p50: number;
	/** p95 latency in milliseconds. */
	p95: number;
	/** p99 latency in milliseconds. */
	p99: number;
	/** Number of latency samples in this flush window. */
	count: number;
	/** Number of errors recorded in this flush window. */
	errors: number;
	/** Number of events recorded in this flush window. */
	events: number;
	/** Unix timestamp (ms) when the snapshot was captured. */
	capturedAt: number;
}

/** Dependency interface for persisting and purging metrics records. */
export interface MetricsFlushDeps {
	/**
	 * Persist a batch of metrics records to durable storage.
	 * Called once per flush cycle if there is any data to write.
	 */
	writeMetrics(records: MetricsRecord[]): Promise<void>;

	/**
	 * Delete metrics records older than the given number of days.
	 */
	purgeOlderThan(days: number): Promise<void>;
}

/** Options for constructing a MetricsFlushService. */
export interface MetricsFlushOptions {
	/**
	 * Stage names to collect snapshots for on each flush cycle.
	 * Only stages with recorded data (count > 0 OR errors > 0 OR events > 0) are written.
	 */
	stages: string[];

	/**
	 * Flush interval in milliseconds. Defaults to 60_000 (60 seconds).
	 */
	intervalMs?: number;
}

/**
 * Periodic flush service that drains in-memory `PipelineMetrics` snapshots
 * to durable storage every `intervalMs` milliseconds.
 *
 * The flush is non-blocking: the interval callback schedules the async work
 * via `void asyncFlush()` without awaiting it, so the event loop is never blocked.
 *
 * Metrics are only reset after a successful write. If the writer throws, the
 * in-memory data is preserved for the next flush attempt.
 */
export class MetricsFlushService {
	private readonly metrics: PipelineMetrics;
	private readonly deps: MetricsFlushDeps;
	private readonly stages: string[];
	private readonly intervalMs: number;
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(metrics: PipelineMetrics, deps: MetricsFlushDeps, options: MetricsFlushOptions) {
		this.metrics = metrics;
		this.deps = deps;
		this.stages = options.stages;
		this.intervalMs = options.intervalMs ?? 60_000;
	}

	/**
	 * Start the periodic flush interval.
	 * Calling `start()` when already started is a no-op.
	 */
	start(): void {
		if (this.timer !== null) return;
		this.timer = setInterval(() => {
			void this.flush();
		}, this.intervalMs);
	}

	/**
	 * Stop the periodic flush interval.
	 * Calling `stop()` when not started is a no-op.
	 */
	stop(): void {
		if (this.timer === null) return;
		clearInterval(this.timer);
		this.timer = null;
	}

	/**
	 * Collect snapshots for all tracked stages, write them in one batch,
	 * then reset the in-memory metrics.
	 *
	 * - If there is no data across any stage, no write is issued.
	 * - If the writer throws, the error is swallowed and metrics are NOT reset,
	 *   preserving data for the next flush attempt.
	 * - This method never throws.
	 */
	async flush(): Promise<void> {
		const capturedAt = Date.now();
		const records: MetricsRecord[] = [];

		for (const stage of this.stages) {
			const snap = this.metrics.getSnapshot(stage);
			const hasData = snap.latency.count > 0 || snap.errors > 0 || snap.events > 0;
			if (!hasData) continue;

			records.push({
				stage,
				p50: snap.latency.p50,
				p95: snap.latency.p95,
				p99: snap.latency.p99,
				count: snap.latency.count,
				errors: snap.errors,
				events: snap.events,
				capturedAt,
			});
		}

		if (records.length === 0) return;

		try {
			await this.deps.writeMetrics(records);
			// Only reset after a successful write.
			this.metrics.reset();
		} catch {
			// Preserve in-memory data for next flush attempt.
		}
	}

	/**
	 * Delegate a retention purge to the underlying deps.
	 * Deletes all records older than `days` days.
	 */
	async purge(days: number): Promise<void> {
		await this.deps.purgeOlderThan(days);
	}
}

import type { MetricsFlushDeps, MetricsRecord } from "@combine/shared/pipeline/metrics-flush.js";
import { lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { pipelineMetrics } from "../schema/pipeline-metrics.js";

type Db = PostgresJsDatabase;

/**
 * DrizzleORM implementation of `MetricsFlushDeps`.
 * Writes pipeline metrics snapshots to the `pipeline_metrics` table and
 * purges rows older than the configured retention window.
 */
export class PipelineMetricsRepository implements MetricsFlushDeps {
	constructor(private readonly db: Db) {}

	/**
	 * Batch-insert a set of metrics records.
	 * Each record represents one pipeline stage's 60-second snapshot.
	 */
	async writeMetrics(records: MetricsRecord[]): Promise<void> {
		if (records.length === 0) return;

		await this.db.insert(pipelineMetrics).values(
			records.map((r) => ({
				stage: r.stage,
				p50: String(r.p50),
				p95: String(r.p95),
				p99: String(r.p99),
				count: r.count,
				errors: r.errors,
				events: r.events,
				capturedAt: new Date(r.capturedAt),
			})),
		);
	}

	/**
	 * Delete all rows with `captured_at` older than `days` days ago.
	 * Intended to be called by a scheduled retention job.
	 */
	async purgeOlderThan(days: number): Promise<void> {
		const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
		await this.db.delete(pipelineMetrics).where(lt(pipelineMetrics.capturedAt, cutoff));
	}
}

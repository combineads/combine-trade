export interface LatencySnapshot {
	p50: number;
	p95: number;
	p99: number;
	count: number;
}

export interface StageSnapshot {
	latency: LatencySnapshot;
	errors: number;
	events: number;
}

function computePercentile(sorted: number[], percentile: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.ceil((percentile / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)]!;
}

/** In-memory metrics collector for pipeline stages. */
export class PipelineMetrics {
	private latencies = new Map<string, number[]>();
	private errors = new Map<string, number>();
	private events = new Map<string, number>();

	recordLatency(stage: string, ms: number): void {
		const arr = this.latencies.get(stage) ?? [];
		arr.push(ms);
		this.latencies.set(stage, arr);
	}

	recordError(stage: string): void {
		this.errors.set(stage, (this.errors.get(stage) ?? 0) + 1);
	}

	recordEvent(stage: string): void {
		this.events.set(stage, (this.events.get(stage) ?? 0) + 1);
	}

	getSnapshot(stage: string): StageSnapshot {
		const rawLatencies = this.latencies.get(stage) ?? [];
		const sorted = [...rawLatencies].sort((a, b) => a - b);

		return {
			latency: {
				p50: computePercentile(sorted, 50),
				p95: computePercentile(sorted, 95),
				p99: computePercentile(sorted, 99),
				count: sorted.length,
			},
			errors: this.errors.get(stage) ?? 0,
			events: this.events.get(stage) ?? 0,
		};
	}

	reset(): void {
		this.latencies.clear();
		this.errors.clear();
		this.events.clear();
	}
}

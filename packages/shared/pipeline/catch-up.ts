export interface CatchUpDeps<T> {
	findUnprocessedEvents: (options?: CatchUpOptions) => Promise<T[]>;
	processEvent: (event: T) => Promise<void>;
	markProcessed: (event: T) => Promise<void>;
	getEventId: (event: T) => string;
}

export interface CatchUpOptions {
	maxAgeSeconds?: number;
	batchSize?: number;
}

export interface CatchUpResult {
	processed: number;
	failed: number;
	error?: string;
}

/** Run catch-up polling for missed events. Never throws. */
export async function runCatchUp<T>(
	deps: CatchUpDeps<T>,
	options?: CatchUpOptions,
): Promise<CatchUpResult> {
	let events: T[];
	try {
		events = await deps.findUnprocessedEvents(options);
	} catch (err) {
		return { processed: 0, failed: 0, error: (err as Error).message };
	}

	let processed = 0;
	let failed = 0;

	for (const event of events) {
		try {
			await deps.processEvent(event);
			await deps.markProcessed(event);
			processed++;
		} catch {
			failed++;
		}
	}

	return { processed, failed };
}

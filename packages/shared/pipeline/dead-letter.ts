const MAX_RETRIES = 3;

export interface DeadLetterEntry {
	eventId: string;
	stage: string;
	error: string;
	timestamp: number;
}

export interface DeadLetterDeps {
	loadRetryCount: (eventId: string) => Promise<number>;
	saveDeadLetter: (entry: DeadLetterEntry) => Promise<void>;
}

export interface FailureResult {
	action: "retry" | "dead_letter";
	retryCount: number;
}

/** Check if an event should be retried based on its retry count. */
export function shouldRetry(retryCount: number): boolean {
	return retryCount < MAX_RETRIES;
}

/** Handle a pipeline failure. Returns retry or dead_letter action. */
export async function handleFailure(
	eventId: string,
	stage: string,
	error: Error,
	deps: DeadLetterDeps,
): Promise<FailureResult> {
	const retryCount = await deps.loadRetryCount(eventId);

	if (shouldRetry(retryCount)) {
		return { action: "retry", retryCount };
	}

	await deps.saveDeadLetter({
		eventId,
		stage,
		error: error.message,
		timestamp: Date.now(),
	});

	return { action: "dead_letter", retryCount };
}

/** Abstract transaction context — Drizzle transaction will implement this */
export interface TransactionContext {
	execute<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}

/** Provider that creates or reuses transaction contexts */
export interface TransactionProvider {
	begin(): Promise<TransactionContext>;
}

/** Log entry metadata */
export interface LogEntry {
	method: string;
	args?: unknown[];
	duration?: number;
	result?: "success" | "error";
	error?: string;
}

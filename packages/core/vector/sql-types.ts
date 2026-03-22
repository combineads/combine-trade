/** SQL executor interface for dependency injection (testable without real DB) */
export interface SqlExecutor {
	execute(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

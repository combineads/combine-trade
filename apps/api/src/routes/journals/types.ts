/** Shared types for journal v2 routes. */

export type JournalSide = "LONG" | "SHORT";
export type JournalOutcome = "WIN" | "LOSS" | "PASS";

export interface JournalListOptions {
	userId: string;
	strategyId?: string;
	symbol?: string;
	side?: JournalSide;
	outcome?: JournalOutcome;
	from?: string;
	to?: string;
	page: number;
	limit: number;
}

export interface JournalDetailOptions {
	id: string;
	userId: string;
}

export interface JournalSearchOptions {
	q: string;
	userId: string;
	page: number;
	limit: number;
}

export interface JournalListResult<T> {
	data: T[];
	total: number;
}

export interface JournalDetailResult<TJournal, TSnapshot> {
	journal: TJournal;
	entrySnapshot: TSnapshot | null;
}

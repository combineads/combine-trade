import type { LossTrackerDeps } from "./loss-tracker.js";
import type { PnlRecord } from "./types.js";

export interface PnlRow {
	id: string;
	date: string;
	strategyId: string | null;
	symbol: string | null;
	realizedPnl: string;
	updatedAt: Date;
}

export interface LossTrackerDbDeps {
	findByDateRange: (dateFrom: string, dateTo: string) => Promise<PnlRow[]>;
	insertRecord: (row: PnlRow) => Promise<void>;
}

function getUtcDateString(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function getWeekStartUtc(date: Date): string {
	const d = new Date(date);
	const day = d.getUTCDay();
	// Monday = 1, so we go back (day - 1) days. Sunday (0) goes back 6 days.
	const diff = day === 0 ? 6 : day - 1;
	d.setUTCDate(d.getUTCDate() - diff);
	return getUtcDateString(d);
}

function mapRowToRecord(row: PnlRow): PnlRecord {
	return {
		id: row.id,
		pnl: row.realizedPnl,
		closedAt: row.updatedAt,
	};
}

export class LossTrackerDbService implements LossTrackerDeps {
	constructor(private readonly deps: LossTrackerDbDeps) {}

	async loadTodayRecords(): Promise<PnlRecord[]> {
		const today = getUtcDateString(new Date());
		const rows = await this.deps.findByDateRange(today, today);
		return rows.map(mapRowToRecord);
	}

	async loadWeekRecords(): Promise<PnlRecord[]> {
		const today = getUtcDateString(new Date());
		const weekStart = getWeekStartUtc(new Date());
		const rows = await this.deps.findByDateRange(weekStart, today);
		return rows.map(mapRowToRecord);
	}

	async saveRecord(record: PnlRecord): Promise<void> {
		await this.deps.insertRecord({
			id: record.id,
			date: getUtcDateString(record.closedAt),
			strategyId: null,
			symbol: null,
			realizedPnl: record.pnl,
			updatedAt: record.closedAt,
		});
	}
}

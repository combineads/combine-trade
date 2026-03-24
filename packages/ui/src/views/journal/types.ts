import type { Locale } from "../../i18n/use-translations";

export interface JournalEntry {
	id: string;
	tradeDate: string;
	symbol: string;
	side: "LONG" | "SHORT";
	entryPrice: number;
	exitPrice: number;
	pnl: number;
	duration: string;
	strategyName: string;
	tags: string[];
	notes?: string;
	entryReason?: string;
	exitReason?: string;
	mfe?: number;
	mae?: number;
	riskReward?: number;
	edgeRatio?: number;
}

export interface JournalFiltersState {
	dateFrom?: string;
	dateTo?: string;
	strategy?: string;
	symbol?: string;
	side?: "LONG" | "SHORT" | "";
	search?: string;
}

export interface JournalViewProps {
	entries: JournalEntry[];
	total: number;
	page: number;
	pageSize: number;
	filters?: JournalFiltersState;
	onFiltersChange?: (filters: JournalFiltersState) => void;
	onPageChange?: (page: number) => void;
	locale?: Locale;
}

export interface JournalEntryDetailProps {
	entry: JournalEntry;
	locale?: Locale;
}

export interface JournalStatsData {
	totalTrades: number;
	winRate: number;
	avgPnl: number;
	totalPnl: number;
}

export interface JournalStatsProps {
	stats: JournalStatsData;
	locale?: Locale;
}

export interface JournalComparisonProps {
	backtestPnl: number;
	livePnl: number;
	backtestWinRate: number;
	liveWinRate: number;
	locale?: Locale;
}

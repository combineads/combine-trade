import type { Candle } from "@combine/candle";
import type { Exchange, Timeframe } from "@combine/shared";

export interface RawKlineRow {
	openTime: number;
	open: string;
	high: string;
	low: string;
	close: string;
	volume: string;
	closeTime: number;
	quoteVolume: string;
	trades: number;
	takerBuyBaseVol: string;
	takerBuyQuoteVol: string;
}

export interface CandleContext {
	exchange: Exchange;
	symbol: string;
	timeframe: Timeframe;
}

/** Parse a single CSV line into a RawKlineRow. */
function parseRow(line: string, lineIndex: number): RawKlineRow {
	const cols = line.split(",");
	if (cols.length < 11) {
		throw new Error(
			`Malformed CSV row at line ${lineIndex + 1}: expected >= 11 columns, got ${cols.length}`,
		);
	}
	return {
		openTime: Number(cols[0]),
		open: cols[1]!,
		high: cols[2]!,
		low: cols[3]!,
		close: cols[4]!,
		volume: cols[5]!,
		closeTime: Number(cols[6]),
		quoteVolume: cols[7]!,
		trades: Number(cols[8]),
		takerBuyBaseVol: cols[9]!,
		takerBuyQuoteVol: cols[10]!,
	};
}

/** Returns true if a line looks like a header (first column is non-numeric). */
function isHeaderLine(line: string): boolean {
	const firstCol = line.split(",")[0] ?? "";
	return firstCol.length > 0 && Number.isNaN(Number(firstCol));
}

/** Parse raw Binance Vision CSV into RawKlineRow array. */
export function parseBinanceVisionCsvRows(csv: string): RawKlineRow[] {
	const lines = csv.split("\n");
	const rows: RawKlineRow[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!.trim();
		if (line === "") continue;
		if (isHeaderLine(line)) continue;
		rows.push(parseRow(line, i));
	}

	return rows;
}

/** Parse Binance Vision CSV into Candle objects with exchange/symbol/timeframe context. */
export function parseBinanceVisionCsv(csv: string, ctx: CandleContext): Candle[] {
	const rows = parseBinanceVisionCsvRows(csv);
	return rows.map((row) => ({
		exchange: ctx.exchange,
		symbol: ctx.symbol,
		timeframe: ctx.timeframe,
		openTime: new Date(row.openTime),
		open: row.open,
		high: row.high,
		low: row.low,
		close: row.close,
		volume: row.volume,
		isClosed: true,
	}));
}

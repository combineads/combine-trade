import Decimal from "decimal.js";

export interface FundingRateRecord {
	symbol: string;
	timestamp: number;
	rate: string;
	interval: number;
}

export interface FundingRateAdapter {
	getFundingHistory(symbol: string, since: number, limit: number): Promise<FundingRateRecord[]>;
	getCurrentFundingRate(symbol: string): Promise<FundingRateRecord>;
}

export interface AccumulatedFunding {
	symbol: string;
	positionSize: string;
	totalFundingPaid: string;
	fundingRecords: FundingRateRecord[];
}

export interface FundingWarning {
	symbol: string;
	currentRate: string;
	threshold: string;
	isHigh: boolean;
}

const FUNDING_WARNING_THRESHOLD = "0.001";
const DEFAULT_HISTORY_LIMIT = 500;

export class FundingRateCollector {
	private adapter: FundingRateAdapter;

	constructor(adapter: FundingRateAdapter) {
		this.adapter = adapter;
	}

	async collectRecent(symbol: string, since: number): Promise<FundingRateRecord[]> {
		return this.adapter.getFundingHistory(symbol, since, DEFAULT_HISTORY_LIMIT);
	}

	calculateAccumulatedFunding(
		symbol: string,
		positionSize: string,
		openTimestamp: number,
		records: FundingRateRecord[],
	): AccumulatedFunding {
		const relevantRecords = records.filter((r) => r.timestamp >= openTimestamp);
		const size = new Decimal(positionSize);

		let totalPaid = new Decimal(0);
		for (const record of relevantRecords) {
			const payment = size.mul(record.rate);
			totalPaid = totalPaid.add(payment);
		}

		return {
			symbol,
			positionSize,
			totalFundingPaid: totalPaid.toString(),
			fundingRecords: relevantRecords,
		};
	}

	async checkFundingWarning(symbol: string): Promise<FundingWarning> {
		const current = await this.adapter.getCurrentFundingRate(symbol);
		const absRate = new Decimal(current.rate).abs();
		const threshold = new Decimal(FUNDING_WARNING_THRESHOLD);

		return {
			symbol,
			currentRate: current.rate,
			threshold: FUNDING_WARNING_THRESHOLD,
			isHigh: absRate.gte(threshold),
		};
	}
}

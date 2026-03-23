import Decimal from "decimal.js";

export interface FundingRateFromExchange {
	symbol: string;
	fundingRate: string;
	nextFundingTime: number;
}

export interface FundingRateRecord {
	exchange: string;
	symbol: string;
	fundingRate: string;
	fundingTime: Date;
}

export interface FundingCollectorDeps {
	exchange: string;
	highFundingThreshold: string;
	fetchFundingRates: () => Promise<FundingRateFromExchange[]>;
	isAlreadyStored: (exchange: string, symbol: string, fundingTime: Date) => Promise<boolean>;
	saveRate: (record: FundingRateRecord) => Promise<void>;
	onHighFundingWarning: (symbol: string, rate: string) => void;
}

export interface CollectResult {
	collected: number;
	skipped: number;
}

export class FundingRateCollector {
	constructor(private readonly deps: FundingCollectorDeps) {}

	async collectOnce(): Promise<CollectResult> {
		const rates = await this.deps.fetchFundingRates();
		let collected = 0;
		let skipped = 0;

		for (const rate of rates) {
			const fundingTime = new Date(rate.nextFundingTime);

			const stored = await this.deps.isAlreadyStored(this.deps.exchange, rate.symbol, fundingTime);

			if (stored) {
				skipped++;
				continue;
			}

			const record: FundingRateRecord = {
				exchange: this.deps.exchange,
				symbol: rate.symbol,
				fundingRate: rate.fundingRate,
				fundingTime,
			};

			await this.deps.saveRate(record);
			collected++;

			const absRate = new Decimal(rate.fundingRate).abs();
			if (absRate.gte(new Decimal(this.deps.highFundingThreshold))) {
				this.deps.onHighFundingWarning(rate.symbol, rate.fundingRate);
			}
		}

		return { collected, skipped };
	}
}

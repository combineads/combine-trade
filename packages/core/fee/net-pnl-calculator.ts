import Decimal from "decimal.js";

export interface TradeFeeSummary {
	entryFee: string;
	exitFee: string;
	totalFee: string;
}

export interface NetPnlResult {
	grossPnl: string;
	fees: TradeFeeSummary;
	fundingCost: string;
	netPnl: string;
	netPnlPercent: string;
}

export function calculateNetPnl(params: {
	grossPnl: string;
	entryFee: string;
	exitFee: string;
	fundingCost: string;
	entryNotional: string;
}): NetPnlResult {
	const gross = new Decimal(params.grossPnl);
	const entry = new Decimal(params.entryFee);
	const exit = new Decimal(params.exitFee);
	const funding = new Decimal(params.fundingCost);
	const notional = new Decimal(params.entryNotional);

	const totalFee = entry.add(exit);
	const net = gross.minus(totalFee).minus(funding);
	const pct = notional.isZero() ? new Decimal(0) : net.div(notional).mul(100);

	return {
		grossPnl: params.grossPnl,
		fees: {
			entryFee: params.entryFee,
			exitFee: params.exitFee,
			totalFee: totalFee.toString(),
		},
		fundingCost: params.fundingCost,
		netPnl: net.toString(),
		netPnlPercent: pct.toString(),
	};
}

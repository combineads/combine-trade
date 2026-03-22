import Decimal from "decimal.js";
import type { PaperBalance, PaperDirection, PaperPosition, PeriodSummary } from "./types.js";

/** Create a fresh paper balance. */
export function createBalance(initialAmount: string): PaperBalance {
	return {
		available: initialAmount,
		initial: initialAmount,
		realizedPnl: "0",
	};
}

/** Calculate margin: (quantity * price) / leverage. */
export function calculateMargin(quantity: string, price: string, leverage: number): string {
	return new Decimal(quantity).mul(price).div(leverage).toString();
}

/** Apply an entry fill: deduct margin from available balance. */
export function applyEntry(
	balance: PaperBalance,
	direction: PaperDirection,
	entryPrice: string,
	quantity: string,
	leverage: number,
): { balance: PaperBalance; position: PaperPosition } {
	const margin = calculateMargin(quantity, entryPrice, leverage);
	const newAvailable = new Decimal(balance.available).minus(margin).toString();

	return {
		balance: { ...balance, available: newAvailable },
		position: { direction, entryPrice, quantity, margin, leverage },
	};
}

/** Apply an exit fill: return margin + PnL to available balance. */
export function applyExit(
	balance: PaperBalance,
	position: PaperPosition,
	exitPrice: string,
): { balance: PaperBalance; pnl: string } {
	const pnl = calculateUnrealizedPnl(position, exitPrice);
	const newAvailable = new Decimal(balance.available).plus(position.margin).plus(pnl).toString();
	const newRealizedPnl = new Decimal(balance.realizedPnl).plus(pnl).toString();

	return {
		balance: { ...balance, available: newAvailable, realizedPnl: newRealizedPnl },
		pnl,
	};
}

/** Calculate unrealized PnL for an open position. */
export function calculateUnrealizedPnl(position: PaperPosition, currentPrice: string): string {
	const qty = new Decimal(position.quantity);
	const entry = new Decimal(position.entryPrice);
	const current = new Decimal(currentPrice);

	if (position.direction === "LONG") {
		return qty.mul(current.minus(entry)).toString();
	}
	return qty.mul(entry.minus(current)).toString();
}

/** Reset balance to initial state. */
export function resetBalance(balance: PaperBalance): PaperBalance {
	return createBalance(balance.initial);
}

/** Compute summary statistics from a series of trade PnLs. */
export function computePeriodSummary(pnls: string[]): PeriodSummary {
	if (pnls.length === 0) {
		return { totalPnl: "0", winCount: 0, lossCount: 0, winRate: 0, tradeCount: 0 };
	}

	let total = new Decimal(0);
	let wins = 0;
	let losses = 0;

	for (const pnl of pnls) {
		const val = new Decimal(pnl);
		total = total.plus(val);
		if (val.gt(0)) wins++;
		else if (val.lt(0)) losses++;
	}

	return {
		totalPnl: total.toString(),
		winCount: wins,
		lossCount: losses,
		winRate: wins / pnls.length,
		tradeCount: pnls.length,
	};
}

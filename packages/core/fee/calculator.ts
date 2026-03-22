import { add, mul, sub } from "@combine/shared/decimal/arithmetic.js";

export interface FeeSchedule {
	makerRate: string;
	takerRate: string;
}

/** Calculate fee for a single leg: quantity * price * rate. */
export function calculateFee(quantity: string, price: string, rate: string): string {
	return mul(mul(quantity, price), rate);
}

/** Calculate round-trip fees (entry taker + exit taker by default). */
export function calculateRoundTripFee(
	quantity: string,
	entryPrice: string,
	exitPrice: string,
	schedule: FeeSchedule,
	entryType: "maker" | "taker" = "taker",
	exitType: "maker" | "taker" = "taker",
): string {
	const entryRate = entryType === "maker" ? schedule.makerRate : schedule.takerRate;
	const exitRate = exitType === "maker" ? schedule.makerRate : schedule.takerRate;
	const entryFee = calculateFee(quantity, entryPrice, entryRate);
	const exitFee = calculateFee(quantity, exitPrice, exitRate);
	return add(entryFee, exitFee);
}

/** Calculate net PnL: gross PnL minus total fees. */
export function calculateNetPnl(grossPnl: string, totalFees: string): string {
	return sub(grossPnl, totalFees);
}

/** Calculate gross PnL for a long position: (exitPrice - entryPrice) * quantity. */
export function calculateGrossPnlLong(
	quantity: string,
	entryPrice: string,
	exitPrice: string,
): string {
	return mul(sub(exitPrice, entryPrice), quantity);
}

/** Calculate gross PnL for a short position: (entryPrice - exitPrice) * quantity. */
export function calculateGrossPnlShort(
	quantity: string,
	entryPrice: string,
	exitPrice: string,
): string {
	return mul(sub(entryPrice, exitPrice), quantity);
}

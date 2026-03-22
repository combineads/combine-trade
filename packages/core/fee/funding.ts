import { add, mul } from "@combine/shared/decimal/arithmetic.js";

export interface FundingPayment {
	positionNotional: string;
	fundingRate: string;
	side: "long" | "short";
}

/**
 * Calculate funding payment for one interval.
 * Long pays positive funding, receives negative funding.
 * Short receives positive funding, pays negative funding.
 * Returns the payment amount (positive = cost, negative = income).
 */
export function calculateFundingPayment(payment: FundingPayment): string {
	const rawPayment = mul(payment.positionNotional, payment.fundingRate);
	// Long: pays when funding is positive, receives when negative → raw payment as-is
	// Short: receives when funding is positive, pays when negative → negate
	return payment.side === "long" ? rawPayment : mul(rawPayment, "-1");
}

/** Accumulate total funding cost across multiple intervals. */
export function accumulateFunding(payments: FundingPayment[]): string {
	return payments.reduce((total, p) => add(total, calculateFundingPayment(p)), "0");
}

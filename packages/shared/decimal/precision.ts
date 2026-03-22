import Decimal from "decimal.js";

export interface PrecisionRules {
	tickSize: string;
	lotSize: string;
	minNotional: string;
}

export class PrecisionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PrecisionError";
	}
}

/** Round price down to the nearest tick size multiple. */
export function roundPrice(price: string, tickSize: string): string {
	const p = new Decimal(price);
	const tick = new Decimal(tickSize);
	return p.div(tick).floor().mul(tick).toString();
}

/** Round quantity down to the nearest lot size multiple. */
export function roundQuantity(quantity: string, lotSize: string): string {
	const q = new Decimal(quantity);
	const lot = new Decimal(lotSize);
	return q.div(lot).floor().mul(lot).toString();
}

/** Validate that quantity * price >= minNotional. Throws PrecisionError if violated. */
export function validateMinNotional(quantity: string, price: string, minNotional: string): void {
	const notional = new Decimal(quantity).mul(new Decimal(price));
	const min = new Decimal(minNotional);
	if (notional.lt(min)) {
		throw new PrecisionError(`notional ${notional.toString()} below minimum ${minNotional}`);
	}
}

/** Validate and round an order against exchange precision rules. */
export function validateOrder(
	price: string,
	quantity: string,
	rules: PrecisionRules,
): { roundedPrice: string; roundedQuantity: string } {
	const roundedPrice = roundPrice(price, rules.tickSize);
	const roundedQuantity = roundQuantity(quantity, rules.lotSize);
	validateMinNotional(roundedQuantity, roundedPrice, rules.minNotional);
	return { roundedPrice, roundedQuantity };
}

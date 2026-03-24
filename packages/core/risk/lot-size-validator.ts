import Decimal from "decimal.js";
import { roundToStepSize } from "./position-sizer.js";

/** Lot size constraints provided by the exchange for a specific symbol. */
export interface ExchangeLotRules {
	stepSize: string;
	minQty: string;
	maxQty: string;
	minNotional: string;
}

/**
 * Thrown when an order quantity violates exchange lot size constraints.
 * `code` is always `'ERR_USER_LOT_SIZE_VIOLATION'`.
 */
export class LotSizeViolationError extends Error {
	readonly code = "ERR_USER_LOT_SIZE_VIOLATION" as const;

	constructor(
		readonly violatedRule: string,
		detail: string,
	) {
		super(`lot-size violation [${violatedRule}]: ${detail}`);
		this.name = "LotSizeViolationError";
	}
}

/**
 * Validates order quantity against exchange lot size rules before submission.
 *
 * All arithmetic uses Decimal.js to avoid floating-point rounding errors.
 */
export class LotSizeValidator {
	/**
	 * Check that `quantity` is an exact multiple of `stepSize`.
	 * Throws `LotSizeViolationError` if not aligned.
	 */
	checkStepSize(quantity: string, stepSize: string): void {
		const qty = new Decimal(quantity);
		const step = new Decimal(stepSize);
		const remainder = qty.mod(step);
		if (!remainder.isZero()) {
			throw new LotSizeViolationError(
				"step-size",
				`quantity ${quantity} is not a multiple of stepSize ${stepSize} (remainder ${remainder.toString()})`,
			);
		}
	}

	/** Check that `quantity >= minQty`. Throws `LotSizeViolationError` if below minimum. */
	checkMinQty(quantity: string, minQty: string): void {
		const qty = new Decimal(quantity);
		const min = new Decimal(minQty);
		if (qty.lt(min)) {
			throw new LotSizeViolationError(
				"min-qty",
				`quantity ${quantity} is below minimum ${minQty}`,
			);
		}
	}

	/** Check that `quantity <= maxQty`. Throws `LotSizeViolationError` if above maximum. */
	checkMaxQty(quantity: string, maxQty: string): void {
		const qty = new Decimal(quantity);
		const max = new Decimal(maxQty);
		if (qty.gt(max)) {
			throw new LotSizeViolationError(
				"max-qty",
				`quantity ${quantity} exceeds maximum ${maxQty}`,
			);
		}
	}

	/**
	 * Check that `price × quantity >= minNotional`.
	 * Throws `LotSizeViolationError` if the resulting notional value is too small.
	 */
	checkMinNotional(quantity: string, price: string, minNotional: string): void {
		const notional = new Decimal(quantity).mul(new Decimal(price));
		const min = new Decimal(minNotional);
		if (notional.lt(min)) {
			throw new LotSizeViolationError(
				"min-notional",
				`notional ${notional.toString()} (${quantity} × ${price}) is below minimum ${minNotional}`,
			);
		}
	}

	/**
	 * Validate `quantity` against all lot size rules in `rules`.
	 *
	 * Applies step-size rounding (floor) first, then checks min qty, max qty,
	 * and min notional in order. Returns the validated (possibly rounded) quantity
	 * string, or throws `LotSizeViolationError` on the first violated rule.
	 */
	validate(quantity: string, price: string, rules: ExchangeLotRules): string {
		const rounded = roundToStepSize(quantity, rules.stepSize);
		this.checkMinQty(rounded, rules.minQty);
		this.checkMaxQty(rounded, rules.maxQty);
		this.checkMinNotional(rounded, price, rules.minNotional);
		return rounded;
	}
}

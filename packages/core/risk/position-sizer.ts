import Decimal from "decimal.js";
import type { PositionSizeConfig, PositionSizeResult } from "./types.js";

export class PositionSizeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PositionSizeError";
	}
}

/** Calculate raw quantity using fixed-fraction formula: (balance * riskPct) / (entryPrice * slPct). */
export function calculateQuantity(
	balance: string,
	entryPrice: string,
	slPct: number,
	config: PositionSizeConfig,
): string {
	const bal = new Decimal(balance);
	const price = new Decimal(entryPrice);
	const qty = bal.mul(config.riskPct).div(price.mul(slPct));
	return qty.toString();
}

/** Round quantity down to the nearest multiple of stepSize. */
export function roundToStepSize(quantity: string, stepSize: string): string {
	const qty = new Decimal(quantity);
	const step = new Decimal(stepSize);
	const rounded = qty.div(step).floor().mul(step);
	return rounded.toString();
}

/** Validate quantity is within min/max bounds. Throws PositionSizeError if violated. */
export function validateQuantity(quantity: string, config: PositionSizeConfig): void {
	const qty = new Decimal(quantity);
	const min = new Decimal(config.minQty);
	const max = new Decimal(config.maxQty);

	if (qty.lt(min)) {
		throw new PositionSizeError(`quantity ${quantity} below minimum ${config.minQty}`);
	}
	if (qty.gt(max)) {
		throw new PositionSizeError(`quantity ${quantity} above maximum ${config.maxQty}`);
	}
}

/** Check if adding new notional would exceed exposure cap. Throws PositionSizeError if violated. */
export function checkExposure(
	currentExposureUsd: string,
	newNotionalUsd: string,
	config: PositionSizeConfig,
): void {
	const total = new Decimal(currentExposureUsd).plus(new Decimal(newNotionalUsd));
	const cap = new Decimal(config.maxExposureUsd);

	if (total.gt(cap)) {
		throw new PositionSizeError(
			`exposure ${total.toString()} exceeds cap ${config.maxExposureUsd}`,
		);
	}
}

/** Check if effective leverage exceeds maximum. Throws PositionSizeError if violated. */
export function checkLeverage(
	notionalUsd: string,
	balance: string,
	config: PositionSizeConfig,
): void {
	const leverage = new Decimal(notionalUsd).div(new Decimal(balance));

	if (leverage.gt(config.maxLeverage)) {
		throw new PositionSizeError(
			`effective leverage ${leverage.toFixed(1)}x exceeds maximum ${config.maxLeverage}x`,
		);
	}
}

/** Full position sizing flow: calculate → round → validate → check exposure → check leverage. */
export function sizePosition(
	balance: string,
	entryPrice: string,
	slPct: number,
	currentExposureUsd: string,
	config: PositionSizeConfig,
): PositionSizeResult {
	const rawQty = calculateQuantity(balance, entryPrice, slPct, config);
	const quantity = roundToStepSize(rawQty, config.stepSize);

	validateQuantity(quantity, config);

	const notionalUsd = new Decimal(quantity).mul(new Decimal(entryPrice)).toString();

	checkExposure(currentExposureUsd, notionalUsd, config);
	checkLeverage(notionalUsd, balance, config);

	const effectiveLeverage = new Decimal(notionalUsd).div(new Decimal(balance)).toString();

	return { quantity, notionalUsd, effectiveLeverage };
}

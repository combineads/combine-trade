import Decimal from "decimal.js";

export interface OpenPosition {
	/** Current price of the asset. */
	price: string;
	/** Quantity held. */
	quantity: string;
}

export interface ExposureLimitConfig {
	/**
	 * Maximum total exposure as a ratio of account balance.
	 * Default: 0.8 (80%).
	 * A new order is rejected only when adding its notional would push total
	 * exposure **strictly above** this ratio — exactly at the limit is allowed.
	 */
	maxTotalExposureRatio?: number;
}

export interface ExposureLimitDeps {
	/** Return all currently open positions for the account. */
	getOpenPositions(): Promise<OpenPosition[]>;
	/** Return current account balance as a decimal string. */
	getAccountBalance(): Promise<string>;
}

export class ExposureLimitError extends Error {
	readonly code = "ERR_USER_EXPOSURE_LIMIT" as const;

	constructor(message: string) {
		super(message);
		this.name = "ExposureLimitError";
	}
}

/**
 * Check whether placing an order with the given price and quantity would push
 * total account exposure strictly above the configured limit.
 *
 * - Exactly at limit → allowed.
 * - Strictly over limit → throws ExposureLimitError with code ERR_USER_EXPOSURE_LIMIT.
 *
 * All arithmetic uses Decimal.js to avoid floating-point precision issues.
 */
export async function checkTotalExposure(
	newOrderPrice: string,
	newOrderQuantity: string,
	config: ExposureLimitConfig,
	deps: ExposureLimitDeps,
): Promise<void> {
	const maxRatio = new Decimal(config.maxTotalExposureRatio ?? 0.8);

	const [positions, balance] = await Promise.all([
		deps.getOpenPositions(),
		deps.getAccountBalance(),
	]);

	const balanceDec = new Decimal(balance);
	const limit = balanceDec.mul(maxRatio);

	// Sum existing position notional values (price × quantity)
	const existingExposure = positions.reduce((sum, pos) => {
		const notional = new Decimal(pos.price).mul(new Decimal(pos.quantity));
		return sum.plus(notional);
	}, new Decimal(0));

	// New order notional
	const newNotional = new Decimal(newOrderPrice).mul(new Decimal(newOrderQuantity));

	const totalExposure = existingExposure.plus(newNotional);

	if (totalExposure.gt(limit)) {
		throw new ExposureLimitError(
			`total exposure ${totalExposure.toString()} would exceed limit ${limit.toString()} ` +
				`(${(config.maxTotalExposureRatio ?? 0.8) * 100}% of balance ${balance})`,
		);
	}
}

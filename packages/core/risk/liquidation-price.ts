import Decimal from "decimal.js";
import type {
	LiquidationPriceInput,
	LiquidationPriceProvider,
	LiquidationPriceResult,
} from "./types.js";

export class LiquidationPriceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LiquidationPriceError";
	}
}

/** Returns true if a value from the exchange should be treated as absent. */
function isAbsent(value: string | null | undefined): boolean {
	return value === null || value === undefined || value === "" || value === "0";
}

/**
 * Calculates liquidation prices using the standard isolated-margin formula.
 *
 * LONG:  entryPrice × (1 − 1/leverage + maintenanceMarginRate)
 * SHORT: entryPrice × (1 + 1/leverage − maintenanceMarginRate)
 */
export class LiquidationPriceCalculator {
	/**
	 * Estimate liquidation price from the formula.
	 * Returns null for cross-margin positions (not calculable without full account balance).
	 * Throws `LiquidationPriceError` on invalid input.
	 */
	estimate(input: LiquidationPriceInput): string | null {
		this.validate(input);

		if (input.marginType === "cross") {
			return null;
		}

		const entry = new Decimal(input.entryPrice);
		const invLeverage = new Decimal(1).div(input.leverage);
		const mmr = new Decimal(input.maintenanceMarginRate);

		if (input.side === "LONG") {
			// entryPrice × (1 − 1/leverage + maintenanceMarginRate)
			return entry.mul(new Decimal(1).minus(invLeverage).plus(mmr)).toString();
		}

		// SHORT: entryPrice × (1 + 1/leverage − maintenanceMarginRate)
		return entry.mul(new Decimal(1).plus(invLeverage).minus(mmr)).toString();
	}

	/**
	 * Try to fetch the liquidation price from the exchange via the provider.
	 * Falls back to the formula if the provider returns null/empty/"0" or throws.
	 */
	async fromExchangeOrEstimate(
		input: LiquidationPriceInput,
		provider: LiquidationPriceProvider,
	): Promise<LiquidationPriceResult> {
		try {
			const exchangeValue = await provider.fetchLiquidationPrice(input);
			if (!isAbsent(exchangeValue)) {
				return { price: exchangeValue as string, source: "exchange" };
			}
		} catch {
			// provider failure → fall through to formula
		}

		return { price: this.estimate(input), source: "estimate" };
	}

	private validate(input: LiquidationPriceInput): void {
		const entry = new Decimal(input.entryPrice);
		if (!entry.isFinite() || entry.lte(0)) {
			throw new LiquidationPriceError(
				`entryPrice must be a positive number, got: ${input.entryPrice}`,
			);
		}

		if (!Number.isFinite(input.leverage) || input.leverage <= 0) {
			throw new LiquidationPriceError(
				`leverage must be a positive number, got: ${input.leverage}`,
			);
		}

		const mmr = new Decimal(input.maintenanceMarginRate);
		if (!mmr.isFinite() || mmr.lt(0)) {
			throw new LiquidationPriceError(
				`maintenanceMarginRate must be >= 0, got: ${input.maintenanceMarginRate}`,
			);
		}
	}
}

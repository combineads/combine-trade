import Decimal from "decimal.js";

export interface LiquidationPosition {
	positionId: string;
	symbol: string;
	side: "LONG" | "SHORT";
	markPrice: string;
	liquidationPrice: string;
}

export interface LiquidationWarningDeps {
	sendWarning(position: LiquidationPosition): Promise<void>;
}

export interface LiquidationWarningConfig {
	/** Percentage threshold below which a position is considered near liquidation (e.g. 5 = 5%). */
	thresholdPct: number;
	/** Minimum milliseconds between warnings for the same positionId. */
	cooldownMs: number;
}

/**
 * Pure function that checks whether a position is near its liquidation price.
 *
 * For LONG: proximity = (markPrice - liquidationPrice) / liquidationPrice
 * For SHORT: proximity = (liquidationPrice - markPrice) / liquidationPrice
 *
 * Returns true when proximity < thresholdPct / 100 (position is dangerously close).
 */
export function isNearLiquidation(
	markPrice: string,
	liquidationPrice: string,
	side: "LONG" | "SHORT",
	thresholdPct: number,
): boolean {
	const mark = new Decimal(markPrice);
	const liq = new Decimal(liquidationPrice);
	const threshold = new Decimal(thresholdPct).div(100);

	let proximity: Decimal;
	if (side === "LONG") {
		// Positive when mark is above liquidation (safe distance)
		proximity = mark.minus(liq).div(liq);
	} else {
		// Positive when mark is below liquidation (safe distance)
		proximity = liq.minus(mark).div(liq);
	}

	// Near liquidation when proximity is at or below threshold
	return proximity.lte(threshold);
}

export class LiquidationWarningMonitor {
	private readonly config: LiquidationWarningConfig;
	/** Tracks last warning time per positionId. */
	private readonly cooldownMap = new Map<string, number>();

	constructor(config: LiquidationWarningConfig) {
		this.config = config;
	}

	/**
	 * Evaluates each position for liquidation proximity.
	 * Sends a warning via deps.sendWarning when position is within threshold
	 * and the per-position cooldown has expired.
	 */
	async check(positions: LiquidationPosition[], deps: LiquidationWarningDeps): Promise<void> {
		const now = Date.now();

		for (const position of positions) {
			const near = isNearLiquidation(
				position.markPrice,
				position.liquidationPrice,
				position.side,
				this.config.thresholdPct,
			);

			if (!near) continue;

			const lastWarned = this.cooldownMap.get(position.positionId) ?? 0;
			if (now - lastWarned < this.config.cooldownMs) continue;

			this.cooldownMap.set(position.positionId, now);
			await deps.sendWarning(position);
		}
	}
}

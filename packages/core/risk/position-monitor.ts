import Decimal from "decimal.js";

export interface ExchangePosition {
	symbol: string;
	side: "LONG" | "SHORT";
	size: string;
	entryPrice: string;
	markPrice: string;
	leverage: number;
	marginType: "isolated" | "cross";
}

export interface ExchangePositionProvider {
	getOpenPositions(): Promise<ExchangePosition[]>;
}

export interface TrackedPosition {
	symbol: string;
	systemOrderId: string;
	side: "LONG" | "SHORT";
	size: string;
	entryPrice: string;
}

export interface PositionSyncResult {
	tracked: ExchangePosition[];
	untracked: ExchangePosition[];
	missing: TrackedPosition[];
}

const DEFAULT_MAINTENANCE_MARGIN_RATE = "0.005";

function positionKey(symbol: string, side: string): string {
	return `${symbol}:${side}`;
}

export class PositionMonitor {
	private provider: ExchangePositionProvider;

	constructor(provider: ExchangePositionProvider) {
		this.provider = provider;
	}

	async sync(systemPositions: TrackedPosition[]): Promise<PositionSyncResult> {
		const exchangePositions = await this.provider.getOpenPositions();

		const systemKeys = new Map<string, TrackedPosition>();
		for (const sp of systemPositions) {
			systemKeys.set(positionKey(sp.symbol, sp.side), sp);
		}

		const tracked: ExchangePosition[] = [];
		const untracked: ExchangePosition[] = [];
		const matchedSystemKeys = new Set<string>();

		for (const ep of exchangePositions) {
			const key = positionKey(ep.symbol, ep.side);
			if (systemKeys.has(key)) {
				tracked.push(ep);
				matchedSystemKeys.add(key);
			} else {
				untracked.push(ep);
			}
		}

		const missing: TrackedPosition[] = [];
		for (const sp of systemPositions) {
			const key = positionKey(sp.symbol, sp.side);
			if (!matchedSystemKeys.has(key)) {
				missing.push(sp);
			}
		}

		return { tracked, untracked, missing };
	}

	calculateAggregateExposure(positions: ExchangePosition[]): {
		totalLongNotional: string;
		totalShortNotional: string;
		netExposure: string;
	} {
		let longNotional = new Decimal(0);
		let shortNotional = new Decimal(0);

		for (const p of positions) {
			const notional = new Decimal(p.size).mul(p.markPrice);
			if (p.side === "LONG") {
				longNotional = longNotional.add(notional);
			} else {
				shortNotional = shortNotional.add(notional);
			}
		}

		const net = longNotional.minus(shortNotional);

		return {
			totalLongNotional: longNotional.toString(),
			totalShortNotional: shortNotional.toString(),
			netExposure: net.toString(),
		};
	}

	estimateLiquidationPrice(position: ExchangePosition): string | null {
		if (position.marginType === "cross") return null;

		const entry = new Decimal(position.entryPrice);
		const invLeverage = new Decimal(1).div(position.leverage);
		const mmr = new Decimal(DEFAULT_MAINTENANCE_MARGIN_RATE);

		if (position.side === "LONG") {
			// entryPrice * (1 - 1/leverage + maintenanceMarginRate)
			return entry.mul(new Decimal(1).minus(invLeverage).add(mmr)).toString();
		}
		// SHORT: entryPrice * (1 + 1/leverage - maintenanceMarginRate)
		return entry.mul(new Decimal(1).add(invLeverage).minus(mmr)).toString();
	}
}

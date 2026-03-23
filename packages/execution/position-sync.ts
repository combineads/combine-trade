export interface ExchangePosition {
	symbol: string;
	side: "long" | "short";
	quantity: string;
	entryPrice: string;
}

export interface LocalPosition {
	symbol: string;
	side: "long" | "short";
	quantity: string;
	entryPrice: string;
	strategyId: string;
}

export interface Discrepancy {
	type: "missing_exchange" | "quantity_mismatch";
	symbol: string;
	side: string;
	expected?: string;
	actual?: string;
	strategyId?: string;
}

export interface SyncReport {
	synced: Array<{ symbol: string; side: string }>;
	discrepancies: Discrepancy[];
	externalPositions: ExchangePosition[];
}

export interface PositionSyncDeps {
	fetchExchangePositions: () => Promise<ExchangePosition[]>;
	loadLocalPositions: () => Promise<LocalPosition[]>;
}

function positionKey(symbol: string, side: string): string {
	return `${symbol}:${side}`;
}

export class PositionSyncService {
	constructor(private readonly deps: PositionSyncDeps) {}

	async syncOnce(): Promise<SyncReport> {
		const [exchangePositions, localPositions] = await Promise.all([
			this.deps.fetchExchangePositions(),
			this.deps.loadLocalPositions(),
		]);

		const localMap = new Map<string, LocalPosition>();
		for (const pos of localPositions) {
			const key = positionKey(pos.symbol, pos.side);
			localMap.set(key, pos);
		}

		const synced: SyncReport["synced"] = [];
		const discrepancies: Discrepancy[] = [];
		const externalPositions: ExchangePosition[] = [];
		const matchedKeys = new Set<string>();

		for (const exPos of exchangePositions) {
			const key = positionKey(exPos.symbol, exPos.side);
			const local = localMap.get(key);

			if (!local) {
				externalPositions.push(exPos);
				continue;
			}

			matchedKeys.add(key);

			if (local.quantity !== exPos.quantity) {
				discrepancies.push({
					type: "quantity_mismatch",
					symbol: exPos.symbol,
					side: exPos.side,
					expected: local.quantity,
					actual: exPos.quantity,
					strategyId: local.strategyId,
				});
			} else {
				synced.push({ symbol: exPos.symbol, side: exPos.side });
			}
		}

		for (const local of localPositions) {
			const key = positionKey(local.symbol, local.side);
			if (
				!matchedKeys.has(key) &&
				!externalPositions.some((e) => positionKey(e.symbol, e.side) === key)
			) {
				discrepancies.push({
					type: "missing_exchange",
					symbol: local.symbol,
					side: local.side,
					strategyId: local.strategyId,
				});
			}
		}

		return { synced, discrepancies, externalPositions };
	}
}

import type { TradeJournal } from "@combine/core/journal";

export interface LabelReadyEvent {
	type: "label_ready";
	tradeId: string;
	strategyId: string;
	strategyVersion: number;
	symbol: string;
	direction: "LONG" | "SHORT";
	entryTime: number;
	exitTime: number;
	entryPrice: string;
	exitPrice: string;
	label: "WIN" | "LOSS" | "TIME_EXIT";
	entryVector: number[];
	exitVector: number[];
}

export interface JournalStorage {
	save(journal: TradeJournal): Promise<void>;
}

export interface EventBusSubscription {
	unsubscribe(): void;
}

export interface EventBus {
	subscribe(eventType: string, handler: (event: unknown) => Promise<void>): EventBusSubscription;
}

export type ExecutionMode = "analysis" | "alert" | "paper" | "live";
export type LoadExecutionMode = () => Promise<ExecutionMode>;

export class JournalEventHandler {
	constructor(
		private eventBus: EventBus,
		private storage: JournalStorage,
		private loadExecutionMode?: LoadExecutionMode,
	) {}

	start(): EventBusSubscription {
		return this.eventBus.subscribe("label_ready", (event) =>
			this.handleLabelReady(event as LabelReadyEvent),
		);
	}

	async handleLabelReady(event: LabelReadyEvent): Promise<void> {
		try {
			const mode = this.loadExecutionMode ? await this.loadExecutionMode() : undefined;
			const journal: TradeJournal = {
				id: crypto.randomUUID(),
				eventId: event.tradeId,
				strategyId: event.strategyId,
				strategyVersion: event.strategyVersion,
				symbol: event.symbol,
				timeframe: "1h",
				direction: event.direction,
				entryPrice: event.entryPrice,
				exitPrice: event.exitPrice,
				entryTime: new Date(event.entryTime * 1000),
				exitTime: new Date(event.exitTime * 1000),
				resultType: event.label,
				pnlPct: 0,
				mfePct: 0,
				maePct: 0,
				holdBars: 0,
				entrySnapshot: {
					id: crypto.randomUUID(),
					eventId: event.tradeId,
					strategyId: event.strategyId,
					symbol: event.symbol,
					entryPrice: event.entryPrice,
					tpPrice: "0",
					slPrice: "0",
					decision: {
						direction: event.direction,
						winrate: 0,
						expectancy: 0,
						sampleCount: 0,
						ciLower: 0,
						ciUpper: 0,
						confidenceTier: "low",
					},
					matchedPatterns: [],
					featureVector: {},
					capturedAt: new Date(),
				},
				exitMarketContext: null,
				backtestComparison: null,
				autoTags: [],
				isPaper: mode === "paper",
				createdAt: new Date(),
			};

			await this.storage.save(journal);
		} catch {
			// Worker must not crash on single event failure — log and continue
		}
	}
}

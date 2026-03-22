import type { CandleBar } from "@combine/core/label";
import { labelEvent } from "@combine/core/label";
import { createLogger } from "@combine/shared";
import { Channels } from "@combine/shared/event-bus/channels.js";
import type { EventPublisher } from "@combine/shared/event-bus/types.js";

const logger = createLogger("label-scanner");

interface UnlabeledEvent {
	id: string;
	strategyId: string;
	strategyVersion: number;
	exchange: string;
	symbol: string;
	timeframe: string;
	openTime: Date;
	direction: "long" | "short";
	entryPrice: string;
}

interface StrategyConfig {
	id: string;
	resultConfig: { tpPct: number; slPct: number; maxHoldBars: number };
}

export interface LabelScannerDeps {
	findUnlabeledEvents: () => Promise<UnlabeledEvent[]>;
	loadStrategy: (strategyId: string) => Promise<StrategyConfig>;
	loadForwardCandles: (
		exchange: string,
		symbol: string,
		timeframe: string,
		openTime: Date,
		count: number,
	) => Promise<CandleBar[]>;
	hasGap: (
		exchange: string,
		symbol: string,
		timeframe: string,
		from: Date,
		count: number,
	) => Promise<boolean>;
	isAlreadyLabeled: (eventId: string) => Promise<boolean>;
	saveLabel: (label: Record<string, unknown>) => Promise<string>;
	publisher: EventPublisher;
}

/**
 * Periodically scans for unlabeled strategy events and creates labels.
 */
export class LabelScanner {
	constructor(private readonly deps: LabelScannerDeps) {}

	/** Scan and label all matured events. Returns count of labels created. */
	async scan(): Promise<number> {
		const events = await this.deps.findUnlabeledEvents();

		if (events.length === 0) {
			logger.info("No unlabeled events found");
			return 0;
		}

		let labeled = 0;

		for (const event of events) {
			try {
				const created = await this.processEvent(event);
				if (created) labeled++;
			} catch (err) {
				logger.warn(
					{ eventId: event.id, error: (err as Error).message },
					"Failed to label event",
				);
			}
		}

		logger.info({ total: events.length, labeled }, "Scan complete");
		return labeled;
	}

	private async processEvent(event: UnlabeledEvent): Promise<boolean> {
		// Check idempotency
		if (await this.deps.isAlreadyLabeled(event.id)) {
			return false;
		}

		// Load strategy config
		const strategy = await this.deps.loadStrategy(event.strategyId);
		const { tpPct, slPct, maxHoldBars } = strategy.resultConfig;

		// Load forward candles
		const forwardCandles = await this.deps.loadForwardCandles(
			event.exchange,
			event.symbol,
			event.timeframe,
			event.openTime,
			maxHoldBars,
		);

		// Insufficient candles — event not mature enough
		if (forwardCandles.length < maxHoldBars) {
			return false;
		}

		// Check for candle gaps
		const hasGap = await this.deps.hasGap(
			event.exchange,
			event.symbol,
			event.timeframe,
			event.openTime,
			maxHoldBars,
		);
		if (hasGap) {
			logger.warn({ eventId: event.id }, "Candle gap detected, skipping label");
			return false;
		}

		// Run labeler
		const result = labelEvent({
			entryPrice: event.entryPrice,
			direction: event.direction,
			tpPct,
			slPct,
			maxHoldBars,
			forwardCandles,
		});

		// Persist label
		const labelId = await this.deps.saveLabel({
			eventId: event.id,
			resultType: result.resultType,
			pnlPct: result.pnlPct.toString(),
			mfePct: result.mfePct.toString(),
			maePct: result.maePct.toString(),
			holdBars: result.holdBars,
			exitPrice: result.exitPrice,
			slHitFirst: result.slHitFirst,
		});

		// Publish label_ready
		await this.deps.publisher.publish(Channels.labelReady, {
			strategyEventId: event.id,
			labelId,
		});

		return true;
	}
}

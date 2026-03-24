import { Decimal } from "decimal.js";
import { createLogger } from "@combine/shared";

const logger = createLogger("slippage-tracker");

/** A single recorded slippage measurement for a filled order. */
export interface SlippageRecord {
	orderId: string;
	decisionPrice: Decimal;
	fillPrice: Decimal;
	/** Positive value in percent. LONG: (fill - decision) / decision * 100. SHORT: (decision - fill) / decision * 100. */
	slippagePct: Decimal;
	direction: "LONG" | "SHORT";
	/** Optional strategy identifier for per-strategy aggregation. */
	strategyId?: string;
	timestamp: Date;
}

/** Aggregated slippage statistics. */
export interface SlippageStats {
	count: number;
	avgSlippagePct: Decimal;
	maxSlippagePct: Decimal;
	/** Number of records exceeding the abnormal threshold. */
	abnormalCount: number;
}

/** Constructor options for SlippageTracker. */
export interface SlippageTrackerOptions {
	/**
	 * Callback invoked when slippage exceeds the threshold.
	 * Inject a Slack notifier here; no direct Slack import in this module.
	 */
	notifySlippage: (record: SlippageRecord) => Promise<void>;
	/**
	 * Slippage threshold in percent above which a WARNING is logged and
	 * `notifySlippage` is called. Defaults to 0.5.
	 */
	threshold?: Decimal;
}

const DEFAULT_THRESHOLD = new Decimal("0.5");

/**
 * Tracks execution slippage by comparing the expected decision price with the
 * actual exchange fill price for each order.
 *
 * Records are stored in-memory. DB persistence is out of scope for this class.
 */
export class SlippageTracker {
	private readonly records: Map<string, SlippageRecord> = new Map();
	private readonly notifySlippage: (record: SlippageRecord) => Promise<void>;
	private readonly threshold: Decimal;

	constructor(options: SlippageTrackerOptions) {
		this.notifySlippage = options.notifySlippage;
		this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
	}

	/**
	 * Record slippage for a filled order.
	 *
	 * Slippage formula (always non-negative):
	 *   LONG:  slippagePct = (fillPrice - decisionPrice) / decisionPrice * 100
	 *   SHORT: slippagePct = (decisionPrice - fillPrice) / decisionPrice * 100
	 *
	 * If `slippagePct > threshold`, emits a WARNING log and calls `notifySlippage`.
	 *
	 * @returns The recorded SlippageRecord.
	 */
	async record(
		orderId: string,
		decisionPrice: Decimal,
		fillPrice: Decimal,
		direction: "LONG" | "SHORT",
		strategyId?: string,
	): Promise<SlippageRecord> {
		const slippagePct =
			direction === "LONG"
				? fillPrice.minus(decisionPrice).dividedBy(decisionPrice).times(100)
				: decisionPrice.minus(fillPrice).dividedBy(decisionPrice).times(100);

		const record: SlippageRecord = {
			orderId,
			decisionPrice,
			fillPrice,
			slippagePct,
			direction,
			strategyId,
			timestamp: new Date(),
		};

		this.records.set(orderId, record);

		if (slippagePct.greaterThan(this.threshold)) {
			logger.warn(
				{
					orderId,
					direction,
					decisionPrice: decisionPrice.toString(),
					fillPrice: fillPrice.toString(),
					slippagePct: slippagePct.toFixed(4),
					threshold: this.threshold.toFixed(2),
					strategyId,
				},
				"Abnormal slippage detected",
			);
			await this.notifySlippage(record);
		}

		return record;
	}

	/**
	 * Returns aggregated slippage statistics across all recorded orders.
	 */
	getStats(): SlippageStats {
		return this.computeStats(Array.from(this.records.values()));
	}

	/**
	 * Returns aggregated slippage statistics filtered to a single strategy.
	 */
	getStatsByStrategy(strategyId: string): SlippageStats {
		const filtered = Array.from(this.records.values()).filter(
			(r) => r.strategyId === strategyId,
		);
		return this.computeStats(filtered);
	}

	private computeStats(records: SlippageRecord[]): SlippageStats {
		if (records.length === 0) {
			return {
				count: 0,
				avgSlippagePct: new Decimal("0"),
				maxSlippagePct: new Decimal("0"),
				abnormalCount: 0,
			};
		}

		let sum = new Decimal("0");
		let max = new Decimal("0");
		let abnormalCount = 0;

		for (const record of records) {
			sum = sum.plus(record.slippagePct);
			if (record.slippagePct.greaterThan(max)) {
				max = record.slippagePct;
			}
			if (record.slippagePct.greaterThan(this.threshold)) {
				abnormalCount++;
			}
		}

		const avg = sum.dividedBy(records.length);

		return {
			count: records.length,
			avgSlippagePct: avg,
			maxSlippagePct: max,
			abnormalCount,
		};
	}
}

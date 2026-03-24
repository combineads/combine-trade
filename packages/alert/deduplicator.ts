/**
 * Alert deduplication — prevents duplicate Slack alerts for the same event.
 *
 * Uses an in-memory Map<eventId, expiryTimestamp> with lazy TTL eviction.
 * The interface is async to allow drop-in replacement with a Redis-backed store.
 */

export interface AlertDeduplicatorOptions {
	/** TTL in seconds for each seen event. Default: 3600 (1 hour). */
	ttlSeconds?: number;
	/**
	 * Injectable clock function (milliseconds since epoch).
	 * Defaults to Date.now. Override in tests to control time.
	 */
	getNow?: () => number;
}

/** Store interface — in-memory or Redis implementations satisfy this shape. */
export interface AlreadySeenStore {
	get(eventId: string): Promise<number | undefined>;
	set(eventId: string, expiryMs: number): Promise<void>;
	delete(eventId: string): Promise<void>;
}

/**
 * In-memory implementation of AlreadySeenStore.
 * Stores expiry timestamps in a Map; eviction is lazy (on access).
 */
class InMemorySeenStore implements AlreadySeenStore {
	private readonly store = new Map<string, number>();

	async get(eventId: string): Promise<number | undefined> {
		return this.store.get(eventId);
	}

	async set(eventId: string, expiryMs: number): Promise<void> {
		this.store.set(eventId, expiryMs);
	}

	async delete(eventId: string): Promise<void> {
		this.store.delete(eventId);
	}
}

/**
 * Deduplicates alert events by eventId with configurable TTL.
 *
 * Usage:
 * ```ts
 * const dedup = new AlertDeduplicator({ ttlSeconds: 3600 });
 * if (await dedup.isDuplicate(eventId)) return; // skip
 * await dedup.markSeen(eventId);
 * // ... send alert
 * ```
 */
export class AlertDeduplicator {
	private readonly ttlMs: number;
	private readonly getNow: () => number;
	private readonly store: AlreadySeenStore;
	private _duplicateCount = 0;

	constructor(options: AlertDeduplicatorOptions = {}) {
		this.ttlMs = (options.ttlSeconds ?? 3600) * 1000;
		this.getNow = options.getNow ?? (() => Date.now());
		this.store = new InMemorySeenStore();
	}

	/**
	 * Returns true if the given eventId was marked seen within the TTL window.
	 * Increments `duplicateCount` on every true result.
	 * Performs lazy eviction of expired entries.
	 */
	async isDuplicate(eventId: string): Promise<boolean> {
		const expiryMs = await this.store.get(eventId);

		if (expiryMs === undefined) {
			return false;
		}

		// Lazy eviction: remove expired entry
		if (this.getNow() >= expiryMs) {
			await this.store.delete(eventId);
			return false;
		}

		this._duplicateCount++;
		return true;
	}

	/**
	 * Marks the given eventId as seen, recording an expiry timestamp.
	 * Performs lazy eviction of expired entries on write.
	 */
	async markSeen(eventId: string): Promise<void> {
		const expiryMs = this.getNow() + this.ttlMs;
		await this.store.set(eventId, expiryMs);
	}

	/** Total number of duplicate hits detected since construction. */
	get duplicateCount(): number {
		return this._duplicateCount;
	}
}

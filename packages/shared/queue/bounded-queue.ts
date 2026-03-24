export type OverflowPolicy = "drop-oldest" | "drop-newest" | "block";

export interface BoundedQueueOptions<T> {
	/** Maximum number of items the queue can hold. */
	maxSize: number;
	/** Behavior when the queue is full. */
	overflow: OverflowPolicy;
	/** Called when queue size reaches or exceeds 80% of maxSize. */
	onWarning?: (size: number, maxSize: number) => void;
}

const WARNING_THRESHOLD = 0.8;

/**
 * Bounded FIFO queue with configurable overflow policy.
 * Used by pipeline workers to prevent memory overflow under burst load.
 */
export class BoundedQueue<T> {
	private readonly items: T[] = [];
	private readonly pendingEnqueues: Array<{ item: T; resolve: () => void }> = [];

	constructor(private readonly options: BoundedQueueOptions<T>) {}

	get size(): number {
		return this.items.length;
	}

	get isEmpty(): boolean {
		return this.items.length === 0;
	}

	get isFull(): boolean {
		return this.items.length >= this.options.maxSize;
	}

	/**
	 * Enqueue an item.
	 * - `drop-oldest`: synchronously drops the front item and inserts the new one.
	 * - `drop-newest`: synchronously discards the new item if full.
	 * - `block`: async — waits until space is available.
	 *
	 * Returns a Promise for all policies (sync policies resolve immediately).
	 */
	enqueue(item: T): Promise<void> {
		if (!this.isFull) {
			this.items.push(item);
			this.checkWarning();
			return Promise.resolve();
		}

		switch (this.options.overflow) {
			case "drop-oldest":
				this.items.shift();
				this.items.push(item);
				this.checkWarning();
				return Promise.resolve();

			case "drop-newest":
				// Discard — do not add
				return Promise.resolve();

			case "block":
				return new Promise<void>((resolve) => {
					this.pendingEnqueues.push({ item, resolve });
				});
		}
	}

	/**
	 * Remove and return the front item, or `undefined` if empty.
	 * Also unblocks a pending `block`-policy enqueue if space is now available.
	 */
	dequeue(): T | undefined {
		if (this.isEmpty) return undefined;
		const item = this.items.shift();

		// Unblock one pending enqueue if any
		const pending = this.pendingEnqueues.shift();
		if (pending !== undefined) {
			this.items.push(pending.item);
			this.checkWarning();
			pending.resolve();
		}

		return item;
	}

	private checkWarning(): void {
		if (
			this.options.onWarning !== undefined &&
			this.items.length / this.options.maxSize >= WARNING_THRESHOLD
		) {
			this.options.onWarning(this.items.length, this.options.maxSize);
		}
	}
}

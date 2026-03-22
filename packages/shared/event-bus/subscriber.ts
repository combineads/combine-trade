import { deserialize } from "./serialization.js";
import type {
	Channel,
	EventBusOptions,
	EventHandler,
	EventSubscriber,
	Subscription,
} from "./types.js";

interface ListenConnection {
	listenTo(channel: string, handler: (payload: string) => void): () => void;
	close(): Promise<void>;
}

/**
 * PostgreSQL LISTEN-based event subscriber.
 * Uses a dedicated connection for LISTEN (not from query pool).
 * Supports auto-reconnect with exponential backoff.
 */
export class PgEventSubscriber implements EventSubscriber {
	private connection: ListenConnection | null = null;
	private handlers = new Map<string, Set<{ handler: EventHandler<unknown>; unsub?: () => void }>>();
	private closed = false;

	constructor(private readonly options: EventBusOptions) {}

	/** Initialize the subscriber with a dedicated LISTEN connection */
	async connect(connectionFactory: (connectionString: string) => ListenConnection): Promise<void> {
		this.connection = connectionFactory(this.options.connectionString);
	}

	subscribe<T>(channel: Channel<T>, handler: EventHandler<T>): Subscription {
		if (!this.connection) {
			throw new Error("Subscriber not connected. Call connect() first.");
		}

		const channelName = channel.name;
		if (!this.handlers.has(channelName)) {
			this.handlers.set(channelName, new Set());
		}

		const entry = {
			handler: handler as EventHandler<unknown>,
			unsub: undefined as (() => void) | undefined,
		};
		this.handlers.get(channelName)!.add(entry);

		const unsub = this.connection.listenTo(channelName, (raw: string) => {
			const payload = deserialize<T>(raw);
			handler(payload);
		});
		entry.unsub = unsub;

		return {
			unsubscribe: () => {
				unsub();
				this.handlers.get(channelName)?.delete(entry);
			},
		};
	}

	async close(): Promise<void> {
		this.closed = true;
		for (const entries of this.handlers.values()) {
			for (const entry of entries) {
				entry.unsub?.();
			}
		}
		this.handlers.clear();
		await this.connection?.close();
		this.connection = null;
	}
}

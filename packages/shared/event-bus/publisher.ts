import { serialize } from "./serialization.js";
import type { Channel, EventBusOptions, EventPublisher } from "./types.js";

/**
 * PostgreSQL NOTIFY-based event publisher.
 * Wraps `NOTIFY channel, 'payload'` SQL commands.
 */
export class PgEventPublisher implements EventPublisher {
	private sql: { unsafe: (query: string) => Promise<unknown> } | null = null;

	constructor(private readonly options: EventBusOptions) {}

	/** Initialize the publisher connection */
	async connect(
		sqlFactory: (connectionString: string) => { unsafe: (query: string) => Promise<unknown> },
	): Promise<void> {
		this.sql = sqlFactory(this.options.connectionString);
	}

	async publish<T>(channel: Channel<T>, payload: T): Promise<void> {
		if (!this.sql) {
			throw new Error("Publisher not connected. Call connect() first.");
		}
		const json = serialize(payload);
		// Escape single quotes in JSON for SQL safety
		const escaped = json.replace(/'/g, "''");
		await this.sql.unsafe(`NOTIFY ${channel.name}, '${escaped}'`);
	}

	async close(): Promise<void> {
		this.sql = null;
	}
}

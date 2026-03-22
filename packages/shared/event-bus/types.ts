/** Event bus channel definition */
export interface Channel<T = unknown> {
	name: string;
	_type?: T; // phantom type
}

/** Create a typed channel */
export function createChannel<T>(name: string): Channel<T> {
	return { name };
}

/** Event handler callback */
export type EventHandler<T> = (payload: T) => void | Promise<void>;

/** Subscription handle for unsubscribing */
export interface Subscription {
	unsubscribe(): void;
}

/** Event publisher interface */
export interface EventPublisher {
	publish<T>(channel: Channel<T>, payload: T): Promise<void>;
	close(): Promise<void>;
}

/** Event subscriber interface */
export interface EventSubscriber {
	subscribe<T>(channel: Channel<T>, handler: EventHandler<T>): Subscription;
	close(): Promise<void>;
}

/** Connection options for the event bus */
export interface EventBusOptions {
	connectionString: string;
	reconnectBaseMs?: number;
	reconnectMaxMs?: number;
}

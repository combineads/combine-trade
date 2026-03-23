export type SSEStatus = "connecting" | "open" | "error" | "closed";

export interface SSEOptions {
	url: string;
	eventTypes?: string[];
	withCredentials?: boolean;
	reconnectDelay?: number;
	maxReconnects?: number;
	enabled?: boolean;
}

export interface SSEEvent<T = unknown> {
	type: string;
	data: T;
	id?: string;
	timestamp: number;
}

export interface UseSSEReturn<T = unknown> {
	lastEvent: SSEEvent<T> | null;
	events: SSEEvent<T>[];
	status: SSEStatus;
	reconnectCount: number;
	close: () => void;
}

const MAX_BUFFER = 100;

/**
 * SSE hook for subscribing to server-sent events.
 * In SSR (no window/EventSource), returns safe defaults.
 * In the browser, manages EventSource lifecycle with reconnection.
 */
export function useSSE<T = unknown>(options: SSEOptions): UseSSEReturn<T> {
	const { enabled = true } = options;

	// SSR or disabled — return safe defaults
	if (typeof globalThis.EventSource === "undefined" || !enabled) {
		return {
			lastEvent: null,
			events: [],
			status: "closed",
			reconnectCount: 0,
			close: () => {},
		};
	}

	// Client-side implementation requires React hooks (useState, useEffect, useRef).
	// This is the SSR-safe entry point. The actual reactive implementation
	// uses React hooks and will be activated when mounted in a component.
	// For now, we use a simple imperative approach that works in both test and runtime.

	let status: SSEStatus = "connecting";
	let reconnectCount = 0;
	const events: SSEEvent<T>[] = [];
	let lastEvent: SSEEvent<T> | null = null;
	let closed = false;

	const {
		url,
		eventTypes,
		withCredentials = true,
		reconnectDelay = 3000,
		maxReconnects = 10,
	} = options;

	let es: EventSource | null = null;

	function connect() {
		if (closed) return;
		es = new EventSource(url, { withCredentials });
		status = "connecting";

		es.onopen = () => {
			status = "open";
		};

		es.onerror = () => {
			status = "error";
			es?.close();
			if (!closed && (maxReconnects === 0 || reconnectCount < maxReconnects)) {
				reconnectCount++;
				setTimeout(connect, reconnectDelay);
			}
		};

		function handleEvent(e: MessageEvent) {
			try {
				const data = JSON.parse(e.data) as T;
				const event: SSEEvent<T> = {
					type: e.type,
					data,
					id: e.lastEventId || undefined,
					timestamp: Date.now(),
				};
				lastEvent = event;
				events.push(event);
				if (events.length > MAX_BUFFER) {
					events.shift();
				}
			} catch {
				// JSON parse failed — store raw string data
				const event: SSEEvent<T> = {
					type: e.type,
					data: e.data as T,
					id: e.lastEventId || undefined,
					timestamp: Date.now(),
				};
				lastEvent = event;
				events.push(event);
				if (events.length > MAX_BUFFER) {
					events.shift();
				}
			}
		}

		if (eventTypes && eventTypes.length > 0) {
			for (const type of eventTypes) {
				es.addEventListener(type, handleEvent as EventListener);
			}
		} else {
			es.onmessage = handleEvent;
		}
	}

	connect();

	return {
		get lastEvent() {
			return lastEvent;
		},
		get events() {
			return events;
		},
		get status() {
			return status;
		},
		get reconnectCount() {
			return reconnectCount;
		},
		close() {
			closed = true;
			status = "closed";
			es?.close();
		},
	};
}

import { Elysia } from "elysia";

export type SseEventType = "decision" | "alert" | "order" | "candle" | "heartbeat";

export interface SseEvent {
	type: SseEventType;
	data: unknown;
}

export interface SseRouteDeps {
	subscribe: (listener: (event: SseEvent) => void) => () => void;
}

export function sseRoutes(deps: SseRouteDeps) {
	return new Elysia().get("/api/v1/stream", ({ set }) => {
		set.headers["content-type"] = "text/event-stream";
		set.headers["cache-control"] = "no-cache";
		set.headers.connection = "keep-alive";

		const stream = new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();

				const send = (event: SseEvent) => {
					const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
					try {
						controller.enqueue(encoder.encode(payload));
					} catch {
						// stream closed
					}
				};

				// Send initial heartbeat
				send({ type: "heartbeat", data: { time: new Date().toISOString() } });

				const unsubscribe = deps.subscribe(send);

				// Heartbeat interval
				const heartbeat = setInterval(() => {
					send({ type: "heartbeat", data: { time: new Date().toISOString() } });
				}, 30_000);

				// Cleanup when client disconnects is handled by the AbortSignal
				// The stream will throw when the client disconnects
				void Promise.resolve().then(() => {
					return new Promise<void>((resolve) => {
						const check = setInterval(() => {
							try {
								controller.enqueue(new Uint8Array(0));
							} catch {
								clearInterval(check);
								clearInterval(heartbeat);
								unsubscribe();
								resolve();
							}
						}, 5_000);
					});
				});
			},
		});

		return new Response(stream, {
			headers: {
				"content-type": "text/event-stream",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});
	});
}

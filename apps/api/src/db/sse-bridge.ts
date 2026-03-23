import { EventEmitter } from "node:events";
import type { SseEvent } from "../routes/sse.js";

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export const sseSubscribe = (listener: (event: SseEvent) => void): (() => void) => {
	emitter.on("event", listener);
	return () => emitter.off("event", listener);
};

export const emitSseEvent = (event: SseEvent): void => {
	emitter.emit("event", event);
};

export function createSseBridge(): {
	sseSubscribe: (listener: (event: SseEvent) => void) => () => void;
} {
	return { sseSubscribe };
}

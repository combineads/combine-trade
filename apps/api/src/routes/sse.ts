import type { StrategyRepository } from "@combine/core/strategy/repository.js";
import { Elysia } from "elysia";
import { requireSession } from "../lib/auth-helpers.js";
import type { AuthLike } from "../server.js";

export type SseEventType = "decision" | "alert" | "order" | "candle" | "heartbeat" | "auth_expired";

export interface SseEvent {
	type: SseEventType;
	data: unknown;
}

export interface SseRouteDeps {
	subscribe: (listener: (event: SseEvent) => void) => () => void;
	auth: AuthLike;
	strategyRepository: StrategyRepository;
	/** Interval in milliseconds between session re-validation checks. Default: 60_000. */
	revalidateIntervalMs?: number;
	/**
	 * Testing hook: a function that, when set, will be called with a trigger function.
	 * Calling `deps.triggerRevalidate()` in tests forces an immediate re-validation cycle.
	 */
	triggerRevalidate?: () => Promise<void>;
}

/**
 * Determines whether an event should be forwarded to a particular user.
 *
 * Rules:
 * - Events with a `strategyId` in their data are forwarded only if that strategy
 *   belongs to the authenticated user (present in `userStrategyIds`).
 * - All other events (orders, alerts, heartbeats, etc.) are always forwarded.
 */
function shouldForwardEvent(event: SseEvent, userStrategyIds: Set<string>): boolean {
	if (
		event.data !== null &&
		typeof event.data === "object" &&
		"strategyId" in event.data &&
		typeof (event.data as Record<string, unknown>).strategyId === "string"
	) {
		const strategyId = (event.data as Record<string, unknown>).strategyId as string;
		return userStrategyIds.has(strategyId);
	}
	// Non-strategy events are always forwarded
	return true;
}

export function sseRoutes(deps: SseRouteDeps) {
	const revalidateIntervalMs = deps.revalidateIntervalMs ?? 60_000;

	return new Elysia().get("/api/v1/stream", async ({ request }) => {
		// --- Auth guard: validate session before upgrading to SSE ---
		const session = await requireSession(request, deps.auth);
		if (!session) {
			return new Response(
				JSON.stringify({ error: { code: "UNAUTHORIZED", message: "No valid session" } }),
				{
					status: 401,
					headers: { "content-type": "application/json" },
				},
			);
		}

		const userId = session.user.id;

		// Load the user's active strategy IDs for event filtering
		const activeStrategies = await deps.strategyRepository.findActive(userId);
		const userStrategyIds = new Set(activeStrategies.map((s) => s.id));

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

				// Subscribe — filter events by user strategy ownership
				const unsubscribe = deps.subscribe((event) => {
					if (shouldForwardEvent(event, userStrategyIds)) {
						send(event);
					}
				});

				// Periodic heartbeat
				const heartbeat = setInterval(() => {
					send({ type: "heartbeat", data: { time: new Date().toISOString() } });
				}, 30_000);

				// Periodic session re-validation
				const revalidate = async () => {
					const freshSession = await requireSession(request, deps.auth);
					if (!freshSession) {
						send({ type: "auth_expired", data: { time: new Date().toISOString() } });
						clearInterval(revalidateTimer);
						clearInterval(heartbeat);
						unsubscribe();
						try {
							controller.close();
						} catch {
							// already closed
						}
					} else {
						// Refresh user strategy IDs in case strategies changed
						try {
							const freshStrategies = await deps.strategyRepository.findActive(
								freshSession.user.id,
							);
							userStrategyIds.clear();
							for (const s of freshStrategies) {
								userStrategyIds.add(s.id);
							}
						} catch {
							// non-fatal; continue with stale strategy IDs
						}
					}
				};

				const revalidateTimer = setInterval(revalidate, revalidateIntervalMs);

				// Expose revalidate for tests — always write so tests can call it after stream starts
				(deps as SseRouteDeps).triggerRevalidate = revalidate;

				// Cleanup when client disconnects
				void Promise.resolve().then(() => {
					return new Promise<void>((resolve) => {
						const check = setInterval(() => {
							try {
								controller.enqueue(new Uint8Array(0));
							} catch {
								clearInterval(check);
								clearInterval(heartbeat);
								clearInterval(revalidateTimer);
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

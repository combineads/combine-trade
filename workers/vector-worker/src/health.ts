import { createLogger } from "@combine/shared";

const logger = createLogger("vector-worker-health");

/** Simple health check HTTP server for vector-worker */
export function startHealthServer(port = 9003): { stop: () => void } {
	const server = Bun.serve({
		port,
		fetch() {
			return new Response(JSON.stringify({ status: "ok", worker: "vector-worker" }), {
				headers: { "Content-Type": "application/json" },
			});
		},
	});

	logger.info({ port }, "Vector worker health server started");

	return {
		stop: () => server.stop(),
	};
}

import { createLogger } from "@combine/shared";

const logger = createLogger("label-worker-health");

export function startHealthServer(port = 9004): { stop: () => void } {
	const server = Bun.serve({
		port,
		fetch() {
			return new Response(JSON.stringify({ status: "ok", worker: "label-worker" }), {
				headers: { "Content-Type": "application/json" },
			});
		},
	});

	logger.info({ port }, "Label worker health server started");
	return { stop: () => server.stop() };
}

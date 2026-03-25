import type { CandleCollector } from "./collector.js";

/** Start a health check server for the candle collector worker */
export function startHealthServer(collector: CandleCollector, port = 9001) {
	return Bun.serve({
		port,
		fetch() {
			return Response.json({
				status: "ok",
				lastCandleTime: collector.lastCandleTime?.toISOString() ?? null,
				gapRepairStatus: collector.gapRepairStatus,
				symbols: collector.symbolsHealth,
			});
		},
	});
}

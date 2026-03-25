import type { CandleCollector } from "./collector.js";
import type { ExchangeCollectorManager } from "./exchange-manager.js";

/**
 * Start a health check server.
 *
 * Accepts either a legacy single `CandleCollector` (for backward compat)
 * or an `ExchangeCollectorManager` that reports per-exchange health.
 */
export function startHealthServer(source: CandleCollector | ExchangeCollectorManager, port = 9001) {
	return Bun.serve({
		port,
		fetch() {
			if (isManager(source)) {
				const exchanges = source.getHealth();
				const overall = source.getOverallStatus();
				return Response.json({ status: overall, exchanges });
			}

			// Legacy single-collector mode
			return Response.json({
				status: "ok",
				lastCandleTime: source.lastCandleTime?.toISOString() ?? null,
				gapRepairStatus: source.gapRepairStatus,
			});
		},
	});
}

function isManager(
	source: CandleCollector | ExchangeCollectorManager,
): source is ExchangeCollectorManager {
	return typeof (source as ExchangeCollectorManager).getHealth === "function";
}

import type { StrategyEvaluator } from "./evaluator.js";

/** Start a health check server for the strategy worker */
export function startHealthServer(evaluator: StrategyEvaluator, port = 9002) {
	return Bun.serve({
		port,
		fetch() {
			return Response.json({
				status: "ok",
				lastEvaluationTime: evaluator.lastEvaluationTime?.toISOString() ?? null,
				activeStrategies: evaluator.activeStrategyCount,
			});
		},
	});
}

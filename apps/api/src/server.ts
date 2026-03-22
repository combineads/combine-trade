import cors from "@elysiajs/cors";
import { Elysia } from "elysia";
import type { StrategyRepository } from "../../../packages/core/strategy/repository.js";
import type { ExecutionModeDeps } from "../../../packages/execution/types.js";
import type { KillSwitchRouteDeps } from "./routes/kill-switch.js";
import type { CredentialRouteDeps } from "./routes/credentials.js";
import type { EventRouteDeps } from "./routes/events.js";
import type { OrderRouteDeps } from "./routes/orders.js";
import type { CandleRouteDeps } from "./routes/candles.js";
import type { AlertRouteDeps } from "./routes/alerts.js";
import type { BacktestRouteDeps } from "./routes/backtest.js";
import type { SseEvent } from "./routes/sse.js";
import { errorHandlerPlugin } from "./lib/errors.js";
import { healthRoute } from "./routes/health.js";
import { strategyRoutes } from "./routes/strategies.js";
import { authRoutes } from "./routes/auth.js";
import { killSwitchRoutes } from "./routes/kill-switch.js";
import { credentialRoutes } from "./routes/credentials.js";
import { eventRoutes } from "./routes/events.js";
import { orderRoutes } from "./routes/orders.js";
import { candleRoutes } from "./routes/candles.js";
import { alertRoutes } from "./routes/alerts.js";
import { backtestRoutes } from "./routes/backtest.js";
import { sseRoutes } from "./routes/sse.js";

export interface ApiServerDeps {
	jwtSecret: string;
	masterEncryptionKey: string;
	strategyRepository: StrategyRepository;
	executionModeDeps: ExecutionModeDeps;
	killSwitchDeps: KillSwitchRouteDeps;
	findUserByUsername: (
		username: string,
	) => Promise<{ id: string; username: string; passwordHash: string; role: string } | null>;
	sseSubscribe: (listener: (event: SseEvent) => void) => () => void;
	credentialDeps: CredentialRouteDeps;
	eventDeps: EventRouteDeps;
	orderDeps: OrderRouteDeps;
	candleDeps: CandleRouteDeps;
	alertDeps: AlertRouteDeps;
	backtestDeps: BacktestRouteDeps;
}

/**
 * Create the fully wired Elysia API server.
 * All route factories receive their deps here.
 */
export function createApiServer(deps: ApiServerDeps) {
	return new Elysia()
		.use(cors())
		.use(errorHandlerPlugin)
		.use(healthRoute)
		.use(
			authRoutes({
				accessSecret: deps.jwtSecret,
				refreshSecret: deps.jwtSecret,
				findUserByUsername: deps.findUserByUsername,
			}),
		)
		.use(
			strategyRoutes({
				strategyRepository: deps.strategyRepository,
				executionModeDeps: deps.executionModeDeps,
			}),
		)
		.use(killSwitchRoutes(deps.killSwitchDeps))
		.use(credentialRoutes(deps.credentialDeps))
		.use(eventRoutes(deps.eventDeps))
		.use(orderRoutes(deps.orderDeps))
		.use(candleRoutes(deps.candleDeps))
		.use(alertRoutes(deps.alertDeps))
		.use(backtestRoutes(deps.backtestDeps))
		.use(sseRoutes({ subscribe: deps.sseSubscribe }));
}

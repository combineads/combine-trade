import cors from "@elysiajs/cors";
import { Elysia } from "elysia";
import type { StrategyRepository } from "../../../packages/core/strategy/repository.js";
import type { ExecutionModeDeps } from "../../../packages/execution/types.js";
import { createAuthGuard } from "../../../packages/shared/auth/middleware.js";
import { verifyToken as verifyTokenFromShared } from "../../../packages/shared/auth/token.js";
import type { KillSwitchRouteDeps } from "./routes/kill-switch.js";
import type { CredentialRouteDeps } from "./routes/credentials.js";
import type { EventRouteDeps } from "./routes/events.js";
import type { OrderRouteDeps } from "./routes/orders.js";
import type { CandleRouteDeps } from "./routes/candles.js";
import type { AlertRouteDeps } from "./routes/alerts.js";
import type { BacktestRouteDeps } from "./routes/backtest.js";
import type { JournalRouteDeps } from "./routes/journals.js";
import type { PaperRouteDeps } from "./routes/paper.js";
import type { SseEvent } from "./routes/sse.js";
import { UnauthorizedError, errorHandlerPlugin } from "./lib/errors.js";
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
import { journalRoutes } from "./routes/journals.js";
import { paperRoutes } from "./routes/paper.js";
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
	journalDeps: JournalRouteDeps;
	paperDeps: PaperRouteDeps;
}

const PUBLIC_PATHS = [
	"/api/v1/health",
	"/api/v1/auth/login",
	"/api/v1/auth/refresh",
	"/api/v1/auth/logout",
];

function authGuardPlugin(jwtSecret: string) {
	const guard = createAuthGuard({
		verifyToken: async (token: string) => {
			const deps = {
				secret: jwtSecret,
				saveRefreshToken: async () => {},
				isRefreshTokenRevoked: async () => false,
			};
			return verifyTokenFromShared(token, deps);
		},
		publicPaths: PUBLIC_PATHS,
	});

	return new Elysia({ name: "auth-guard" }).onBeforeHandle(
		{ as: "global" },
		async ({ request }) => {
			const url = new URL(request.url);
			const authorization = request.headers.get("authorization") ?? undefined;
			const result = await guard(url.pathname, authorization);
			if (!result.allowed) {
				throw new UnauthorizedError(result.error ?? "Unauthorized");
			}
		},
	);
}

/**
 * Create the fully wired Elysia API server.
 * All route factories receive their deps here.
 */
export function createApiServer(deps: ApiServerDeps) {
	return new Elysia()
		.use(cors())
		.use(errorHandlerPlugin)
		.use(authGuardPlugin(deps.jwtSecret))
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
		.use(journalRoutes(deps.journalDeps))
		.use(paperRoutes(deps.paperDeps))
		.use(sseRoutes({ subscribe: deps.sseSubscribe }));
}

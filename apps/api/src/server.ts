import cors from "@elysiajs/cors";
import { Elysia } from "elysia";
import { elysiaHelmet } from "elysiajs-helmet";
import type { StrategyRepository } from "@combine/core/strategy/repository.js";
import type { ExecutionModeDeps } from "@combine/execution/types.js";
import { UnauthorizedError, errorHandlerPlugin } from "./lib/errors.js";
import type { AlertRouteDeps } from "./routes/alerts.js";
import { alertRoutes } from "./routes/alerts.js";
import type { BacktestRouteDeps } from "./routes/backtest.js";
import { backtestRoutes } from "./routes/backtest.js";
import type { CandleRouteDeps } from "./routes/candles.js";
import { candleRoutes } from "./routes/candles.js";
import type { CredentialRouteDeps } from "./routes/credentials.js";
import { credentialRoutes } from "./routes/credentials.js";
import type { EventRouteDeps } from "./routes/events.js";
import { eventRoutes } from "./routes/events.js";
import { healthRoute } from "./routes/health.js";
import type { JournalRouteDeps } from "./routes/journals.js";
import { journalRoutes } from "./routes/journals.js";
import type { KillSwitchRouteDeps } from "./routes/kill-switch.js";
import { killSwitchRoutes } from "./routes/kill-switch.js";
import type { OrderRouteDeps } from "./routes/orders.js";
import { orderRoutes } from "./routes/orders.js";
import type { PaperRouteDeps } from "./routes/paper.js";
import { paperRoutes } from "./routes/paper.js";
import type { TradingModeRouteDeps, ReadinessRouteDeps } from "./routes/trading/index.js";
import { tradingModeRoutes, readinessRoutes } from "./routes/trading/index.js";
import type { SseEvent } from "./routes/sse.js";
import { sseRoutes } from "./routes/sse.js";
import { strategyRoutes } from "./routes/strategies.js";

/**
 * Minimal interface for the better-auth instance required by the server.
 * Using a structural interface allows test doubles to be injected without
 * pulling in the full better-auth package in unit tests.
 */
export interface AuthLike {
	/** Fetch handler for all /api/auth/** requests. */
	handler: (request: Request) => Promise<Response>;
	api: {
		/** Resolve the current session from request headers (cookie or Bearer). */
		getSession: (ctx: { headers: Headers }) => Promise<{ user: { id: string } } | null>;
	};
}

export interface ApiServerDeps {
	/** better-auth instance (or a compatible test double). */
	auth: AuthLike;
	masterEncryptionKey: string;
	strategyRepository: StrategyRepository;
	executionModeDeps: ExecutionModeDeps;
	killSwitchDeps: KillSwitchRouteDeps;
	sseSubscribe: (listener: (event: SseEvent) => void) => () => void;
	credentialDeps: CredentialRouteDeps;
	eventDeps: EventRouteDeps;
	orderDeps: OrderRouteDeps;
	candleDeps: CandleRouteDeps;
	alertDeps: AlertRouteDeps;
	backtestDeps: BacktestRouteDeps;
	journalDeps: JournalRouteDeps;
	paperDeps: PaperRouteDeps;
	tradingModeDeps: TradingModeRouteDeps;
	readinessDeps: ReadinessRouteDeps;
}

const PUBLIC_PATH = "/api/v1/health";
const BETTER_AUTH_PATH_PREFIX = "/api/auth/";

/**
 * Elysia plugin that:
 *  - Forwards all /api/auth/** requests to the better-auth handler
 *  - Validates session for all other routes (returns 401 when no valid session)
 *  - Passes /api/v1/health without authentication
 *  - Derives `userId` from the verified session and injects it into context
 */
function betterAuthPlugin(auth: AuthLike) {
	return (
		new Elysia({ name: "better-auth" })
			// Register the better-auth catch-all routes so Elysia resolves them
			.all("/api/auth/*", async ({ request }) => {
				return auth.handler(request);
			})
			// Derive userId from the verified session for all protected routes.
			// Returns "" for public/auth paths — the guard below handles those.
			.derive({ as: "global" }, async ({ request }) => {
				const url = new URL(request.url);
				const path = url.pathname;

				if (path === PUBLIC_PATH || path.startsWith(BETTER_AUTH_PATH_PREFIX)) {
					return { userId: "" };
				}

				const session = await auth.api.getSession({ headers: request.headers });
				return { userId: session?.user.id ?? "" };
			})
			// Global auth guard — rejects requests with no valid session
			.onBeforeHandle({ as: "global" }, async ({ request, userId }) => {
				const url = new URL(request.url);
				const path = url.pathname;

				// Pass health check without auth
				if (path === PUBLIC_PATH) {
					return;
				}

				// better-auth routes are handled by the route above — skip guard
				if (path.startsWith(BETTER_AUTH_PATH_PREFIX)) {
					return;
				}

				// userId is "" when session was null — reject the request
				if (!userId) {
					throw new UnauthorizedError("No valid session");
				}
			})
	);
}

/**
 * Create the fully wired Elysia API server.
 * All route factories receive their deps here.
 */
export function createApiServer(deps: ApiServerDeps) {
	return new Elysia()
		.use(elysiaHelmet())
		.use(
			cors({
				origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:3001",
				credentials: true,
			}),
		)
		.use(errorHandlerPlugin)
		.use(betterAuthPlugin(deps.auth))
		.use(healthRoute)
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
		.use(tradingModeRoutes(deps.tradingModeDeps))
		.use(readinessRoutes(deps.readinessDeps))
		.use(
			sseRoutes({
				subscribe: deps.sseSubscribe,
				auth: deps.auth,
				strategyRepository: deps.strategyRepository,
			}),
		);
}

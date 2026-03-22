import cors from "@elysiajs/cors";
import { Elysia } from "elysia";
import { errorHandlerPlugin } from "./lib/errors.js";
import { healthRoute } from "./routes/health.js";

const PORT = Number(process.env.PORT) || 3000;

export const app = new Elysia().use(cors()).use(errorHandlerPlugin).use(healthRoute);

/**
 * Route plugins (strategies, events, candles, alerts, orders, backtest, auth, sse)
 * require DI deps and are mounted in the server bootstrap when deps are available.
 * See apps/api/src/server.ts (future) for full wiring.
 *
 * For now, the base app exposes health + error handling.
 * Route factories are exported from their modules for wiring:
 *   - strategyRoutes(deps)
 *   - eventRoutes(deps)
 *   - candleRoutes(deps)
 *   - alertRoutes(deps)
 *   - orderRoutes(deps)
 *   - backtestRoutes(deps)
 *   - authRoutes(deps)
 *   - sseRoutes(deps)
 *   - authPlugin(deps)
 */

app.listen(PORT);

console.info(`API server running on http://localhost:${PORT}`);

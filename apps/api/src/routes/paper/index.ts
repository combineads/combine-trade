import { Elysia } from "elysia";
import type { PaperOrdersDeps } from "./orders.js";
import { paperOrdersRoute } from "./orders.js";
import type { PaperPerformanceDeps } from "./performance.js";
import { paperPerformanceRoute } from "./performance.js";
import type { PaperResetDeps } from "./reset.js";
import { paperResetRoute } from "./reset.js";
import type { PaperStatusDeps } from "./status.js";
import { paperStatusRoute } from "./status.js";

// ---------------------------------------------------------------------------
// Aggregated dependency type for the paper API router
// ---------------------------------------------------------------------------

export type PaperApiDeps = PaperStatusDeps & PaperOrdersDeps & PaperPerformanceDeps & PaperResetDeps;

// ---------------------------------------------------------------------------
// Elysia plugin that groups all strategy-scoped paper routes
// ---------------------------------------------------------------------------

export function paperApiRoutes(deps: PaperApiDeps) {
	return new Elysia({ name: "paper-api" })
		.use(paperStatusRoute(deps))
		.use(paperOrdersRoute(deps))
		.use(paperPerformanceRoute(deps))
		.use(paperResetRoute(deps));
}

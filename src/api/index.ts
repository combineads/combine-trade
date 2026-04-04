/**
 * API module barrel export.
 *
 * Layer: L8 (api)
 */

export type { HealthDeps } from "@/api/routes/health";
export { createHealthRoutes } from "@/api/routes/health";
export type { PositionRow, PositionsDeps } from "@/api/routes/positions";
export { createPositionsRoutes } from "@/api/routes/positions";
export type { StatsDeps, StatsResult } from "@/api/routes/stats";
export { createStatsRoutes } from "@/api/routes/stats";
export type { SymbolStateRow, SymbolStatesDeps } from "@/api/routes/symbol-states";
export { createSymbolStatesRoutes } from "@/api/routes/symbol-states";
export type { TicketFilters, TicketRow, TicketsDeps } from "@/api/routes/tickets";
export { createTicketRoutes } from "@/api/routes/tickets";
export { createApiServer } from "@/api/server";
export type { ApiServerDeps, ApiServerHandle, RouteDeps } from "@/api/types";

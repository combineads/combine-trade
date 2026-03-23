import { Elysia, t } from "elysia";
import type { KillSwitchScope, KillSwitchState, KillSwitchTrigger } from "../../../../packages/core/risk/types.js";
import { ok, paginated } from "../lib/response.js";

export interface KillSwitchAuditEvent {
	id: string;
	scope: string;
	triggerType: string;
	triggerDetail: string;
	triggeredAt: Date;
	deactivatedAt: Date | null;
}

/**
 * Route dependency interface for kill-switch operations.
 * All methods require a userId parameter to enforce per-user isolation.
 * The route layer is responsible for extracting userId from the session (T-181).
 */
export interface KillSwitchRouteDeps {
	activate: (
		scope: KillSwitchScope,
		scopeTarget: string | null,
		trigger: KillSwitchTrigger,
		userId: string,
	) => Promise<KillSwitchState>;
	deactivate: (id: string, userId: string) => Promise<KillSwitchState>;
	getActiveStates: (userId: string) => Promise<KillSwitchState[]>;
	getAuditEvents: (
		page: number,
		pageSize: number,
		userId: string,
	) => Promise<{ items: KillSwitchAuditEvent[]; total: number }>;
}

export function killSwitchRoutes(deps: KillSwitchRouteDeps) {
	return new Elysia({ prefix: "/api/v1/risk/kill-switch" })
		.post(
			"/activate",
			async ({ body }) => {
				// TODO T-181: extract userId from session; placeholder until then
				const userId = "placeholder-user-id";
				const state = await deps.activate(
					body.scope,
					body.scopeTarget ?? null,
					body.trigger,
					userId,
				);
				return ok(state);
			},
			{
				body: t.Object({
					scope: t.Union([
						t.Literal("global"),
						t.Literal("exchange"),
						t.Literal("strategy"),
					]),
					scopeTarget: t.Optional(t.String()),
					trigger: t.Union([
						t.Literal("manual"),
						t.Literal("loss_limit"),
						t.Literal("api_error"),
						t.Literal("system"),
					]),
				}),
			},
		)
		.post(
			"/deactivate",
			async ({ body }) => {
				// TODO T-181: extract userId from session; placeholder until then
				const userId = "placeholder-user-id";
				const state = await deps.deactivate(body.id, userId);
				return ok(state);
			},
			{
				body: t.Object({
					id: t.String(),
				}),
			},
		)
		.get("/status", async () => {
			// TODO T-181: extract userId from session; placeholder until then
			const userId = "placeholder-user-id";
			const states = await deps.getActiveStates(userId);
			return ok(states);
		})
		.get(
			"/events",
			async ({ query }) => {
				// TODO T-181: extract userId from session; placeholder until then
				const userId = "placeholder-user-id";
				const page = query.page ?? 1;
				const pageSize = Math.min(query.pageSize ?? 20, 100);
				const result = await deps.getAuditEvents(page, pageSize, userId);
				return paginated(result.items, result.total, page, pageSize);
			},
			{
				query: t.Object({
					page: t.Optional(t.Numeric()),
					pageSize: t.Optional(t.Numeric()),
				}),
			},
		);
}

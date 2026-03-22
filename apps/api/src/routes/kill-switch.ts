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

export interface KillSwitchRouteDeps {
	activate: (
		scope: KillSwitchScope,
		scopeTarget: string | null,
		trigger: KillSwitchTrigger,
	) => Promise<KillSwitchState>;
	deactivate: (id: string) => Promise<KillSwitchState>;
	getActiveStates: () => Promise<KillSwitchState[]>;
	getAuditEvents: (
		page: number,
		pageSize: number,
	) => Promise<{ items: KillSwitchAuditEvent[]; total: number }>;
}

export function killSwitchRoutes(deps: KillSwitchRouteDeps) {
	return new Elysia({ prefix: "/api/v1/risk/kill-switch" })
		.post(
			"/activate",
			async ({ body }) => {
				const state = await deps.activate(
					body.scope,
					body.scopeTarget ?? null,
					body.trigger,
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
				const state = await deps.deactivate(body.id);
				return ok(state);
			},
			{
				body: t.Object({
					id: t.String(),
				}),
			},
		)
		.get("/status", async () => {
			const states = await deps.getActiveStates();
			return ok(states);
		})
		.get(
			"/events",
			async ({ query }) => {
				const page = query.page ?? 1;
				const pageSize = Math.min(query.pageSize ?? 20, 100);
				const result = await deps.getAuditEvents(page, pageSize);
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

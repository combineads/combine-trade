import { and, count, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../../../db/schema/index.js";
import type {
	KillSwitchScope,
	KillSwitchState,
	KillSwitchTrigger,
} from "../../../../packages/core/risk/types.js";
import type { KillSwitchAuditEvent, KillSwitchRouteDeps } from "../routes/kill-switch.js";

type Db = PostgresJsDatabase<typeof schema>;

function mapRowToState(row: typeof schema.killSwitchState.$inferSelect): KillSwitchState {
	return {
		id: row.id,
		scope: (row.strategyId ? "strategy" : "global") as KillSwitchScope,
		scopeTarget: row.strategyId ?? null,
		active: row.isActive,
		triggeredBy: (row.activatedBy ?? "manual") as KillSwitchTrigger,
		triggeredAt: row.activatedAt ?? row.createdAt,
		requiresAcknowledgment: row.activatedBy === "manual",
		acknowledgedAt: null,
	};
}

export function createKillSwitchDeps(db: Db): KillSwitchRouteDeps {
	return {
		activate: async (scope, scopeTarget, trigger, userId) => {
			const rows = await db
				.insert(schema.killSwitchState)
				.values({
					userId,
					strategyId: scopeTarget ?? undefined,
					isActive: true,
					activatedAt: new Date(),
					activatedBy: trigger,
					reason: `${trigger} trigger`,
				})
				.returning();
			const row = rows[0];
			if (!row) throw new Error("Failed to activate kill switch");

			await db.insert(schema.killSwitchEvents).values({
				userId,
				triggeredAt: row.activatedAt ?? new Date(),
				scope,
				scopeTarget: scopeTarget ?? undefined,
				triggerType: trigger,
				triggerDetail: `${trigger} trigger activated`,
				hadOpenPositions: false,
				positionsSnapshot: null,
			});

			return mapRowToState(row);
		},

		deactivate: async (id, userId) => {
			const now = new Date();
			const rows = await db
				.update(schema.killSwitchState)
				.set({ isActive: false, updatedAt: now })
				.where(and(eq(schema.killSwitchState.id, id), eq(schema.killSwitchState.userId, userId)))
				.returning();
			const row = rows[0];
			if (!row) throw new Error(`Kill switch state ${id} not found`);

			await db
				.update(schema.killSwitchEvents)
				.set({ deactivatedAt: now, deactivatedBy: "manual" })
				.where(and(eq(schema.killSwitchEvents.userId, userId)));

			return mapRowToState(row);
		},

		getActiveStates: async (userId) => {
			const rows = await db
				.select()
				.from(schema.killSwitchState)
				.where(
					and(eq(schema.killSwitchState.userId, userId), eq(schema.killSwitchState.isActive, true)),
				);
			return rows.map(mapRowToState);
		},

		getAuditEvents: async (page, pageSize, userId) => {
			const offset = (page - 1) * pageSize;

			const [rows, [countRow]] = await Promise.all([
				db
					.select()
					.from(schema.killSwitchEvents)
					.where(eq(schema.killSwitchEvents.userId, userId))
					.orderBy(desc(schema.killSwitchEvents.triggeredAt))
					.limit(pageSize)
					.offset(offset),
				db
					.select({ total: count() })
					.from(schema.killSwitchEvents)
					.where(eq(schema.killSwitchEvents.userId, userId)),
			]);

			const items: KillSwitchAuditEvent[] = rows.map((r) => ({
				id: r.id,
				scope: r.scope,
				triggerType: r.triggerType,
				triggerDetail: r.triggerDetail,
				triggeredAt: r.triggeredAt,
				deactivatedAt: r.deactivatedAt,
			}));

			return { items, total: countRow?.total ?? 0 };
		},
	};
}

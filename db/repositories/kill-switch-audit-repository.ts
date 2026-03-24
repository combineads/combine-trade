import type { KillSwitchAuditDeps, KillSwitchAuditEvent } from "@combine/core/risk";
import { desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { killSwitchEvents } from "../schema/kill-switch-events.js";

type Db = PostgresJsDatabase;

/**
 * DrizzleORM implementation of KillSwitchAuditDeps.
 * Persists kill switch audit events to the `kill_switch_audit_events` table.
 */
export class KillSwitchAuditRepository implements KillSwitchAuditDeps {
	constructor(private readonly db: Db) {}

	/** Insert a new kill switch audit event record. */
	async insertEvent(event: KillSwitchAuditEvent): Promise<void> {
		await this.db.insert(killSwitchEvents).values({
			id: event.id,
			killSwitchStateId: event.killSwitchStateId,
			triggerType: event.triggerType,
			triggerReason: event.triggerReason,
			scope: event.scope,
			scopeTarget: event.scopeTarget,
			positionsSnapshot: event.positionsSnapshot,
			activatedAt: event.activatedAt,
			deactivatedAt: event.deactivatedAt,
			deactivatedBy: event.deactivatedBy,
		});
	}

	/** Find an audit event by the kill switch state ID that triggered it. */
	async findByStateId(killSwitchStateId: string): Promise<KillSwitchAuditEvent | null> {
		const rows = await this.db
			.select()
			.from(killSwitchEvents)
			.where(eq(killSwitchEvents.killSwitchStateId, killSwitchStateId))
			.limit(1);

		const row = rows[0];
		return row ? mapRowToEvent(row) : null;
	}

	/** List the most recent audit events, ordered by activatedAt descending. */
	async listRecent(limit: number): Promise<KillSwitchAuditEvent[]> {
		const rows = await this.db
			.select()
			.from(killSwitchEvents)
			.orderBy(desc(killSwitchEvents.activatedAt))
			.limit(limit);

		return rows.map(mapRowToEvent);
	}
}

type KillSwitchEventRow = typeof killSwitchEvents.$inferSelect;

function mapRowToEvent(row: KillSwitchEventRow): KillSwitchAuditEvent {
	return {
		id: row.id,
		killSwitchStateId: row.killSwitchStateId,
		triggerType: row.triggerType as KillSwitchAuditEvent["triggerType"],
		triggerReason: row.triggerReason,
		scope: row.scope as KillSwitchAuditEvent["scope"],
		scopeTarget: row.scopeTarget ?? null,
		positionsSnapshot: (row.positionsSnapshot as unknown[]) ?? [],
		activatedAt: row.activatedAt,
		deactivatedAt: row.deactivatedAt ?? null,
		deactivatedBy: row.deactivatedBy ?? null,
	};
}

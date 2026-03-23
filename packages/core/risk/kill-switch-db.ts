import type { KillSwitchDeps } from "./kill-switch.js";
import type { KillSwitchState, KillSwitchScope, KillSwitchTrigger } from "./types.js";

export interface KillSwitchRow {
	id: string;
	strategyId: string | null;
	isActive: boolean;
	activatedAt: Date | null;
	activatedBy: string | null;
	reason: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface KillSwitchEventRow {
	scope: string;
	scopeTarget: string | null;
	triggerType: string;
	triggerDetail: string;
	triggeredAt: Date;
	deactivatedAt: Date | null;
	hadOpenPositions: boolean;
	positionsSnapshot: unknown;
	deactivatedBy: string | null;
}

/**
 * Database query dependencies for kill-switch operations.
 * All methods include a userId parameter to enforce row-level isolation.
 * Methods return empty arrays / no-ops for cross-user access rather than errors.
 */
export interface KillSwitchDbDeps {
	findActiveStates: (userId: string) => Promise<KillSwitchRow[]>;
	upsertState: (row: {
		id: string;
		strategyId: string | null;
		isActive: boolean;
		activatedAt: Date | null;
		activatedBy: string | null;
		reason: string | null;
		userId: string;
	}) => Promise<void>;
	insertAuditEvent: (event: KillSwitchEventRow & { userId: string }) => Promise<void>;
	updateAuditEventDeactivation: (stateId: string, deactivatedAt: Date) => Promise<void>;
}

function mapRowToState(row: KillSwitchRow): KillSwitchState {
	const scope: KillSwitchScope = row.strategyId ? "strategy" : "global";
	const scopeTarget = row.strategyId ?? null;

	return {
		id: row.id,
		scope,
		scopeTarget,
		active: row.isActive,
		triggeredBy: (row.activatedBy ?? "manual") as KillSwitchTrigger,
		triggeredAt: row.activatedAt ?? row.createdAt,
		requiresAcknowledgment: row.activatedBy === "manual",
		acknowledgedAt: null,
	};
}

/**
 * Kill-switch DB service that enforces userId isolation.
 * Callers must supply a userId so that state reads and writes are scoped per user.
 */
export class KillSwitchDbService {
	constructor(private readonly deps: KillSwitchDbDeps) {}

	async loadActiveStates(userId: string): Promise<KillSwitchState[]> {
		const rows = await this.deps.findActiveStates(userId);
		return rows.map(mapRowToState);
	}

	async saveState(state: KillSwitchState, userId: string): Promise<void> {
		await this.deps.upsertState({
			id: state.id,
			strategyId: state.scope === "strategy" ? state.scopeTarget : null,
			isActive: state.active,
			activatedAt: state.triggeredAt,
			activatedBy: state.triggeredBy,
			reason: `${state.triggeredBy} trigger`,
			userId,
		});

		if (state.active) {
			await this.deps.insertAuditEvent({
				scope: state.scope,
				scopeTarget: state.scopeTarget,
				triggerType: state.triggeredBy,
				triggerDetail: `${state.triggeredBy} trigger activated`,
				triggeredAt: state.triggeredAt,
				deactivatedAt: null,
				hadOpenPositions: false,
				positionsSnapshot: null,
				deactivatedBy: null,
				userId,
			});
		} else {
			await this.deps.updateAuditEventDeactivation(state.id, new Date());
		}
	}
}

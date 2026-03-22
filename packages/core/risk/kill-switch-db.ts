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

export interface KillSwitchDbDeps {
	findActiveStates: () => Promise<KillSwitchRow[]>;
	upsertState: (row: {
		id: string;
		strategyId: string | null;
		isActive: boolean;
		activatedAt: Date | null;
		activatedBy: string | null;
		reason: string | null;
	}) => Promise<void>;
	insertAuditEvent: (event: KillSwitchEventRow) => Promise<void>;
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

export class KillSwitchDbService implements KillSwitchDeps {
	constructor(private readonly deps: KillSwitchDbDeps) {}

	async loadActiveStates(): Promise<KillSwitchState[]> {
		const rows = await this.deps.findActiveStates();
		return rows.map(mapRowToState);
	}

	async saveState(state: KillSwitchState): Promise<void> {
		await this.deps.upsertState({
			id: state.id,
			strategyId: state.scope === "strategy" ? state.scopeTarget : null,
			isActive: state.active,
			activatedAt: state.triggeredAt,
			activatedBy: state.triggeredBy,
			reason: `${state.triggeredBy} trigger`,
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
			});
		} else {
			await this.deps.updateAuditEventDeactivation(state.id, new Date());
		}
	}
}

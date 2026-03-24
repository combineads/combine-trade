import type { KillSwitchScope, KillSwitchState, KillSwitchTrigger } from "./types.js";

/**
 * Domain representation of a kill switch audit event.
 * Mirrors the `kill_switch_events` table shape without any Drizzle imports.
 */
export interface KillSwitchAuditEvent {
	/** UUID for this audit record. */
	id: string;
	/** ID of the KillSwitchState that triggered this event. */
	killSwitchStateId: string;
	/** Mirrors KillSwitchTrigger — why the kill switch fired. */
	triggerType: KillSwitchTrigger;
	/** Human-readable description of why it fired. */
	triggerReason: string;
	/** Mirrors KillSwitchScope — the scope of the kill switch. */
	scope: KillSwitchScope;
	/** exchangeId or strategyId; null for global scope. */
	scopeTarget: string | null;
	/** Open position records at the time of activation. */
	positionsSnapshot: unknown[];
	/** When the kill switch was activated. Set by createAuditEvent; callers cannot override. */
	activatedAt: Date;
	/** When the kill switch was deactivated; null until deactivated. */
	deactivatedAt: Date | null;
	/** userId or "system" that deactivated; null until deactivated. */
	deactivatedBy: string | null;
}

/**
 * Persistence dependencies for kill switch audit operations.
 * Implement this interface with a Drizzle adapter in the db/workers layer.
 */
export interface KillSwitchAuditDeps {
	/** Persist a new audit event record. */
	insertEvent(event: KillSwitchAuditEvent): Promise<void>;
	/** Find an audit event by the kill switch state ID that triggered it. */
	findByStateId(killSwitchStateId: string): Promise<KillSwitchAuditEvent | null>;
	/** List the most recent audit events, ordered by activatedAt descending. */
	listRecent(limit: number): Promise<KillSwitchAuditEvent[]>;
}

/**
 * Pure factory that creates a new KillSwitchAuditEvent from a KillSwitchState.
 * Sets activatedAt to now; callers cannot override it.
 * The positionsSnapshot is shallow-copied — original array is not mutated.
 */
export function createAuditEvent(
	state: KillSwitchState,
	reason: string,
	positionsSnapshot: unknown[],
): KillSwitchAuditEvent {
	return {
		id: crypto.randomUUID(),
		killSwitchStateId: state.id,
		triggerType: state.triggeredBy,
		triggerReason: reason,
		scope: state.scope,
		scopeTarget: state.scopeTarget,
		positionsSnapshot: [...positionsSnapshot],
		activatedAt: new Date(),
		deactivatedAt: null,
		deactivatedBy: null,
	};
}

/**
 * Pure function that returns a new KillSwitchAuditEvent with deactivation fields set.
 * The original event is not mutated.
 */
export function recordDeactivation(
	event: KillSwitchAuditEvent,
	deactivatedBy: string,
): KillSwitchAuditEvent {
	return {
		...event,
		deactivatedAt: new Date(),
		deactivatedBy,
	};
}

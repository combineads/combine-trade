import type { KillSwitchScope, KillSwitchState, KillSwitchTrigger } from "./types.js";

export interface KillSwitchDeps {
	loadActiveStates(): Promise<KillSwitchState[]>;
	saveState(state: KillSwitchState): Promise<void>;
}

export class KillSwitchNotFoundError extends Error {
	constructor(id: string) {
		super(`Kill switch not found: ${id}`);
		this.name = "KillSwitchNotFoundError";
	}
}

/** Activate a new kill switch and persist it. */
export async function activate(
	scope: KillSwitchScope,
	scopeTarget: string | null,
	trigger: KillSwitchTrigger,
	deps: KillSwitchDeps,
): Promise<KillSwitchState> {
	const state: KillSwitchState = {
		id: crypto.randomUUID(),
		scope,
		scopeTarget,
		active: true,
		triggeredBy: trigger,
		triggeredAt: new Date(),
		requiresAcknowledgment: trigger === "manual",
		acknowledgedAt: null,
	};
	await deps.saveState(state);
	return state;
}

/** Deactivate a kill switch by id. Throws KillSwitchNotFoundError if not found. */
export async function deactivate(id: string, deps: KillSwitchDeps): Promise<KillSwitchState> {
	const states = await deps.loadActiveStates();
	const existing = states.find((s) => s.id === id);
	if (!existing) {
		throw new KillSwitchNotFoundError(id);
	}
	const updated: KillSwitchState = { ...existing, active: false };
	await deps.saveState(updated);
	return updated;
}

/** Check if a strategy/exchange combination is blocked by any active kill switch. */
export function isBlocked(
	strategyId: string,
	exchangeId: string,
	states: KillSwitchState[],
): boolean {
	return states.some((s) => {
		if (!s.active) return false;
		if (s.scope === "global") return true;
		if (s.scope === "exchange") return s.scopeTarget === exchangeId;
		if (s.scope === "strategy") return s.scopeTarget === strategyId;
		return false;
	});
}

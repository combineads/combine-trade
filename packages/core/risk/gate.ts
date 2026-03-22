import { isBlocked } from "./kill-switch.js";
import { type LossTrackerDeps, checkLimits } from "./loss-tracker.js";
import { PositionSizeError, sizePosition } from "./position-sizer.js";
import type { DailyLossConfig, KillSwitchState, PositionSizeConfig } from "./types.js";

export interface RiskGateDeps {
	getKillSwitchStates(): Promise<KillSwitchState[]>;
	getLossTrackerDeps(): LossTrackerDeps;
	getOpenExposureUsd(strategyId: string, exchangeId: string): Promise<string>;
	getBalance(exchangeId: string): Promise<string>;
}

export interface OrderValidationInput {
	strategyId: string;
	exchangeId: string;
	entryPrice: string;
	slPct: number;
	lossConfig: DailyLossConfig;
	sizeConfig: PositionSizeConfig;
}

export interface GateResult {
	allowed: boolean;
	rejections: string[];
}

/** Run all pre-order risk checks. All checks run even when earlier ones fail. */
export async function validateOrder(
	input: OrderValidationInput,
	deps: RiskGateDeps,
): Promise<GateResult> {
	const rejections: string[] = [];

	// 1. Kill switch check
	try {
		const states = await deps.getKillSwitchStates();
		if (isBlocked(input.strategyId, input.exchangeId, states)) {
			const activeScope = states.find(
				(s) =>
					s.active &&
					(s.scope === "global" ||
						(s.scope === "exchange" && s.scopeTarget === input.exchangeId) ||
						(s.scope === "strategy" && s.scopeTarget === input.strategyId)),
			);
			rejections.push(`kill switch active: ${activeScope?.scope ?? "unknown"}`);
		}
	} catch (err) {
		rejections.push(`kill switch check failed: ${(err as Error).message}`);
	}

	// 2. Loss limit check
	try {
		const balance = await deps.getBalance(input.exchangeId);
		const lossTrackerDeps = deps.getLossTrackerDeps();
		const limitResult = await checkLimits(balance, input.lossConfig, lossTrackerDeps);
		if (limitResult.breached && limitResult.reason) {
			rejections.push(limitResult.reason);
		}
	} catch (err) {
		rejections.push(`loss limit check failed: ${(err as Error).message}`);
	}

	// 3. Position size + 4. Leverage check (both via sizePosition)
	try {
		const balance = await deps.getBalance(input.exchangeId);
		const exposure = await deps.getOpenExposureUsd(input.strategyId, input.exchangeId);
		sizePosition(balance, input.entryPrice, input.slPct, exposure, input.sizeConfig);
	} catch (err) {
		if (err instanceof PositionSizeError) {
			rejections.push(`position size rejected: ${err.message}`);
		} else {
			rejections.push(`position size check failed: ${(err as Error).message}`);
		}
	}

	return { allowed: rejections.length === 0, rejections };
}

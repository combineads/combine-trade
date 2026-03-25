import { createChannel } from "./types.js";

/** Payload types for each pipeline channel */
export interface CandleClosedPayload {
	exchange: string;
	symbol: string;
	timeframe: string;
	openTime: string; // ISO timestamp
}

export interface StrategyEventCreatedPayload {
	strategyId: string;
	version: number;
	symbol: string;
	eventId: string;
}

export interface DecisionCompletedPayload {
	strategyId: string;
	symbol: string;
	direction: "LONG" | "SHORT" | "PASS";
	decisionId: string;
}

export interface LabelReadyPayload {
	strategyEventId: string;
	labelId: string;
}

export interface KillSwitchActivatedPayload {
	userId: string;
	reason: string;
	activatedAt: string; // ISO timestamp
}

export interface JournalReadyPayload {
	journalId: string;
}

export interface LossLimitBreachedPayload {
	userId: string;
	strategyId: string;
	/** ISO timestamp when the breach occurred */
	breachedAt: string;
}

export interface StrategyCodeChangedPayload {
	strategyId: string;
	userId: string;
	/** The new version number after the code change */
	newVersion: number;
}

/** Typed channel definitions for the pipeline event bus */
export const Channels = {
	candleClosed: createChannel<CandleClosedPayload>("candle_closed"),
	strategyEventCreated: createChannel<StrategyEventCreatedPayload>("strategy_event_created"),
	decisionCompleted: createChannel<DecisionCompletedPayload>("decision_completed"),
	labelReady: createChannel<LabelReadyPayload>("label_ready"),
	killSwitchActivated: createChannel<KillSwitchActivatedPayload>("kill_switch_activated"),
	journalReady: createChannel<JournalReadyPayload>("journal_ready"),
	lossLimitBreached: createChannel<LossLimitBreachedPayload>("loss_limit_breached"),
	strategyCodeChanged: createChannel<StrategyCodeChangedPayload>("strategy_code_changed"),
} as const;

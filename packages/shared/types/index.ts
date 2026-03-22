/** Supported exchanges */
export type Exchange = "binance" | "okx";

/** Supported trading symbols */
export type Symbol = string;

/** Supported timeframes */
export type Timeframe = "1m" | "3m" | "5m" | "15m" | "1h" | "4h" | "1d";

/** Trading direction */
export type Direction = "LONG" | "SHORT";

/** Decision output */
export type DecisionResult = "LONG" | "SHORT" | "PASS";

/** Trade result type */
export type ResultType = "WIN" | "LOSS" | "TIME_EXIT";

/** Strategy execution mode */
export type ExecutionMode = "analysis" | "alert" | "paper" | "live";

/** Delivery state for alerts */
export type DeliveryState = "pending" | "sent" | "failed";

/** Order status */
export type OrderStatus =
	| "planned"
	| "submitted"
	| "partially_filled"
	| "filled"
	| "rejected"
	| "canceled";

/** Confidence tier for decisions */
export type ConfidenceTier = "low" | "medium" | "high" | "very_high";

/** Decision reason */
export type DecisionReason =
	| "criteria_met"
	| "insufficient_samples"
	| "low_winrate"
	| "negative_expectancy";

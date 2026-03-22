export type {
	KillSwitchScope,
	KillSwitchTrigger,
	KillSwitchState,
	DailyLossConfig,
	PnlRecord,
	LimitCheckResult,
	PositionSizeConfig,
	PositionSizeResult,
} from "./types.js";
export {
	activate,
	deactivate,
	isBlocked,
	KillSwitchNotFoundError,
	type KillSwitchDeps,
} from "./kill-switch.js";
export {
	addLoss,
	getTodayLoss,
	getWeekLoss,
	getConsecutiveLosses,
	checkLimits,
	type LossTrackerDeps,
} from "./loss-tracker.js";
export {
	calculateQuantity,
	roundToStepSize,
	validateQuantity,
	checkExposure,
	checkLeverage,
	sizePosition,
	PositionSizeError,
} from "./position-sizer.js";
export {
	validateOrder,
	type RiskGateDeps,
	type OrderValidationInput,
	type GateResult,
} from "./gate.js";

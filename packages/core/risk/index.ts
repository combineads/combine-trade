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
export {
	PositionMonitor,
	type ExchangePosition,
	type ExchangePositionProvider,
	type TrackedPosition,
	type PositionSyncResult,
} from "./position-monitor.js";
export {
	recordOutcome,
	resetSuspension,
	isSuspended,
	ConsecutiveSlNotSuspendedError,
	type ConsecutiveSlState,
	type ConsecutiveSlDeps,
} from "./consecutive-sl-limiter.js";
export {
	createAuditEvent,
	recordDeactivation,
	type KillSwitchAuditEvent,
	type KillSwitchAuditDeps,
} from "./kill-switch-audit.js";
export {
	buildActivationMessage,
	buildDeactivationMessage,
	KillSwitchNotifier,
	type KillSwitchNotifierDeps,
} from "./kill-switch-notifier.js";
export {
	evaluateInfrastructureTriggers,
	InfrastructureTriggerMonitor,
	type InfrastructureHealthState,
	type InfrastructureTriggerResult,
} from "./infrastructure-trigger-monitor.js";
export {
	evaluateSandboxEvent,
	SandboxTriggerMonitor,
	type SandboxTriggerResult,
} from "./sandbox-trigger-monitor.js";
export {
	shouldResetDaily,
	shouldResetWeekly,
	LossLimitResetScheduler,
	type LossLimitResetDeps,
} from "./loss-limit-reset.js";
export {
	LotSizeValidator,
	LotSizeViolationError,
	type ExchangeLotRules,
} from "./lot-size-validator.js";

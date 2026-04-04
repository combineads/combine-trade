export {
  type CheckExitInput,
  calcCloseSize,
  calcMfeMae,
  checkExit,
  type ExitAction,
  type ExitActionType,
  type MfeMaeResult,
} from "./checker.ts";
export {
  type ExitResult,
  type ExitTicket,
  type MfeMaeUpdateParams,
  type MfeMaeUpdateResult,
  type ProcessExitParams,
  type ProcessTrailingParams,
  processExit,
  processTrailing,
  type TpUpdateParams,
  type TpUpdateResult,
  type TrailingUpdateResult,
  updateMfeMae,
  updateTpPrices,
} from "./manager.ts";
export {
  calcMaxProfit,
  calculateTrailingSl,
  DEFAULT_TRAILING_RATIO,
  shouldUpdateTrailingSl,
  type TrailingParams,
  type TrailingResult,
} from "./trailing.ts";

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
  calcMaxProfit,
  calculateTrailingSl,
  DEFAULT_TRAILING_RATIO,
  shouldUpdateTrailingSl,
  type TrailingParams,
  type TrailingResult,
} from "./trailing.ts";

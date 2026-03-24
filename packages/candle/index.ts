export type { Candle, CandleGap, CandleKey } from "./types.js";
export { TIMEFRAME_MS } from "./types.js";
export { isContinuous, validateContinuity } from "./validation.js";
export type { CandleRepository } from "./repository.js";
export {
	detectOutliers,
	type OutlierResult,
	type OutlierReason,
} from "./outlier-detector.js";

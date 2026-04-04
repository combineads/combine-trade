export type {
  EmergencyCloseParams,
  ExecuteEntryParams,
  ExecuteEntryResult,
  OrderRecord,
  RecordOrderParams,
  SpreadCheckConfig,
} from "./executor";
export { ExecutionModeError, emergencyClose, executeEntry, recordOrder } from "./executor";
export type { SlippageConfig, SlippageResult, SpreadCheckResult } from "./slippage";
export { checkSlippage, checkSpread, loadSlippageConfig } from "./slippage";

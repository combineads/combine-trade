export {
  comparePositions,
  type ExcludedPosition,
  isRecentTicket,
  type MatchedPair,
  type OrphanedTicket,
  type ReconciliationResult,
  type TicketSnapshot,
  type UnmatchedPosition,
} from "./comparator.ts";

export {
  type ExchangeError,
  type ReconciliationConfig,
  type ReconciliationDeps,
  type ReconciliationHandle,
  type ReconciliationRunResult,
  runOnce,
  startReconciliation,
} from "./worker.ts";

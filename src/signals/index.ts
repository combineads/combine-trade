export type { EvidenceResult } from "@/signals/evidence-gate";
export { checkEvidence, createSignal } from "@/signals/evidence-gate";
export type { SafetyResult } from "@/signals/safety-gate";
export { checkSafety, updateSignalSafety } from "@/signals/safety-gate";
export type { OpenWatchSessionParams, SRSymbolState, WatchingResult } from "@/signals/watching";
export {
  checkInvalidation,
  detectWatching,
  getActiveWatchSession,
  invalidateWatchSession,
  openWatchSession,
} from "@/signals/watching";

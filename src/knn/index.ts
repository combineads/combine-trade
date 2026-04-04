export type { KnnConfig, KnnSearchOptions } from "./engine";
export { loadKnnConfig, searchKnn } from "./engine";
export type { KnnNeighbor, TimeDecayConfig, WeightedNeighbor } from "./time-decay";
export {
  applyTimeDecay,
  calcTimeDecay,
  loadTimeDecayConfig,
} from "./time-decay";

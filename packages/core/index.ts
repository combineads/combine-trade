// Core domain package — re-exports from submodules as they are implemented.
export {
	chiSquared,
	computeDriftScore,
	computePValue,
	PatternDriftDetector,
} from "./drift/index.js";
export type { DriftConfig, DriftInput, DriftResult } from "./drift/index.js";

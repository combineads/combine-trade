export { FEATURE_CATEGORIES, FEATURE_NAMES, FEATURE_WEIGHTS, VECTOR_DIM } from "@/vectors/features";
export type { NormParams } from "@/vectors/normalizer";
export { computeNormParams, normalize } from "@/vectors/normalizer";
export type { InsertVectorParams } from "@/vectors/repository";
export {
  getVectorByCandle,
  getVectorsForNormalization,
  insertVector,
  updateVectorLabel,
} from "@/vectors/repository";
export { vectorize } from "@/vectors/vectorizer";

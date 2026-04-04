import { z } from "zod";

import type { CommonCodeGroup } from "@/core/types";

// ---------------------------------------------------------------------------
// EXCHANGE — exchange adapter configuration
// ---------------------------------------------------------------------------

export const ExchangeConfigSchema = z.object({
  name: z.string(),
  adapter_type: z.string(),
  supports_one_step_order: z.boolean(),
  supports_edit_order: z.boolean(),
  rate_limit_per_min: z.number(),
  /** Minimum order size as a Decimal-compatible string */
  min_order_size: z.string(),
  priority: z.number(),
});

export type ExchangeConfig = z.infer<typeof ExchangeConfigSchema>;

// ---------------------------------------------------------------------------
// TIMEFRAME — candle timeframe metadata
// ---------------------------------------------------------------------------

export const TimeframeConfigSchema = z.object({
  duration_seconds: z.number(),
  display_name: z.string(),
});

export type TimeframeConfig = z.infer<typeof TimeframeConfigSchema>;

// ---------------------------------------------------------------------------
// SYMBOL_CONFIG — per-symbol trading parameters
// Monetary/percentage values are strings for Decimal compatibility.
// ---------------------------------------------------------------------------

export const SymbolConfigSchema = z.object({
  /** Risk percentage as Decimal-compatible string, e.g. "0.03" */
  risk_pct: z.string(),
  max_leverage: z.number(),
});

export type SymbolConfig = z.infer<typeof SymbolConfigSchema>;

// ---------------------------------------------------------------------------
// KNN — KNN classifier parameters (simple numeric value, e.g. top_k: 50)
// ---------------------------------------------------------------------------

export const KnnConfigSchema = z.number();

export type KnnConfig = z.infer<typeof KnnConfigSchema>;

// ---------------------------------------------------------------------------
// POSITION — position sizing parameters (simple numeric value)
// ---------------------------------------------------------------------------

export const PositionConfigSchema = z.number();

export type PositionConfig = z.infer<typeof PositionConfigSchema>;

// ---------------------------------------------------------------------------
// LOSS_LIMIT — loss limit parameters
// Can be a percentage string (e.g. "0.10") or an integer count (e.g. 3).
// ---------------------------------------------------------------------------

export const LossLimitConfigSchema = z.union([z.string(), z.number()]);

export type LossLimitConfig = z.infer<typeof LossLimitConfigSchema>;

// ---------------------------------------------------------------------------
// SLIPPAGE — slippage tolerance as a percentage string (e.g. "0.05")
// ---------------------------------------------------------------------------

export const SlippageConfigSchema = z.string();

export type SlippageConfig = z.infer<typeof SlippageConfigSchema>;

// ---------------------------------------------------------------------------
// FEATURE_WEIGHT — KNN feature weighting (numeric, e.g. 2.0)
// ---------------------------------------------------------------------------

export const FeatureWeightConfigSchema = z.number();

export type FeatureWeightConfig = z.infer<typeof FeatureWeightConfigSchema>;

// ---------------------------------------------------------------------------
// TIME_DECAY — temporal decay factor (numeric, e.g. 1.0 or 0.8)
// ---------------------------------------------------------------------------

export const TimeDecayConfigSchema = z.number();

export type TimeDecayConfig = z.infer<typeof TimeDecayConfigSchema>;

// ---------------------------------------------------------------------------
// WFO — walk-forward optimization window count (numeric, e.g. 6)
// ---------------------------------------------------------------------------

export const WfoConfigSchema = z.number();

export type WfoConfig = z.infer<typeof WfoConfigSchema>;

// ---------------------------------------------------------------------------
// ANCHOR — structural anchor parameters (varies by anchor type)
// All fields are optional because different anchors use different subsets:
//   bb20/bb4     → length, stddev, source
//   ma_periods   → periods (array)
//   normalization → method
//   vector_dim   → dim
// ---------------------------------------------------------------------------

export const AnchorConfigSchema = z
  .object({
    length: z.number(),
    stddev: z.number(),
    source: z.string(),
    periods: z.array(z.number()),
    method: z.string(),
    dim: z.number(),
  })
  .partial();

export type AnchorConfig = z.infer<typeof AnchorConfigSchema>;

// ---------------------------------------------------------------------------
// NOTIFICATION — webhook notification settings
// ---------------------------------------------------------------------------

export const NotificationConfigSchema = z.object({
  webhook_url: z.string(),
  channel: z.string().optional(),
  enabled: z.boolean(),
});

export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

// ---------------------------------------------------------------------------
// TRANSFER — auto-transfer configuration
// Heterogeneous values vary by code, so per-code schemas are used for
// validation. The group-level schema accepts the full union; validateConfigValue
// resolves the correct per-code schema when available.
// ---------------------------------------------------------------------------

export const TransferConfigSchema = z.union([z.boolean(), z.string(), z.number()]);

export type TransferConfig = z.infer<typeof TransferConfigSchema>;

/** Per-code schemas for TRANSFER group (stricter than group-level union) */
export const TRANSFER_CODE_SCHEMAS: Record<string, z.ZodType> = {
  transfer_enabled: z.boolean(),
  transfer_schedule: z.string(),
  transfer_time_utc: z.string(),
  transfer_pct: z.number(),
  min_transfer_usdt: z.string(),
  reserve_multiplier: z.number(),
};

// ---------------------------------------------------------------------------
// Schema registry — maps every CommonCodeGroup to its ZodSchema
// ---------------------------------------------------------------------------

export const CONFIG_SCHEMAS: Record<CommonCodeGroup, z.ZodType> = {
  EXCHANGE: ExchangeConfigSchema,
  TIMEFRAME: TimeframeConfigSchema,
  SYMBOL_CONFIG: SymbolConfigSchema,
  KNN: KnnConfigSchema,
  POSITION: PositionConfigSchema,
  LOSS_LIMIT: LossLimitConfigSchema,
  SLIPPAGE: SlippageConfigSchema,
  FEATURE_WEIGHT: FeatureWeightConfigSchema,
  TIME_DECAY: TimeDecayConfigSchema,
  WFO: WfoConfigSchema,
  ANCHOR: AnchorConfigSchema,
  NOTIFICATION: NotificationConfigSchema,
  TRANSFER: TransferConfigSchema,
};

// ---------------------------------------------------------------------------
// ANCHOR_GROUPS — groups whose values are structurally immutable anchors.
// These correspond to structural strategy parameters and must not be tuned
// at runtime or by walk-forward optimization.
// ---------------------------------------------------------------------------

export const ANCHOR_GROUPS: readonly string[] = ["ANCHOR"] as const;

// ---------------------------------------------------------------------------
// validateConfigValue — runtime validation helper
// Returns { success: true, data } or { success: false, error }
// ---------------------------------------------------------------------------

export function validateConfigValue(
  group: string,
  code: string,
  value: unknown,
): { success: true; data: unknown } | { success: false; error: z.ZodError } {
  const schema = CONFIG_SCHEMAS[group as CommonCodeGroup];
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: "custom",
          message: `Unknown config group: ${group}`,
          path: [],
        },
      ]),
    };
  }

  // For groups that provide per-code schemas, use the more specific schema
  // when the code is known, to enforce strict type constraints per entry.
  const codeSchemas: Partial<Record<string, Record<string, z.ZodType>>> = {
    TRANSFER: TRANSFER_CODE_SCHEMAS,
  };
  const perCodeSchema = codeSchemas[group]?.[code];
  const activeSchema = perCodeSchema ?? schema;

  const result = activeSchema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

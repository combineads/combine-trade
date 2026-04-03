import { validateConfigValue } from "@/config/schema";
import {
  BB4_CONFIG,
  BB20_CONFIG,
  MA_PERIODS,
  NORMALIZATION_METHOD,
  VECTOR_DIM,
} from "@/core/constants";
import { createLogger } from "@/core/logger";
import { closePool, getDb, initDb } from "@/db/pool";
import { commonCodeTable } from "@/db/schema";

const log = createLogger("seed");

// ---------------------------------------------------------------------------
// Seed entry type
// ---------------------------------------------------------------------------

export type SeedEntry = {
  group_code: string;
  code: string;
  value: unknown;
  description: string;
  sort_order: number;
};

// ---------------------------------------------------------------------------
// SEED_DATA — all 12 config groups
// ---------------------------------------------------------------------------

export const SEED_DATA: SeedEntry[] = [
  // ── EXCHANGE ────────────────────────────────────────────────────────────
  {
    group_code: "EXCHANGE",
    code: "binance",
    value: {
      name: "Binance Futures",
      adapter_type: "ccxt",
      supports_one_step_order: true,
      supports_edit_order: true,
      rate_limit_per_min: 1200,
      min_order_size: "5",
      priority: 1,
    },
    description: "Binance USDT-M Futures exchange adapter",
    sort_order: 0,
  },
  {
    group_code: "EXCHANGE",
    code: "okx",
    value: {
      name: "OKX Swap",
      adapter_type: "ccxt",
      supports_one_step_order: true,
      supports_edit_order: true,
      rate_limit_per_min: 1800,
      min_order_size: "5",
      priority: 2,
    },
    description: "OKX perpetual swap exchange adapter",
    sort_order: 1,
  },
  {
    group_code: "EXCHANGE",
    code: "bitget",
    value: {
      name: "Bitget Futures",
      adapter_type: "ccxt",
      supports_one_step_order: true,
      supports_edit_order: false,
      rate_limit_per_min: 1200,
      min_order_size: "5",
      priority: 3,
    },
    description: "Bitget USDT-M futures exchange adapter",
    sort_order: 2,
  },
  {
    group_code: "EXCHANGE",
    code: "mexc",
    value: {
      name: "MEXC Futures",
      adapter_type: "ccxt",
      supports_one_step_order: false,
      supports_edit_order: false,
      rate_limit_per_min: 1200,
      min_order_size: "5",
      priority: 4,
    },
    description: "MEXC futures exchange adapter",
    sort_order: 3,
  },

  // ── TIMEFRAME ───────────────────────────────────────────────────────────
  {
    group_code: "TIMEFRAME",
    code: "1D",
    value: { duration_seconds: 86400, display_name: "1일" },
    description: "Daily candle timeframe",
    sort_order: 0,
  },
  {
    group_code: "TIMEFRAME",
    code: "1H",
    value: { duration_seconds: 3600, display_name: "1시간" },
    description: "Hourly candle timeframe",
    sort_order: 1,
  },
  {
    group_code: "TIMEFRAME",
    code: "5M",
    value: { duration_seconds: 300, display_name: "5분" },
    description: "5-minute candle timeframe",
    sort_order: 2,
  },
  {
    group_code: "TIMEFRAME",
    code: "1M",
    value: { duration_seconds: 60, display_name: "1분" },
    description: "1-minute candle timeframe",
    sort_order: 3,
  },

  // ── SYMBOL_CONFIG ────────────────────────────────────────────────────────
  {
    group_code: "SYMBOL_CONFIG",
    code: "BTCUSDT",
    value: { risk_pct: "0.03", max_leverage: 38 },
    description: "BTC/USDT perpetual trading parameters",
    sort_order: 0,
  },
  {
    group_code: "SYMBOL_CONFIG",
    code: "XAUTUSDT",
    value: { risk_pct: "0.03", max_leverage: 38 },
    description: "XAU/USDT perpetual trading parameters",
    sort_order: 1,
  },

  // ── KNN ──────────────────────────────────────────────────────────────────
  {
    group_code: "KNN",
    code: "top_k",
    value: 50,
    description: "Number of nearest neighbours to retrieve",
    sort_order: 0,
  },
  {
    group_code: "KNN",
    code: "min_samples",
    value: 30,
    description: "Minimum number of historical samples required before prediction",
    sort_order: 1,
  },

  // ── POSITION ─────────────────────────────────────────────────────────────
  {
    group_code: "POSITION",
    code: "max_pyramid_count",
    value: 2,
    description: "Maximum number of pyramid (scale-in) additions per position",
    sort_order: 0,
  },
  {
    group_code: "POSITION",
    code: "default_leverage",
    value: 20,
    description: "Default leverage applied when opening a new position",
    sort_order: 1,
  },

  // ── LOSS_LIMIT ───────────────────────────────────────────────────────────
  {
    group_code: "LOSS_LIMIT",
    code: "max_daily_loss_pct",
    value: "0.10",
    description: "Maximum allowable daily loss as a fraction of account equity",
    sort_order: 0,
  },
  {
    group_code: "LOSS_LIMIT",
    code: "max_session_losses",
    value: 3,
    description: "Maximum consecutive losses before halting for the session",
    sort_order: 1,
  },
  {
    group_code: "LOSS_LIMIT",
    code: "max_1h_5m_losses",
    value: 2,
    description: "Maximum losses on the 5-minute timeframe within one hour",
    sort_order: 2,
  },
  {
    group_code: "LOSS_LIMIT",
    code: "max_1h_1m_losses",
    value: 1,
    description: "Maximum losses on the 1-minute timeframe within one hour",
    sort_order: 3,
  },

  // ── SLIPPAGE ─────────────────────────────────────────────────────────────
  {
    group_code: "SLIPPAGE",
    code: "max_spread_pct",
    value: "0.05",
    description: "Maximum acceptable bid-ask spread as a fraction of mid price",
    sort_order: 0,
  },
  {
    group_code: "SLIPPAGE",
    code: "max_slippage_pct",
    value: "0.10",
    description: "Maximum acceptable fill slippage as a fraction of entry price",
    sort_order: 1,
  },

  // ── FEATURE_WEIGHT ───────────────────────────────────────────────────────
  {
    group_code: "FEATURE_WEIGHT",
    code: "bb4_position",
    value: 2.0,
    description: "Feature weight for BB4 band position in KNN distance calculation",
    sort_order: 0,
  },
  {
    group_code: "FEATURE_WEIGHT",
    code: "wick_ratio",
    value: 1.5,
    description: "Feature weight for candle wick ratio in KNN distance calculation",
    sort_order: 1,
  },

  // ── TIME_DECAY ───────────────────────────────────────────────────────────
  {
    group_code: "TIME_DECAY",
    code: "1_month",
    value: 1.0,
    description: "Decay factor for historical samples less than 1 month old",
    sort_order: 0,
  },
  {
    group_code: "TIME_DECAY",
    code: "3_months",
    value: 0.8,
    description: "Decay factor for historical samples 1–3 months old",
    sort_order: 1,
  },
  {
    group_code: "TIME_DECAY",
    code: "6_months",
    value: 0.6,
    description: "Decay factor for historical samples 3–6 months old",
    sort_order: 2,
  },
  {
    group_code: "TIME_DECAY",
    code: "12_months",
    value: 0.3,
    description: "Decay factor for historical samples 6–12 months old",
    sort_order: 3,
  },

  // ── WFO ──────────────────────────────────────────────────────────────────
  {
    group_code: "WFO",
    code: "in_sample_months",
    value: 6,
    description: "In-sample window length in months for walk-forward optimization",
    sort_order: 0,
  },
  {
    group_code: "WFO",
    code: "out_sample_months",
    value: 2,
    description: "Out-of-sample evaluation window length in months",
    sort_order: 1,
  },
  {
    group_code: "WFO",
    code: "roll_months",
    value: 1,
    description: "Roll step size in months between WFO windows",
    sort_order: 2,
  },

  // ── ANCHOR ───────────────────────────────────────────────────────────────
  {
    group_code: "ANCHOR",
    code: "bb20",
    value: { length: BB20_CONFIG.length, stddev: BB20_CONFIG.stddev, source: BB20_CONFIG.source },
    description: "BB20 structural anchor — outer Bollinger Band (20-period, 2σ)",
    sort_order: 0,
  },
  {
    group_code: "ANCHOR",
    code: "bb4",
    value: { length: BB4_CONFIG.length, stddev: BB4_CONFIG.stddev, source: BB4_CONFIG.source },
    description: "BB4 structural anchor — inner Bollinger Band (4-period, 4σ)",
    sort_order: 1,
  },
  {
    group_code: "ANCHOR",
    code: "ma_periods",
    value: { periods: [...MA_PERIODS] },
    description: "Moving average periods used for trend bias calculation",
    sort_order: 2,
  },
  {
    group_code: "ANCHOR",
    code: "normalization",
    value: { method: NORMALIZATION_METHOD },
    description: "Feature normalization method applied before KNN distance calculation",
    sort_order: 3,
  },
  {
    group_code: "ANCHOR",
    code: "vector_dim",
    value: { dim: VECTOR_DIM },
    description: "Dimensionality of the KNN feature vector stored in pgvector",
    sort_order: 4,
  },

  // ── NOTIFICATION ─────────────────────────────────────────────────────────
  {
    group_code: "NOTIFICATION",
    code: "slack_webhook",
    value: { webhook_url: "", channel: "#trading-alerts", enabled: false },
    description: "Slack webhook notification settings for trade and system alerts",
    sort_order: 0,
  },
];

// ---------------------------------------------------------------------------
// seed() — validate all entries then upsert with ON CONFLICT DO NOTHING
// ---------------------------------------------------------------------------

export async function seed(): Promise<{ inserted: number; skipped: number }> {
  // 1. Validate every entry before touching the DB (fail-fast)
  for (const entry of SEED_DATA) {
    const result = validateConfigValue(entry.group_code, entry.code, entry.value);
    if (!result.success) {
      throw new Error(
        `Seed validation failed for ${entry.group_code}.${entry.code}: ${result.error.message}`,
      );
    }
  }

  const db = getDb();

  // 2. Batch insert with ON CONFLICT (group_code, code) DO NOTHING
  const insertResult = await db
    .insert(commonCodeTable)
    .values(
      SEED_DATA.map((entry) => ({
        group_code: entry.group_code,
        code: entry.code,
        value: entry.value,
        description: entry.description,
        sort_order: entry.sort_order,
        is_active: true,
      })),
    )
    .onConflictDoNothing();

  // The postgres.js driver returns a RowList with a `count` property reflecting
  // the number of rows actually inserted (conflict rows are silently skipped).
  const inserted = (insertResult as unknown as { count: number }).count ?? 0;
  const skipped = SEED_DATA.length - inserted;

  log.info("seed complete", { details: { inserted, skipped, total: SEED_DATA.length } });

  return { inserted, skipped };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  await initDb();
  const result = await seed();
  log.info("seed-complete", { details: result });
  await closePool();
}

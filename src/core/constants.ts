// ---------------------------------------------------------------------------
// Structural anchor constants — immutable parameters of the Double-BB strategy.
// These values are code-fixed and must never be tuned by WFO or changed at runtime.
// ---------------------------------------------------------------------------

// Bollinger Band anchors
export const BB20_CONFIG = Object.freeze({ length: 20, stddev: 2, source: "close" } as const);
export const BB4_CONFIG = Object.freeze({ length: 4, stddev: 4, source: "close" } as const);

// Moving Average periods
export const MA_PERIODS = Object.freeze([20, 60, 120] as const);
export const MA20_PERIOD = 20 as const;
export const MA60_PERIOD = 60 as const;
export const MA120_PERIOD = 120 as const;

// Vector dimension (202-dimensional feature vector)
export const VECTOR_DIM = 202 as const;

// Normalization method — structural, not tunable
export const NORMALIZATION_METHOD = "MEDIAN_IQR" as const;

// Timeframe constants
export const TIMEFRAMES = Object.freeze(["1D", "1H", "5M", "1M"] as const);
export const ENTRY_TIMEFRAMES = Object.freeze(["5M", "1M"] as const);

// System limits
export const MAX_LEVERAGE = 38 as const;
export const MAX_SYMBOLS = 2 as const;
export const MAX_EXCHANGES = 4 as const;
export const MAX_PYRAMID_COUNT = 2 as const;
export const RECONCILIATION_INTERVAL_MS = 60_000 as const;

// Supported exchanges
export const SUPPORTED_EXCHANGES = Object.freeze(["binance", "okx", "bitget", "mexc"] as const);

// Supported symbols
export const SUPPORTED_SYMBOLS = Object.freeze(["BTCUSDT", "XAUTUSDT"] as const);

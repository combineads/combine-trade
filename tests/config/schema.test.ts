import { describe, expect, it } from "bun:test";

import {
  ANCHOR_GROUPS,
  CONFIG_SCHEMAS,
  validateConfigValue,
} from "../../src/config/schema";

// ---------------------------------------------------------------------------
// EXCHANGE
// ---------------------------------------------------------------------------

describe("config/schema — EXCHANGE", () => {
  const validExchange = {
    name: "Binance",
    adapter_type: "ccxt",
    supports_one_step_order: true,
    supports_edit_order: false,
    rate_limit_per_min: 1200,
    min_order_size: "0.001",
    priority: 1,
  };

  it("validates a correct exchange config", () => {
    const result = validateConfigValue("EXCHANGE", "binance", validExchange);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject(validExchange);
    }
  });

  it("rejects a config with missing required fields", () => {
    const result = validateConfigValue("EXCHANGE", "binance", {
      name: "Binance",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  it("rejects a config with wrong field types", () => {
    const result = validateConfigValue("EXCHANGE", "binance", {
      ...validExchange,
      rate_limit_per_min: "1200", // should be number
    });
    expect(result.success).toBe(false);
  });

  it("rejects a config where min_order_size is a number instead of string", () => {
    const result = validateConfigValue("EXCHANGE", "binance", {
      ...validExchange,
      min_order_size: 0.001, // should be string for Decimal compatibility
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SYMBOL_CONFIG
// ---------------------------------------------------------------------------

describe("config/schema — SYMBOL_CONFIG", () => {
  it("validates { risk_pct: '0.03', max_leverage: 38 }", () => {
    const result = validateConfigValue("SYMBOL_CONFIG", "BTCUSDT", {
      risk_pct: "0.03",
      max_leverage: 38,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when risk_pct is a number", () => {
    const result = validateConfigValue("SYMBOL_CONFIG", "BTCUSDT", {
      risk_pct: 0.03,
      max_leverage: 38,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when max_leverage is missing", () => {
    const result = validateConfigValue("SYMBOL_CONFIG", "BTCUSDT", {
      risk_pct: "0.03",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// KNN — simple numeric value
// ---------------------------------------------------------------------------

describe("config/schema — KNN", () => {
  it("validates numeric value 50", () => {
    const result = validateConfigValue("KNN", "top_k", 50);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(50);
    }
  });

  it("rejects string value", () => {
    const result = validateConfigValue("KNN", "top_k", "50");
    expect(result.success).toBe(false);
  });

  it("rejects object value", () => {
    const result = validateConfigValue("KNN", "top_k", { value: 50 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POSITION — simple numeric value
// ---------------------------------------------------------------------------

describe("config/schema — POSITION", () => {
  it("validates numeric value", () => {
    const result = validateConfigValue("POSITION", "max_positions", 2);
    expect(result.success).toBe(true);
  });

  it("rejects string value", () => {
    const result = validateConfigValue("POSITION", "max_positions", "2");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LOSS_LIMIT — string or number union
// ---------------------------------------------------------------------------

describe("config/schema — LOSS_LIMIT", () => {
  it("validates string percentage '0.10'", () => {
    const result = validateConfigValue("LOSS_LIMIT", "daily_loss_pct", "0.10");
    expect(result.success).toBe(true);
  });

  it("validates integer count 3", () => {
    const result = validateConfigValue("LOSS_LIMIT", "max_sl_count", 3);
    expect(result.success).toBe(true);
  });

  it("rejects object value", () => {
    const result = validateConfigValue("LOSS_LIMIT", "daily_loss_pct", { value: "0.10" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SLIPPAGE — percentage string
// ---------------------------------------------------------------------------

describe("config/schema — SLIPPAGE", () => {
  it("validates percentage string '0.05'", () => {
    const result = validateConfigValue("SLIPPAGE", "max_slippage", "0.05");
    expect(result.success).toBe(true);
  });

  it("rejects numeric value", () => {
    const result = validateConfigValue("SLIPPAGE", "max_slippage", 0.05);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FEATURE_WEIGHT — numeric weight
// ---------------------------------------------------------------------------

describe("config/schema — FEATURE_WEIGHT", () => {
  it("validates numeric weight 2.0", () => {
    const result = validateConfigValue("FEATURE_WEIGHT", "bb_squeeze", 2.0);
    expect(result.success).toBe(true);
  });

  it("rejects string value", () => {
    const result = validateConfigValue("FEATURE_WEIGHT", "bb_squeeze", "2.0");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TIME_DECAY — decay factor
// ---------------------------------------------------------------------------

describe("config/schema — TIME_DECAY", () => {
  it("validates decay factor 1.0", () => {
    const result = validateConfigValue("TIME_DECAY", "default", 1.0);
    expect(result.success).toBe(true);
  });

  it("validates decay factor 0.8", () => {
    const result = validateConfigValue("TIME_DECAY", "recent_bias", 0.8);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WFO — walk-forward optimization window count
// ---------------------------------------------------------------------------

describe("config/schema — WFO", () => {
  it("validates numeric value 6", () => {
    const result = validateConfigValue("WFO", "window_count", 6);
    expect(result.success).toBe(true);
  });

  it("rejects string value", () => {
    const result = validateConfigValue("WFO", "window_count", "6");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ANCHOR — structural anchor parameters
// ---------------------------------------------------------------------------

describe("config/schema — ANCHOR", () => {
  it("validates bb20 anchor { length: 20, stddev: 2, source: 'close' }", () => {
    const result = validateConfigValue("ANCHOR", "bb20", {
      length: 20,
      stddev: 2,
      source: "close",
    });
    expect(result.success).toBe(true);
  });

  it("validates ma_periods anchor { periods: [20, 60, 120] }", () => {
    const result = validateConfigValue("ANCHOR", "ma_periods", {
      periods: [20, 60, 120],
    });
    expect(result.success).toBe(true);
  });

  it("validates normalization anchor { method: 'MEDIAN_IQR' }", () => {
    const result = validateConfigValue("ANCHOR", "normalization", {
      method: "MEDIAN_IQR",
    });
    expect(result.success).toBe(true);
  });

  it("validates vector_dim anchor { dim: 202 }", () => {
    const result = validateConfigValue("ANCHOR", "vector_dim", { dim: 202 });
    expect(result.success).toBe(true);
  });

  it("validates empty object (all fields optional)", () => {
    const result = validateConfigValue("ANCHOR", "empty", {});
    expect(result.success).toBe(true);
  });

  it("rejects anchor with non-string source field", () => {
    const result = validateConfigValue("ANCHOR", "bb20", {
      length: 20,
      stddev: 2,
      source: 42,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NOTIFICATION — webhook notification settings
// ---------------------------------------------------------------------------

describe("config/schema — NOTIFICATION", () => {
  it("validates full notification config with channel", () => {
    const result = validateConfigValue("NOTIFICATION", "slack", {
      webhook_url: "https://hooks.slack.com/services/xxx",
      channel: "#alerts",
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("validates notification config without optional channel", () => {
    const result = validateConfigValue("NOTIFICATION", "slack", {
      webhook_url: "https://hooks.slack.com/services/xxx",
      enabled: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when enabled is missing", () => {
    const result = validateConfigValue("NOTIFICATION", "slack", {
      webhook_url: "https://hooks.slack.com/services/xxx",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when webhook_url is missing", () => {
    const result = validateConfigValue("NOTIFICATION", "slack", {
      enabled: true,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ANCHOR_GROUPS immutability marker
// ---------------------------------------------------------------------------

describe("config/schema — ANCHOR_GROUPS", () => {
  it("includes 'ANCHOR'", () => {
    expect(ANCHOR_GROUPS).toContain("ANCHOR");
  });

  it("is a readonly array", () => {
    expect(Array.isArray(ANCHOR_GROUPS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CONFIG_SCHEMAS registry completeness
// ---------------------------------------------------------------------------

describe("config/schema — CONFIG_SCHEMAS registry", () => {
  const expectedGroups = [
    "EXCHANGE",
    "TIMEFRAME",
    "SYMBOL_CONFIG",
    "KNN",
    "POSITION",
    "LOSS_LIMIT",
    "SLIPPAGE",
    "FEATURE_WEIGHT",
    "TIME_DECAY",
    "WFO",
    "ANCHOR",
    "NOTIFICATION",
  ] as const;

  it("has entries for all 12 groups", () => {
    expect(Object.keys(CONFIG_SCHEMAS)).toHaveLength(12);
  });

  for (const group of expectedGroups) {
    it(`has schema for group '${group}'`, () => {
      expect(CONFIG_SCHEMAS[group]).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// Unknown group error handling
// ---------------------------------------------------------------------------

describe("config/schema — validateConfigValue unknown group", () => {
  it("returns failure for unknown group", () => {
    const result = validateConfigValue("UNKNOWN_GROUP", "code", 42);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// TIMEFRAME schema
// ---------------------------------------------------------------------------

describe("config/schema — TIMEFRAME", () => {
  it("validates a correct timeframe config", () => {
    const result = validateConfigValue("TIMEFRAME", "1H", {
      duration_seconds: 3600,
      display_name: "1 Hour",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when duration_seconds is a string", () => {
    const result = validateConfigValue("TIMEFRAME", "1H", {
      duration_seconds: "3600",
      display_name: "1 Hour",
    });
    expect(result.success).toBe(false);
  });
});

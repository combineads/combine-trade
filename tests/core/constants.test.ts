import { describe, expect, it } from "bun:test";
import {
  BB20_CONFIG,
  BB4_CONFIG,
  ENTRY_TIMEFRAMES,
  MA20_PERIOD,
  MA60_PERIOD,
  MA120_PERIOD,
  MA_PERIODS,
  MAX_EXCHANGES,
  MAX_LEVERAGE,
  MAX_PYRAMID_COUNT,
  MAX_SYMBOLS,
  NORMALIZATION_METHOD,
  RECONCILIATION_INTERVAL_MS,
  SUPPORTED_EXCHANGES,
  SUPPORTED_SYMBOLS,
  TIMEFRAMES,
  VECTOR_DIM,
} from "@/core/constants";

// ---------------------------------------------------------------------------
// Value correctness tests
// ---------------------------------------------------------------------------

describe("core/constants — Bollinger Band anchors", () => {
  it("BB20_CONFIG has correct length and stddev", () => {
    expect(BB20_CONFIG.length).toBe(20);
    expect(BB20_CONFIG.stddev).toBe(2);
    expect(BB20_CONFIG.source).toBe("close");
  });

  it("BB4_CONFIG has correct length and stddev", () => {
    expect(BB4_CONFIG.length).toBe(4);
    expect(BB4_CONFIG.stddev).toBe(4);
    expect(BB4_CONFIG.source).toBe("close");
  });
});

describe("core/constants — Moving Average periods", () => {
  it("MA_PERIODS contains exactly [20, 60, 120] in order", () => {
    expect(MA_PERIODS).toHaveLength(3);
    expect(MA_PERIODS[0]).toBe(20);
    expect(MA_PERIODS[1]).toBe(60);
    expect(MA_PERIODS[2]).toBe(120);
  });

  it("MA20_PERIOD equals 20", () => {
    expect(MA20_PERIOD).toBe(20);
  });

  it("MA60_PERIOD equals 60", () => {
    expect(MA60_PERIOD).toBe(60);
  });

  it("MA120_PERIOD equals 120", () => {
    expect(MA120_PERIOD).toBe(120);
  });

  it("individual MA period constants match MA_PERIODS array", () => {
    expect(MA_PERIODS[0]).toBe(MA20_PERIOD);
    expect(MA_PERIODS[1]).toBe(MA60_PERIOD);
    expect(MA_PERIODS[2]).toBe(MA120_PERIOD);
  });
});

describe("core/constants — Vector dimension", () => {
  it("VECTOR_DIM equals 202", () => {
    expect(VECTOR_DIM).toBe(202);
  });
});

describe("core/constants — Normalization method", () => {
  it("NORMALIZATION_METHOD is MEDIAN_IQR", () => {
    expect(NORMALIZATION_METHOD).toBe("MEDIAN_IQR");
  });
});

describe("core/constants — Timeframes", () => {
  it("TIMEFRAMES contains exactly [1D, 1H, 5M, 1M] in order", () => {
    expect(TIMEFRAMES).toHaveLength(4);
    expect(TIMEFRAMES[0]).toBe("1D");
    expect(TIMEFRAMES[1]).toBe("1H");
    expect(TIMEFRAMES[2]).toBe("5M");
    expect(TIMEFRAMES[3]).toBe("1M");
  });

  it("ENTRY_TIMEFRAMES contains exactly [5M, 1M]", () => {
    expect(ENTRY_TIMEFRAMES).toHaveLength(2);
    expect(ENTRY_TIMEFRAMES[0]).toBe("5M");
    expect(ENTRY_TIMEFRAMES[1]).toBe("1M");
  });

  it("ENTRY_TIMEFRAMES is a subset of TIMEFRAMES", () => {
    for (const tf of ENTRY_TIMEFRAMES) {
      expect(TIMEFRAMES).toContain(tf);
    }
  });
});

describe("core/constants — System limits", () => {
  it("MAX_LEVERAGE equals 38", () => {
    expect(MAX_LEVERAGE).toBe(38);
  });

  it("MAX_SYMBOLS equals 2", () => {
    expect(MAX_SYMBOLS).toBe(2);
  });

  it("MAX_EXCHANGES equals 4", () => {
    expect(MAX_EXCHANGES).toBe(4);
  });

  it("MAX_PYRAMID_COUNT equals 2", () => {
    expect(MAX_PYRAMID_COUNT).toBe(2);
  });

  it("RECONCILIATION_INTERVAL_MS equals 60000", () => {
    expect(RECONCILIATION_INTERVAL_MS).toBe(60_000);
  });
});

describe("core/constants — Supported exchanges", () => {
  it("SUPPORTED_EXCHANGES contains all 4 exchanges", () => {
    expect(SUPPORTED_EXCHANGES).toHaveLength(4);
    expect(SUPPORTED_EXCHANGES).toContain("binance");
    expect(SUPPORTED_EXCHANGES).toContain("okx");
    expect(SUPPORTED_EXCHANGES).toContain("bitget");
    expect(SUPPORTED_EXCHANGES).toContain("mexc");
  });

  it("SUPPORTED_EXCHANGES count matches MAX_EXCHANGES", () => {
    expect(SUPPORTED_EXCHANGES).toHaveLength(MAX_EXCHANGES);
  });
});

describe("core/constants — Supported symbols", () => {
  it("SUPPORTED_SYMBOLS contains BTCUSDT and XAUTUSDT", () => {
    expect(SUPPORTED_SYMBOLS).toHaveLength(2);
    expect(SUPPORTED_SYMBOLS).toContain("BTCUSDT");
    expect(SUPPORTED_SYMBOLS).toContain("XAUTUSDT");
  });

  it("SUPPORTED_SYMBOLS count matches MAX_SYMBOLS", () => {
    expect(SUPPORTED_SYMBOLS).toHaveLength(MAX_SYMBOLS);
  });
});

// ---------------------------------------------------------------------------
// Compile-time immutability checks (using @ts-expect-error)
// ---------------------------------------------------------------------------

describe("core/constants — compile-time immutability", () => {
  it("BB20_CONFIG properties cannot be reassigned (throws at runtime via Object.freeze)", () => {
    expect(() => {
      // @ts-expect-error — cannot assign to readonly property
      BB20_CONFIG.length = 50;
    }).toThrow();
  });

  it("BB4_CONFIG properties cannot be reassigned (throws at runtime via Object.freeze)", () => {
    expect(() => {
      // @ts-expect-error — cannot assign to readonly property
      BB4_CONFIG.stddev = 2;
    }).toThrow();
  });

  it("MA_PERIODS elements cannot be reassigned (throws at runtime via Object.freeze)", () => {
    expect(() => {
      // @ts-expect-error — cannot assign to readonly tuple index
      MA_PERIODS[0] = 50;
    }).toThrow();
  });

  it("SUPPORTED_EXCHANGES elements cannot be reassigned (throws at runtime via Object.freeze)", () => {
    expect(() => {
      // @ts-expect-error — cannot assign to readonly tuple index
      SUPPORTED_EXCHANGES[0] = "kraken";
    }).toThrow();
  });

  it("VECTOR_DIM has literal type 202 (not widened to number)", () => {
    const dim: 202 = VECTOR_DIM;
    expect(dim).toBe(202);
  });

  it("MAX_LEVERAGE has literal type 38 (not widened to number)", () => {
    const lev: 38 = MAX_LEVERAGE;
    expect(lev).toBe(38);
  });

  it("NORMALIZATION_METHOD has literal type MEDIAN_IQR (not widened to string)", () => {
    const method: "MEDIAN_IQR" = NORMALIZATION_METHOD;
    expect(method).toBe("MEDIAN_IQR");
  });
});

/**
 * determineDailyBias() 단위 테스트
 *
 * T-18-003: PRD §7.2 slope=0 등호 허용 + price 비교 strict (>, <)
 *
 * PRD §7.2 L217: LONG_ONLY  = daily_MA20 >= 전일_MA20 AND price > daily_open
 * PRD §7.2 L218: SHORT_ONLY = daily_MA20 <= 전일_MA20 AND price < daily_open
 *
 * 테스트 시나리오:
 *  - slope=0, close > open  → LONG_ONLY  (>= 조건 충족, 엄격 >)
 *  - slope=0, close < open  → SHORT_ONLY (<= 조건 충족, 엄격 <)
 *  - slope=0, close = open  → NEUTRAL    (양쪽 strict 비교 모두 실패)
 *  - slope > 0, close > open → LONG_ONLY (기존 동작 유지)
 *  - slope < 0, close < open → SHORT_ONLY (기존 동작 유지)
 *  - slope > 0, close = open → NEUTRAL   (strict > 실패)
 *  - slope > 0, close < open → NEUTRAL   (방향 불일치)
 */

import { describe, expect, it } from "bun:test";
import { d } from "@/core/decimal";
import { determineDailyBias } from "@/filters/daily-direction";

// ---------------------------------------------------------------------------
// slope=0 — 횡보 구간 (PRD 핵심 케이스)
// ---------------------------------------------------------------------------

describe("determineDailyBias / slope=0 (횡보)", () => {
  const ma20 = d("50000");
  const ma20Yesterday = d("50000"); // slope = 0

  it("slope=0, close > open → LONG_ONLY (>= 0 AND strict >)", () => {
    const result = determineDailyBias(
      d("50100"), // close
      d("50000"), // open
      ma20,
      ma20Yesterday,
    );
    expect(result).toBe("LONG_ONLY");
  });

  it("slope=0, close < open → SHORT_ONLY (<= 0 AND strict <)", () => {
    const result = determineDailyBias(
      d("49900"), // close
      d("50000"), // open
      ma20,
      ma20Yesterday,
    );
    expect(result).toBe("SHORT_ONLY");
  });

  it("slope=0, close = open → NEUTRAL (strict > and strict < both fail)", () => {
    const result = determineDailyBias(
      d("50000"), // close = open
      d("50000"), // open
      ma20,
      ma20Yesterday,
    );
    expect(result).toBe("NEUTRAL");
  });
});

// ---------------------------------------------------------------------------
// slope > 0 — 상승 구간 (기존 동작 유지 + strict > 검증)
// ---------------------------------------------------------------------------

describe("determineDailyBias / slope > 0 (상승)", () => {
  const ma20 = d("50100");
  const ma20Yesterday = d("50000"); // slope > 0

  it("slope > 0, close > open → LONG_ONLY", () => {
    const result = determineDailyBias(
      d("50200"), // close > open
      d("50000"), // open
      ma20,
      ma20Yesterday,
    );
    expect(result).toBe("LONG_ONLY");
  });

  it("slope > 0, close = open → NEUTRAL (strict > fails)", () => {
    const result = determineDailyBias(
      d("50000"), // close = open
      d("50000"), // open
      ma20,
      ma20Yesterday,
    );
    expect(result).toBe("NEUTRAL");
  });

  it("slope > 0, close < open → NEUTRAL (방향 불일치)", () => {
    const result = determineDailyBias(
      d("49900"), // close < open
      d("50000"), // open
      ma20,
      ma20Yesterday,
    );
    expect(result).toBe("NEUTRAL");
  });
});

// ---------------------------------------------------------------------------
// slope < 0 — 하락 구간 (기존 동작 유지 + strict < 검증)
// ---------------------------------------------------------------------------

describe("determineDailyBias / slope < 0 (하락)", () => {
  const ma20 = d("49900");
  const ma20Yesterday = d("50000"); // slope < 0

  it("slope < 0, close < open → SHORT_ONLY", () => {
    const result = determineDailyBias(
      d("49800"), // close < open
      d("50000"), // open
      ma20,
      ma20Yesterday,
    );
    expect(result).toBe("SHORT_ONLY");
  });

  it("slope < 0, close = open → NEUTRAL (strict < fails)", () => {
    const result = determineDailyBias(
      d("50000"), // close = open
      d("50000"), // open
      ma20,
      ma20Yesterday,
    );
    expect(result).toBe("NEUTRAL");
  });

  it("slope < 0, close > open → NEUTRAL (방향 불일치)", () => {
    const result = determineDailyBias(
      d("50100"), // close > open
      d("50000"), // open
      ma20,
      ma20Yesterday,
    );
    expect(result).toBe("NEUTRAL");
  });
});

/**
 * Exit checker — unit tests for checkExit() timeframe guard
 *
 * T-18-008: TP1/TP2 체크를 5M에서만, TIME_EXIT는 모든 TF에서 실행 검증
 */

import { describe, expect, it } from "bun:test";
import type { Timeframe } from "@/core/types";
import { type CheckExitInput, checkExit } from "@/exits/checker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW_MS = Date.now();
const TEN_MIN_AGO = NOW_MS - 1000 * 60 * 10;
const SEVENTY_HOURS_AGO = NOW_MS - 1000 * 3600 * 70; // > 60h → TIME_EXIT

function makeLongTicket(overrides?: Partial<CheckExitInput>): CheckExitInput {
  return {
    state: "INITIAL",
    direction: "LONG",
    entry_price: "100",
    tp1_price: "120", // TP1 at 120
    tp2_price: "150",
    size: "1",
    remaining_size: "1",
    opened_at: new Date(TEN_MIN_AGO),
    trailing_active: false,
    max_favorable: null,
    max_adverse: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TIME_EXIT — all timeframes
// ---------------------------------------------------------------------------

describe("checkExit — TIME_EXIT runs on all timeframes", () => {
  const TIMEFRAMES: (Timeframe | undefined)[] = ["1D", "1H", "5M", "1M", undefined];

  for (const tf of TIMEFRAMES) {
    const label = tf ?? "(no timeframe)";
    it(`TIME_EXIT triggered on timeframe=${label} when hold > 60h`, () => {
      const ticket = makeLongTicket({ opened_at: new Date(SEVENTY_HOURS_AGO) });
      const result = checkExit(ticket, "100", NOW_MS, tf);
      expect(result.type).toBe("TIME_EXIT");
    });
  }
});

// ---------------------------------------------------------------------------
// TP1/TP2 — only on 5M
// ---------------------------------------------------------------------------

describe("checkExit — TP1/TP2 only on 5M", () => {
  it("5M: TP1 triggered when price hits tp1_price", () => {
    const ticket = makeLongTicket();
    // Price at 130 > tp1_price=120 → TP1 hit
    const result = checkExit(ticket, "130", NOW_MS, "5M");
    expect(result.type).toBe("TP1");
  });

  it("1M: TP1 NOT triggered even when price hits tp1_price", () => {
    const ticket = makeLongTicket();
    const result = checkExit(ticket, "130", NOW_MS, "1M");
    expect(result.type).toBe("NONE");
  });

  it("1H: TP1 NOT triggered even when price hits tp1_price", () => {
    const ticket = makeLongTicket();
    const result = checkExit(ticket, "130", NOW_MS, "1H");
    expect(result.type).toBe("NONE");
  });

  it("1D: TP1 NOT triggered even when price hits tp1_price", () => {
    const ticket = makeLongTicket();
    const result = checkExit(ticket, "130", NOW_MS, "1D");
    expect(result.type).toBe("NONE");
  });

  it("undefined timeframe: TP1 triggered (backward-compatible / backtest)", () => {
    const ticket = makeLongTicket();
    const result = checkExit(ticket, "130", NOW_MS, undefined);
    expect(result.type).toBe("TP1");
  });

  it("5M: TP2 triggered when state=TP1_HIT and price hits tp2_price", () => {
    const ticket = makeLongTicket({
      state: "TP1_HIT",
      remaining_size: "0.5",
    });
    // Price at 160 > tp2_price=150 → TP2 hit
    const result = checkExit(ticket, "160", NOW_MS, "5M");
    expect(result.type).toBe("TP2");
  });

  it("1H: TP2 NOT triggered when state=TP1_HIT (timeframe guard)", () => {
    const ticket = makeLongTicket({
      state: "TP1_HIT",
      remaining_size: "0.5",
    });
    const result = checkExit(ticket, "160", NOW_MS, "1H");
    expect(result.type).toBe("NONE");
  });
});

// ---------------------------------------------------------------------------
// CLOSED ticket — always NONE
// ---------------------------------------------------------------------------

describe("checkExit — CLOSED ticket always returns NONE", () => {
  it("CLOSED ticket on 5M returns NONE even at TP price", () => {
    const ticket = makeLongTicket({ state: "CLOSED", remaining_size: "0" });
    const result = checkExit(ticket, "130", NOW_MS, "5M");
    expect(result.type).toBe("NONE");
  });
});

// ---------------------------------------------------------------------------
// Priority: TIME_EXIT before TP
// ---------------------------------------------------------------------------

describe("checkExit — TIME_EXIT takes priority over TP", () => {
  it("On 5M with hold > 60h, TIME_EXIT beats TP1", () => {
    const ticket = makeLongTicket({ opened_at: new Date(SEVENTY_HOURS_AGO) });
    // Price at TP1 level, but hold is > 60h
    const result = checkExit(ticket, "130", NOW_MS, "5M");
    expect(result.type).toBe("TIME_EXIT");
  });
});

import { describe, expect, it } from "bun:test";
import type { TicketRow } from "@/db/schema";
import { canPyramid, type PyramidConfig } from "@/positions/pyramid";

// ---------------------------------------------------------------------------
// Helper — builds a minimal TicketRow-like object for canPyramid tests
// ---------------------------------------------------------------------------

function makeTicket(overrides: Partial<TicketRow> = {}): TicketRow {
  return {
    id: "ticket-001",
    symbol: "BTC/USDT",
    exchange: "binance",
    signal_id: "signal-001",
    parent_ticket_id: null,
    timeframe: "5M",
    direction: "LONG",
    state: "TP1_HIT",
    entry_price: "50000",
    sl_price: "49500",
    current_sl_price: "50000", // at breakeven
    size: "1",
    remaining_size: "0.5",
    leverage: 5,
    tp1_price: "51000",
    tp2_price: "52000",
    trailing_active: false,
    trailing_price: null,
    max_profit: "0",
    pyramid_count: 0,
    opened_at: new Date(),
    closed_at: null,
    close_reason: null,
    result: null,
    pnl: null,
    pnl_pct: null,
    max_favorable: null,
    max_adverse: null,
    hold_duration_sec: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as TicketRow;
}

function makeConfig(overrides: Partial<PyramidConfig> = {}): PyramidConfig {
  return {
    maxPyramidCount: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// canPyramid — pure function tests
// ---------------------------------------------------------------------------

describe("pyramid — canPyramid", () => {
  // --- Allowed cases ---

  it("state=TP1_HIT, SL at breakeven, count=0 → allowed=true", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      direction: "LONG",
      entry_price: "50000",
      current_sl_price: "50000", // at breakeven
      pyramid_count: 0,
    });
    const result = canPyramid(ticket, makeConfig());
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("state=TP1_HIT, SL above breakeven (LONG), count=0 → allowed=true", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      direction: "LONG",
      entry_price: "50000",
      current_sl_price: "50100", // above breakeven
      pyramid_count: 0,
    });
    const result = canPyramid(ticket, makeConfig());
    expect(result.allowed).toBe(true);
  });

  it("state=TP2_HIT, SL at breakeven → allowed=true (post-TP1 state)", () => {
    const ticket = makeTicket({
      state: "TP2_HIT",
      direction: "LONG",
      entry_price: "50000",
      current_sl_price: "50000",
      pyramid_count: 0,
    });
    const result = canPyramid(ticket, makeConfig());
    expect(result.allowed).toBe(true);
  });

  it("state=TP1_HIT, SHORT with SL at breakeven → allowed=true", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      direction: "SHORT",
      entry_price: "50000",
      current_sl_price: "50000", // at breakeven for SHORT
      pyramid_count: 0,
    });
    const result = canPyramid(ticket, makeConfig());
    expect(result.allowed).toBe(true);
  });

  it("state=TP1_HIT, SHORT with SL below breakeven → allowed=true", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      direction: "SHORT",
      entry_price: "50000",
      current_sl_price: "49900", // below entry for SHORT = good
      pyramid_count: 0,
    });
    const result = canPyramid(ticket, makeConfig());
    expect(result.allowed).toBe(true);
  });

  it("pyramid_count=1 with max=2 → allowed=true", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      direction: "LONG",
      entry_price: "50000",
      current_sl_price: "50000",
      pyramid_count: 1,
    });
    const result = canPyramid(ticket, makeConfig({ maxPyramidCount: 2 }));
    expect(result.allowed).toBe(true);
  });

  // --- Rejected cases ---

  it("state=INITIAL → allowed=false, reason='TP1 not reached'", () => {
    const ticket = makeTicket({
      state: "INITIAL",
      pyramid_count: 0,
    });
    const result = canPyramid(ticket, makeConfig());
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("TP1");
  });

  it("state=CLOSED → allowed=false", () => {
    const ticket = makeTicket({
      state: "CLOSED",
      pyramid_count: 0,
    });
    const result = canPyramid(ticket, makeConfig());
    expect(result.allowed).toBe(false);
  });

  it("state=TP1_HIT, SL below entry (LONG) → allowed=false, reason='SL not at breakeven'", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      direction: "LONG",
      entry_price: "50000",
      current_sl_price: "49900", // below entry for LONG = not at breakeven
      pyramid_count: 0,
    });
    const result = canPyramid(ticket, makeConfig());
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("breakeven");
  });

  it("state=TP1_HIT, SL above entry (SHORT) → allowed=false", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      direction: "SHORT",
      entry_price: "50000",
      current_sl_price: "50100", // above entry for SHORT = not at breakeven
      pyramid_count: 0,
    });
    const result = canPyramid(ticket, makeConfig());
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("breakeven");
  });

  it("pyramid_count=2 → allowed=false, reason='max pyramid reached'", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      direction: "LONG",
      entry_price: "50000",
      current_sl_price: "50000",
      pyramid_count: 2,
    });
    const result = canPyramid(ticket, makeConfig({ maxPyramidCount: 2 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("max pyramid");
  });

  it("pyramid_count=3 (above max) → allowed=false", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      direction: "LONG",
      entry_price: "50000",
      current_sl_price: "50000",
      pyramid_count: 3,
    });
    const result = canPyramid(ticket, makeConfig({ maxPyramidCount: 2 }));
    expect(result.allowed).toBe(false);
  });

  // --- Edge cases ---

  it("null current_sl_price treated as non-breakeven → allowed=false", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      direction: "LONG",
      entry_price: "50000",
      current_sl_price: null as unknown as string,
      pyramid_count: 0,
    });
    const result = canPyramid(ticket, makeConfig());
    expect(result.allowed).toBe(false);
  });

  it("null pyramid_count treated as 0 → allowed=true when other conditions met", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      direction: "LONG",
      entry_price: "50000",
      current_sl_price: "50000",
      pyramid_count: null as unknown as number,
    });
    const result = canPyramid(ticket, makeConfig());
    expect(result.allowed).toBe(true);
  });

  it("custom maxPyramidCount=1 restricts at count=1", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      direction: "LONG",
      entry_price: "50000",
      current_sl_price: "50000",
      pyramid_count: 1,
    });
    const result = canPyramid(ticket, makeConfig({ maxPyramidCount: 1 }));
    expect(result.allowed).toBe(false);
  });
});

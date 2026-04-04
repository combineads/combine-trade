import { describe, expect, it } from "bun:test";
import { d } from "@/core/decimal";
import {
  checkExit,
  calcCloseSize,
  calcMfeMae,
  type ExitAction,
  type MfeMaeResult,
  type CheckExitInput,
} from "@/exits/checker";

// ---------------------------------------------------------------------------
// Helper — builds a minimal CheckExitInput for testing
// ---------------------------------------------------------------------------

const SIXTY_HOURS_MS = 60 * 3600 * 1000;

/** Fixed "now" for tests — 1 hour after opened_at (well within 60h limit) */
const NOW_MS = new Date("2025-06-01T01:00:00Z").getTime();
const OPENED_AT = new Date("2025-06-01T00:00:00Z");

function makeTicket(overrides: Partial<CheckExitInput> = {}): CheckExitInput {
  return {
    state: "INITIAL",
    direction: "LONG",
    entry_price: "50000",
    tp1_price: "51000",
    tp2_price: "52000",
    size: "1",
    remaining_size: "1",
    opened_at: OPENED_AT,
    trailing_active: false,
    max_favorable: "0",
    max_adverse: "0",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// checkExit — LONG INITIAL → TP1
// ---------------------------------------------------------------------------

describe("exit-checker / checkExit", () => {
  // ── LONG TP1 ────────────────────────────────────────────────────────────

  it("LONG INITIAL, close >= tp1_price → TP1 action with size×0.50", () => {
    const ticket = makeTicket({ direction: "LONG", state: "INITIAL" });
    const result = checkExit(ticket, "51000", NOW_MS);

    expect(result.type).toBe("TP1");
    expect(result.closeReason).toBe("TP1");
    expect(result.closeSize.equals(d("0.5"))).toBe(true); // 1 × 0.50
  });

  it("LONG INITIAL, close > tp1_price → TP1 action", () => {
    const ticket = makeTicket({ direction: "LONG", state: "INITIAL" });
    const result = checkExit(ticket, "52000", NOW_MS);

    expect(result.type).toBe("TP1");
  });

  it("LONG INITIAL, close < tp1_price → NONE", () => {
    const ticket = makeTicket({ direction: "LONG", state: "INITIAL" });
    const result = checkExit(ticket, "50999", NOW_MS);

    expect(result.type).toBe("NONE");
    expect(result.closeSize.isZero()).toBe(true);
    expect(result.closeReason).toBeNull();
  });

  // ── SHORT TP1 ───────────────────────────────────────────────────────────

  it("SHORT INITIAL, close <= tp1_price → TP1 action", () => {
    const ticket = makeTicket({
      direction: "SHORT",
      state: "INITIAL",
      entry_price: "50000",
      tp1_price: "49000",
      tp2_price: "48000",
    });
    const result = checkExit(ticket, "49000", NOW_MS);

    expect(result.type).toBe("TP1");
    expect(result.closeReason).toBe("TP1");
    expect(result.closeSize.equals(d("0.5"))).toBe(true);
  });

  it("SHORT INITIAL, close > tp1_price → NONE", () => {
    const ticket = makeTicket({
      direction: "SHORT",
      state: "INITIAL",
      entry_price: "50000",
      tp1_price: "49000",
    });
    const result = checkExit(ticket, "49001", NOW_MS);

    expect(result.type).toBe("NONE");
  });

  // ── TP2 (state = TP1_HIT) ──────────────────────────────────────────────

  it("TP1_HIT, LONG close >= tp2_price → TP2 action with remaining×(1/3)", () => {
    const ticket = makeTicket({
      direction: "LONG",
      state: "TP1_HIT",
      size: "1",
      remaining_size: "0.5", // after TP1 took 50%
    });
    const result = checkExit(ticket, "52000", NOW_MS);

    expect(result.type).toBe("TP2");
    expect(result.closeReason).toBe("TP2");
    // remaining(0.5) × (1/3) ≈ 0.16666...
    const expected = d("0.5").dividedBy(d("3"));
    expect(result.closeSize.equals(expected)).toBe(true);
  });

  it("TP1_HIT, LONG close < tp2_price → NONE", () => {
    const ticket = makeTicket({
      direction: "LONG",
      state: "TP1_HIT",
      remaining_size: "0.5",
    });
    const result = checkExit(ticket, "51999", NOW_MS);

    expect(result.type).toBe("NONE");
  });

  it("TP1_HIT, SHORT close <= tp2_price → TP2 action", () => {
    const ticket = makeTicket({
      direction: "SHORT",
      state: "TP1_HIT",
      entry_price: "50000",
      tp1_price: "49000",
      tp2_price: "48000",
      size: "1",
      remaining_size: "0.5",
    });
    const result = checkExit(ticket, "48000", NOW_MS);

    expect(result.type).toBe("TP2");
    expect(result.closeReason).toBe("TP2");
  });

  // ── TP2_HIT state → NONE (trailing/TIME_EXIT only from manager) ────────

  it("TP2_HIT state, price above everything → NONE (no TP check)", () => {
    const ticket = makeTicket({
      direction: "LONG",
      state: "TP2_HIT",
      remaining_size: "0.333",
    });
    const result = checkExit(ticket, "99999", NOW_MS);

    expect(result.type).toBe("NONE");
  });

  // ── TIME_EXIT ───────────────────────────────────────────────────────────

  it("hold > 60h → TIME_EXIT with full remaining", () => {
    const openedAt = new Date("2025-01-01T00:00:00Z");
    const now = openedAt.getTime() + SIXTY_HOURS_MS + 1; // 60h + 1ms
    const ticket = makeTicket({
      state: "INITIAL",
      remaining_size: "0.8",
      opened_at: openedAt,
    });
    const result = checkExit(ticket, "50500", now);

    expect(result.type).toBe("TIME_EXIT");
    expect(result.closeReason).toBe("TIME_EXIT");
    expect(result.closeSize.equals(d("0.8"))).toBe(true);
  });

  it("hold exactly 60h → NONE (not exceeded)", () => {
    const openedAt = new Date("2025-01-01T00:00:00Z");
    const now = openedAt.getTime() + SIXTY_HOURS_MS; // exactly 60h
    const ticket = makeTicket({
      state: "INITIAL",
      remaining_size: "0.8",
      opened_at: openedAt,
    });
    const result = checkExit(ticket, "50500", now);

    // exactly 60h is NOT exceeded (strictly greater)
    expect(result.type).not.toBe("TIME_EXIT");
  });

  // ── TIME_EXIT priority over TP ──────────────────────────────────────────

  it("TIME_EXIT takes priority over TP check when both conditions met", () => {
    const openedAt = new Date("2025-01-01T00:00:00Z");
    const now = openedAt.getTime() + SIXTY_HOURS_MS + 1;
    const ticket = makeTicket({
      state: "INITIAL",
      direction: "LONG",
      remaining_size: "1",
      opened_at: openedAt,
    });
    // price hits TP1 AND time expired
    const result = checkExit(ticket, "51000", now);

    expect(result.type).toBe("TIME_EXIT");
    expect(result.closeSize.equals(d("1"))).toBe(true); // full remaining, not 50%
  });

  // ── CLOSED state ────────────────────────────────────────────────────────

  it("CLOSED state → NONE regardless of price", () => {
    const ticket = makeTicket({
      state: "CLOSED",
      remaining_size: "0",
    });
    const result = checkExit(ticket, "99999", NOW_MS);

    expect(result.type).toBe("NONE");
    expect(result.closeSize.isZero()).toBe(true);
    expect(result.closeReason).toBeNull();
  });

  // ── null TP prices ──────────────────────────────────────────────────────

  it("null tp1_price in INITIAL → NONE (no target set)", () => {
    const ticket = makeTicket({
      state: "INITIAL",
      tp1_price: null,
    });
    const result = checkExit(ticket, "99999", NOW_MS);

    expect(result.type).toBe("NONE");
  });

  it("null tp2_price in TP1_HIT → NONE (no target set)", () => {
    const ticket = makeTicket({
      state: "TP1_HIT",
      tp2_price: null,
      remaining_size: "0.5",
    });
    const result = checkExit(ticket, "99999", NOW_MS);

    expect(result.type).toBe("NONE");
  });

  // ── TIME_EXIT works for all non-CLOSED states ──────────────────────────

  it("TIME_EXIT triggers in TP1_HIT state", () => {
    const openedAt = new Date("2025-01-01T00:00:00Z");
    const now = openedAt.getTime() + SIXTY_HOURS_MS + 1;
    const ticket = makeTicket({
      state: "TP1_HIT",
      remaining_size: "0.5",
      opened_at: openedAt,
    });
    const result = checkExit(ticket, "50000", now);

    expect(result.type).toBe("TIME_EXIT");
    expect(result.closeSize.equals(d("0.5"))).toBe(true);
  });

  it("TIME_EXIT triggers in TP2_HIT state", () => {
    const openedAt = new Date("2025-01-01T00:00:00Z");
    const now = openedAt.getTime() + SIXTY_HOURS_MS + 1;
    const ticket = makeTicket({
      state: "TP2_HIT",
      remaining_size: "0.333",
      opened_at: openedAt,
    });
    const result = checkExit(ticket, "50000", now);

    expect(result.type).toBe("TIME_EXIT");
    expect(result.closeSize.equals(d("0.333"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calcCloseSize
// ---------------------------------------------------------------------------

describe("exit-checker / calcCloseSize", () => {
  it("TP1 → exactly half of total size", () => {
    const ticket = makeTicket({ size: "2.4", remaining_size: "2.4" });
    const result = calcCloseSize(ticket, "TP1");

    expect(result.equals(d("1.2"))).toBe(true);
  });

  it("TP2 → remaining × (1/3)", () => {
    const ticket = makeTicket({ size: "2.4", remaining_size: "1.2" });
    const result = calcCloseSize(ticket, "TP2");

    const expected = d("1.2").dividedBy(d("3"));
    expect(result.equals(expected)).toBe(true);
  });

  it("TIME_EXIT → full remaining", () => {
    const ticket = makeTicket({ size: "2.4", remaining_size: "0.8" });
    const result = calcCloseSize(ticket, "TIME_EXIT");

    expect(result.equals(d("0.8"))).toBe(true);
  });

  it("NONE → zero", () => {
    const ticket = makeTicket({ size: "1", remaining_size: "1" });
    const result = calcCloseSize(ticket, "NONE");

    expect(result.isZero()).toBe(true);
  });

  it("TP1 uses total size (not remaining) for calculation", () => {
    // Even if remaining_size differs from size, TP1 uses size × 0.50
    const ticket = makeTicket({ size: "10", remaining_size: "8" });
    const result = calcCloseSize(ticket, "TP1");

    expect(result.equals(d("5"))).toBe(true); // 10 × 0.50
  });

  it("precision is maintained with small numbers", () => {
    const ticket = makeTicket({ size: "0.001", remaining_size: "0.001" });
    const result = calcCloseSize(ticket, "TP1");

    expect(result.equals(d("0.0005"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calcMfeMae
// ---------------------------------------------------------------------------

describe("exit-checker / calcMfeMae", () => {
  // ── LONG favorable ──────────────────────────────────────────────────────

  it("LONG price above entry → favorable increases", () => {
    const result = calcMfeMae("50000", "51000", "LONG", "0", "0");

    expect(result.mfe.equals(d("1000"))).toBe(true); // 51000 - 50000
    expect(result.mae.equals(d("0"))).toBe(true);
  });

  it("LONG price below entry → adverse increases", () => {
    const result = calcMfeMae("50000", "49000", "LONG", "0", "0");

    expect(result.mfe.equals(d("0"))).toBe(true);
    expect(result.mae.equals(d("1000"))).toBe(true); // 50000 - 49000
  });

  // ── Ratchet — never decreases ──────────────────────────────────────────

  it("favorable never decreases (ratchet)", () => {
    // Previous MFE was 2000, current excursion is only 500
    const result = calcMfeMae("50000", "50500", "LONG", "2000", "0");

    expect(result.mfe.equals(d("2000"))).toBe(true); // stays at prev
  });

  it("adverse never decreases (ratchet)", () => {
    // Previous MAE was 1000, current adverse is only 200
    const result = calcMfeMae("50000", "49800", "LONG", "0", "1000");

    expect(result.mae.equals(d("1000"))).toBe(true); // stays at prev
  });

  it("favorable increases when new excursion exceeds previous", () => {
    const result = calcMfeMae("50000", "53000", "LONG", "2000", "0");

    expect(result.mfe.equals(d("3000"))).toBe(true); // new high
  });

  // ── SHORT direction ─────────────────────────────────────────────────────

  it("SHORT price below entry → favorable increases", () => {
    const result = calcMfeMae("50000", "49000", "SHORT", "0", "0");

    expect(result.mfe.equals(d("1000"))).toBe(true); // entry - current
    expect(result.mae.equals(d("0"))).toBe(true);
  });

  it("SHORT price above entry → adverse increases", () => {
    const result = calcMfeMae("50000", "51000", "SHORT", "0", "0");

    expect(result.mfe.equals(d("0"))).toBe(true);
    expect(result.mae.equals(d("1000"))).toBe(true); // current - entry
  });

  it("SHORT favorable ratchet", () => {
    const result = calcMfeMae("50000", "49500", "SHORT", "2000", "0");

    expect(result.mfe.equals(d("2000"))).toBe(true); // prev wins
  });

  // ── Edge: price at entry ────────────────────────────────────────────────

  it("price at entry → both zero (with zero prev)", () => {
    const result = calcMfeMae("50000", "50000", "LONG", "0", "0");

    expect(result.mfe.equals(d("0"))).toBe(true);
    expect(result.mae.equals(d("0"))).toBe(true);
  });

  // ── MAE clamped to 0 minimum ───────────────────────────────────────────

  it("MAE is clamped to 0 minimum (LONG, price above entry)", () => {
    // For LONG: mae_raw = entry - current = 50000 - 51000 = -1000 → clamp to 0
    const result = calcMfeMae("50000", "51000", "LONG", "0", "0");

    expect(result.mae.equals(d("0"))).toBe(true);
  });

  it("MFE is clamped to 0 minimum (LONG, price below entry)", () => {
    // For LONG: mfe_raw = current - entry = 49000 - 50000 = -1000 → clamp to 0
    const result = calcMfeMae("50000", "49000", "LONG", "0", "0");

    expect(result.mfe.equals(d("0"))).toBe(true);
  });

  it("MAE is clamped to 0 minimum (SHORT, price below entry)", () => {
    // For SHORT: mae_raw = current - entry = 49000 - 50000 = -1000 → clamp to 0
    const result = calcMfeMae("50000", "49000", "SHORT", "0", "0");

    expect(result.mae.equals(d("0"))).toBe(true);
  });
});

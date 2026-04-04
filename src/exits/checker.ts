/**
 * Exit condition checker — pure functions for TP1/TP2/TIME_EXIT detection
 * and MFE/MAE calculation.
 *
 * NO database imports — reusable in backtest without DB dependencies.
 */

import type Decimal from "decimal.js";
import { d, gte, lte, max, mul, sub } from "@/core/decimal";
import type { CloseReason, Direction, TicketState } from "@/core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 60 hours in milliseconds */
const TIME_EXIT_THRESHOLD_MS = 60 * 3600 * 1000;

/** TP1 closes 50% of total size */
const TP1_CLOSE_RATIO = "0.5";

/** TP2 closes 1/2 of remaining size */
const TP2_CLOSE_DIVISOR = "2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Exit action type — describes which exit condition was triggered */
export type ExitActionType = "TP1" | "TP2" | "TIME_EXIT" | "NONE";

/** Result of checkExit — tells the caller what to do */
export type ExitAction = {
  type: ExitActionType;
  closeSize: Decimal;
  closeReason: CloseReason | null;
};

/** Result of MFE/MAE calculation */
export type MfeMaeResult = {
  mfe: Decimal;
  mae: Decimal;
};

/**
 * Minimal ticket fields required by the exit checker.
 * Uses string | null for numeric fields (matching Drizzle TicketRow shape).
 */
export type CheckExitInput = {
  state: TicketState;
  direction: Direction;
  entry_price: string;
  tp1_price: string | null;
  tp2_price: string | null;
  size: string;
  remaining_size: string;
  opened_at: Date;
  trailing_active: boolean;
  max_favorable: string | null;
  max_adverse: string | null;
};

// ---------------------------------------------------------------------------
// checkExit
// ---------------------------------------------------------------------------

/**
 * Determines which exit action should be taken for a ticket given the
 * current price and time.
 *
 * Priority: CLOSED → TIME_EXIT → TP1/TP2 → NONE
 *
 * @param ticket  Minimal ticket data (pure — no DB row dependency)
 * @param currentPrice  Current market price as string
 * @param nowMs  Current timestamp in milliseconds (Date.now())
 * @returns ExitAction describing what to do
 */
export function checkExit(ticket: CheckExitInput, currentPrice: string, nowMs: number): ExitAction {
  const NONE_ACTION: ExitAction = {
    type: "NONE",
    closeSize: d("0"),
    closeReason: null,
  };

  // CLOSED → always NONE
  if (ticket.state === "CLOSED") {
    return NONE_ACTION;
  }

  // TIME_EXIT check — takes priority over TP checks
  const holdDurationMs = nowMs - ticket.opened_at.getTime();
  if (holdDurationMs > TIME_EXIT_THRESHOLD_MS) {
    return {
      type: "TIME_EXIT",
      closeSize: d(ticket.remaining_size),
      closeReason: "TIME_EXIT",
    };
  }

  // TP1 check (INITIAL state only)
  if (ticket.state === "INITIAL" && ticket.tp1_price !== null) {
    if (isTpHit(ticket.direction, currentPrice, ticket.tp1_price)) {
      return {
        type: "TP1",
        closeSize: calcCloseSize(ticket, "TP1"),
        closeReason: "TP1",
      };
    }
  }

  // TP2 check (TP1_HIT state only)
  if (ticket.state === "TP1_HIT" && ticket.tp2_price !== null) {
    if (isTpHit(ticket.direction, currentPrice, ticket.tp2_price)) {
      return {
        type: "TP2",
        closeSize: calcCloseSize(ticket, "TP2"),
        closeReason: "TP2",
      };
    }
  }

  // TP2_HIT state — trailing/TIME_EXIT handled by manager; no TP check here
  return NONE_ACTION;
}

// ---------------------------------------------------------------------------
// calcCloseSize
// ---------------------------------------------------------------------------

/**
 * Calculates the size to close for a given exit action type.
 *
 * - TP1: total_size × 0.50
 * - TP2: remaining_size × (1/2)
 * - TIME_EXIT: full remaining_size
 * - NONE: 0
 */
export function calcCloseSize(
  ticket: Pick<CheckExitInput, "size" | "remaining_size">,
  actionType: ExitActionType,
): Decimal {
  switch (actionType) {
    case "TP1":
      return mul(ticket.size, TP1_CLOSE_RATIO);
    case "TP2":
      return d(ticket.remaining_size).dividedBy(d(TP2_CLOSE_DIVISOR));
    case "TIME_EXIT":
      return d(ticket.remaining_size);
    case "NONE":
      return d("0");
  }
}

// ---------------------------------------------------------------------------
// calcMfeMae
// ---------------------------------------------------------------------------

/**
 * Calculates updated MFE (Maximum Favorable Excursion) and MAE (Maximum
 * Adverse Excursion) values.
 *
 * - LONG:  favorable = max(prevMfe, current - entry), adverse = max(prevMae, entry - current)
 * - SHORT: favorable = max(prevMfe, entry - current), adverse = max(prevMae, current - entry)
 *
 * Both values are clamped to 0 minimum and use ratchet logic (never decrease).
 */
export function calcMfeMae(
  entryPrice: string,
  currentPrice: string,
  direction: Direction,
  prevMfe: string,
  prevMae: string,
): MfeMaeResult {
  const entry = d(entryPrice);
  const current = d(currentPrice);
  const zero = d("0");

  let rawFavorable: Decimal;
  let rawAdverse: Decimal;

  if (direction === "LONG") {
    rawFavorable = sub(current, entry);
    rawAdverse = sub(entry, current);
  } else {
    rawFavorable = sub(entry, current);
    rawAdverse = sub(current, entry);
  }

  // Clamp to 0 minimum
  const clampedFavorable = rawFavorable.greaterThan(zero) ? rawFavorable : zero;
  const clampedAdverse = rawAdverse.greaterThan(zero) ? rawAdverse : zero;

  // Ratchet — never decrease
  const mfe = max(prevMfe, clampedFavorable);
  const mae = max(prevMae, clampedAdverse);

  return { mfe, mae };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a take-profit target is hit based on direction.
 * LONG: currentPrice >= tpPrice
 * SHORT: currentPrice <= tpPrice
 */
function isTpHit(direction: Direction, currentPrice: string, tpPrice: string): boolean {
  if (direction === "LONG") {
    return gte(currentPrice, tpPrice);
  }
  return lte(currentPrice, tpPrice);
}

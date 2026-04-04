/**
 * Reconciliation comparator — pure function, NO DB imports.
 *
 * Compares exchange positions against DB active tickets and classifies each
 * into: matched, unmatched (panic-close target), orphaned (IDLE target),
 * or excluded (safety-guarded).
 */

import type { ExchangePosition } from "@/core/ports";
import type { TicketSnapshot } from "@/core/types";

export type { TicketSnapshot };

/** Exchange position matched with a DB ticket */
export type MatchedPair = {
  position: ExchangePosition;
  ticket: TicketSnapshot;
};

/** Exchange position with no corresponding DB ticket (panic-close target) */
export type UnmatchedPosition = {
  position: ExchangePosition;
};

/** DB ticket with no corresponding exchange position (IDLE target) */
export type OrphanedTicket = {
  ticket: TicketSnapshot;
};

/** Position excluded from unmatched classification by safety guard */
export type ExcludedPosition = {
  position: ExchangePosition;
  reason: "pending" | "recent_ticket";
};

/** Full reconciliation result */
export type ReconciliationResult = {
  matched: MatchedPair[];
  unmatched: UnmatchedPosition[];
  orphaned: OrphanedTicket[];
  excluded: ExcludedPosition[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds the composite key used to match positions and tickets */
function positionKey(symbol: string, exchange: string): string {
  return `${symbol}:${exchange}`;
}

/**
 * Returns true if the ticket was created strictly after snapshotTime.
 * Tickets created at or before snapshotTime are considered "old enough"
 * to participate in reconciliation.
 */
export function isRecentTicket(ticket: TicketSnapshot, snapshotTime: Date): boolean {
  return ticket.created_at.getTime() > snapshotTime.getTime();
}

// ---------------------------------------------------------------------------
// Core comparison
// ---------------------------------------------------------------------------

/**
 * Compares exchange positions against active DB tickets and classifies each.
 *
 * @param exchangePositions - Current positions fetched from exchange
 * @param activeTickets - Active tickets from DB (state != CLOSED)
 * @param pendingSymbols - Set of "symbol:exchange" keys with pending orders
 * @param snapshotTime - Timestamp of the exchange position snapshot
 * @returns Classification of all positions and tickets
 */
export function comparePositions(
  exchangePositions: readonly ExchangePosition[],
  activeTickets: readonly TicketSnapshot[],
  pendingSymbols: ReadonlySet<string>,
  snapshotTime: Date,
): ReconciliationResult {
  const matched: MatchedPair[] = [];
  const unmatched: UnmatchedPosition[] = [];
  const orphaned: OrphanedTicket[] = [];
  const excluded: ExcludedPosition[] = [];

  // Separate tickets into "comparable" (old enough) and "recent" (too new)
  const comparableTickets: TicketSnapshot[] = [];
  const recentTicketKeys = new Set<string>();

  for (const ticket of activeTickets) {
    if (isRecentTicket(ticket, snapshotTime)) {
      recentTicketKeys.add(positionKey(ticket.symbol, ticket.exchange));
    } else {
      comparableTickets.push(ticket);
    }
  }

  // Index comparable tickets by (symbol, exchange, direction) for matching.
  // Multiple tickets can exist per key (e.g. pyramid entries), so we use arrays.
  const ticketsByKey = new Map<string, TicketSnapshot[]>();
  for (const ticket of comparableTickets) {
    const key = positionKey(ticket.symbol, ticket.exchange);
    const dirKey = `${key}:${ticket.direction}`;
    const existing = ticketsByKey.get(dirKey);
    if (existing !== undefined) {
      existing.push(ticket);
    } else {
      ticketsByKey.set(dirKey, [ticket]);
    }
  }

  // Track which ticket direction-keys have been matched
  const matchedTicketDirKeys = new Set<string>();

  // Classify each exchange position
  for (const position of exchangePositions) {
    const key = positionKey(position.symbol, position.exchange);
    const dirKey = `${key}:${position.side}`;
    const tickets = ticketsByKey.get(dirKey);

    if (tickets !== undefined && tickets.length > 0) {
      // Matched: same (symbol, exchange, direction) exists in both sides
      for (const ticket of tickets) {
        matched.push({ position, ticket });
      }
      matchedTicketDirKeys.add(dirKey);
    } else {
      // No matching ticket found — check safety guards before classifying as unmatched

      // Safety 1: pending symbols
      if (pendingSymbols.has(key)) {
        excluded.push({ position, reason: "pending" });
        continue;
      }

      // Safety 2: recent ticket exists for this key
      if (recentTicketKeys.has(key)) {
        excluded.push({ position, reason: "recent_ticket" });
        continue;
      }

      // Truly unmatched — panic close target
      unmatched.push({ position });
    }
  }

  // Build set of exchange position keys (with direction) for orphan detection
  const exchangeKeySet = new Set<string>();
  for (const pos of exchangePositions) {
    exchangeKeySet.add(`${positionKey(pos.symbol, pos.exchange)}:${pos.side}`);
  }

  // Classify orphaned tickets: comparable tickets with no matching exchange position
  for (const ticket of comparableTickets) {
    const dirKey = `${positionKey(ticket.symbol, ticket.exchange)}:${ticket.direction}`;
    if (!exchangeKeySet.has(dirKey)) {
      orphaned.push({ ticket });
    }
  }

  return { matched, unmatched, orphaned, excluded };
}

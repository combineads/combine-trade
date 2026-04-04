/**
 * Production DB query factories for the reconciliation worker.
 *
 * Provides getActiveTickets: a function that fetches all non-CLOSED tickets
 * using SELECT ... FOR UPDATE inside a transaction. This prevents race
 * conditions where another process modifies a SymbolState row between the
 * point of reading and the point of applying corrective action.
 *
 * Layer: L1 (db)
 */

import { ne } from "drizzle-orm";
import type { TicketSnapshot } from "@/core/types";
import type { DbInstance } from "./pool";
import { ticketTable } from "./schema";

// ---------------------------------------------------------------------------
// makeGetActiveTickets
// ---------------------------------------------------------------------------

/**
 * Factory that returns a getActiveTickets function bound to the given
 * DbInstance.  The returned function:
 *   1. Opens a transaction
 *   2. Issues SELECT ... FOR UPDATE to lock all non-CLOSED ticket rows
 *   3. Returns the rows as TicketSnapshot[]
 *
 * The transaction ensures that the FOR UPDATE lock is held until the caller
 * either commits or rolls back. When used inside runOnce(), the lock is
 * released after the reconciliation cycle completes.
 *
 * @param db - Drizzle ORM instance (from getDb())
 * @returns A getActiveTickets function compatible with ReconciliationDeps
 */
export function makeGetActiveTickets(db: DbInstance): () => Promise<TicketSnapshot[]> {
  return async function getActiveTickets(): Promise<TicketSnapshot[]> {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: ticketTable.id,
          symbol: ticketTable.symbol,
          exchange: ticketTable.exchange,
          direction: ticketTable.direction,
          state: ticketTable.state,
          created_at: ticketTable.created_at,
        })
        .from(ticketTable)
        .where(ne(ticketTable.state, "CLOSED"))
        .for("update");

      return rows as TicketSnapshot[];
    });
  };
}

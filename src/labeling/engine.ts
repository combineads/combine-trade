/**
 * Labeling engine -- classifies trade results and vector grades.
 *
 * Pure functions:
 * - classifyResult(pnl, closeReason) -> TradeResult
 * - classifyGrade(signalType, safetyPassed, knnWinrate) -> VectorGrade
 *
 * DB function:
 * - finalizeLabel(db, ticketId, vectorId) -> reads Ticket+Signal, classifies, updates Vector
 *
 * Layer: L6 (labeling)
 */

import type Decimal from "decimal.js";
import { and, eq } from "drizzle-orm";
import { d, gt, gte } from "@/core/decimal";
import type { CloseReason, SignalType, TradeResult, VectorGrade } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import { signalDetailTable, signalTable, ticketTable, vectorTable } from "@/db/schema";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class TicketNotFoundError extends Error {
  readonly ticketId: string;

  constructor(ticketId: string) {
    super(`Ticket not found: ${ticketId}`);
    this.name = "TicketNotFoundError";
    this.ticketId = ticketId;
  }
}

// ---------------------------------------------------------------------------
// Return type for finalizeLabel
// ---------------------------------------------------------------------------

export type FinalizeLabelResult = {
  label: TradeResult;
  grade: VectorGrade;
};

// ---------------------------------------------------------------------------
// classifyResult -- pure function
// ---------------------------------------------------------------------------

/**
 * Classifies a trade outcome based on PnL and close reason.
 *
 * Rules:
 * - close_reason = TIME_EXIT -> TIME_EXIT (regardless of PnL)
 * - pnl > 0 -> WIN
 * - pnl <= 0 -> LOSS
 */
export function classifyResult(
  pnl: Decimal,
  closeReason: CloseReason | string | null,
): TradeResult {
  if (closeReason === "TIME_EXIT") {
    return "TIME_EXIT";
  }
  if (gt(pnl, "0")) {
    return "WIN";
  }
  return "LOSS";
}

// ---------------------------------------------------------------------------
// classifyGrade -- pure function
// ---------------------------------------------------------------------------

/**
 * Classifies a vector grade based on signal properties.
 *
 * Rules:
 * - DOUBLE_B + safety_passed + knn winrate >= 0.65 -> A
 * - DOUBLE_B (otherwise) -> B
 * - ONE_B -> C
 */
export function classifyGrade(
  signalType: SignalType,
  safetyPassed: boolean,
  knnWinrate: Decimal,
): VectorGrade {
  if (signalType === "ONE_B") {
    return "C";
  }

  // signalType === "DOUBLE_B"
  if (safetyPassed && gte(knnWinrate, "0.65")) {
    return "A";
  }

  return "B";
}

// ---------------------------------------------------------------------------
// finalizeLabel -- DB transaction
// ---------------------------------------------------------------------------

/**
 * Reads a closed Ticket and its associated Signal, classifies the trade result
 * and vector grade, then updates the Vector row atomically.
 *
 * Lock order: Ticket -> Vector (per ARCHITECTURE.md).
 *
 * If vectorId is null, skips Vector update (ticket-only finalization).
 *
 * @throws {TicketNotFoundError} if ticket does not exist
 */
export async function finalizeLabel(
  db: DbInstance,
  ticketId: string,
  vectorId: string | null,
): Promise<FinalizeLabelResult> {
  return await db.transaction(async (tx) => {
    // 1. Lock & read the Ticket row (lock order: Ticket first)
    const tickets = await tx
      .select({
        id: ticketTable.id,
        signal_id: ticketTable.signal_id,
        close_reason: ticketTable.close_reason,
        pnl: ticketTable.pnl,
      })
      .from(ticketTable)
      .where(eq(ticketTable.id, ticketId))
      .for("update");

    const ticket = tickets[0];
    if (!ticket) {
      throw new TicketNotFoundError(ticketId);
    }

    // 2. Read the Signal (via ticket.signal_id)
    const signals = await tx
      .select({
        signal_type: signalTable.signal_type,
        safety_passed: signalTable.safety_passed,
      })
      .from(signalTable)
      .where(eq(signalTable.id, ticket.signal_id));

    const signal = signals[0];
    if (!signal) {
      throw new Error(`Signal not found for ticket ${ticketId}: signal_id=${ticket.signal_id}`);
    }

    // 3. Read knn_winrate from signal_details (default to "0" if not present)
    const knnRows = await tx
      .select({
        key: signalDetailTable.key,
        value: signalDetailTable.value,
      })
      .from(signalDetailTable)
      .where(
        and(
          eq(signalDetailTable.signal_id, ticket.signal_id),
          eq(signalDetailTable.key, "knn_winrate"),
        ),
      );

    const knnWinrateRow = knnRows[0];
    const knnWinrate = d(knnWinrateRow?.value ?? "0");

    // 4. Classify result and grade
    const pnl = d(ticket.pnl ?? "0");
    const label = classifyResult(pnl, ticket.close_reason);
    const grade = classifyGrade(signal.signal_type as SignalType, signal.safety_passed, knnWinrate);

    // 5. Update ticket.result
    await tx
      .update(ticketTable)
      .set({ result: label, updated_at: new Date() })
      .where(eq(ticketTable.id, ticketId));

    // 6. Lock & update Vector if vectorId is provided
    if (vectorId !== null) {
      // Lock vector row (lock order: Ticket -> Vector)
      await tx
        .select({ id: vectorTable.id })
        .from(vectorTable)
        .where(eq(vectorTable.id, vectorId))
        .for("update");

      await tx
        .update(vectorTable)
        .set({
          label,
          grade,
          labeled_at: new Date(),
        })
        .where(eq(vectorTable.id, vectorId));
    }

    return { label, grade };
  });
}

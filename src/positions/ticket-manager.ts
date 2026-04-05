/**
 * Ticket CRUD + SymbolState FSM synchronization.
 *
 * All state-changing operations execute inside a single SQL transaction with
 * FOR UPDATE locking on SymbolState (lock order: SymbolState -> Ticket).
 *
 * Layer: L5 (positions)
 */

import type Decimal from "decimal.js";
import { and, eq, ne } from "drizzle-orm";
import { d, div, mul } from "@/core/decimal";
import type {
  CloseReason,
  Direction,
  SignalType,
  TicketState,
  TradeResult,
  VectorGrade,
  VectorTimeframe,
} from "@/core/types";
import type { DbInstance } from "@/db/pool";
import type { NewSymbolStateRow, SymbolStateRow, TicketRow } from "@/db/schema";
import {
  signalDetailTable,
  signalTable,
  symbolStateTable,
  ticketTable,
  vectorTable,
} from "@/db/schema";
import { validateTransition } from "./fsm";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class InvalidStateError extends Error {
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(`Invalid SymbolState: expected fsm_state='${expected}', got '${actual}'`);
    this.name = "InvalidStateError";
    this.expected = expected;
    this.actual = actual;
  }
}

export class DuplicateTicketError extends Error {
  readonly symbol: string;
  readonly exchange: string;

  constructor(symbol: string, exchange: string) {
    super(`Active ticket already exists for ${symbol}@${exchange}`);
    this.name = "DuplicateTicketError";
    this.symbol = symbol;
    this.exchange = exchange;
  }
}

export class TicketNotFoundError extends Error {
  readonly ticketId: string;

  constructor(ticketId: string) {
    super(`Ticket not found: ${ticketId}`);
    this.name = "TicketNotFoundError";
    this.ticketId = ticketId;
  }
}

// ---------------------------------------------------------------------------
// Param types
// ---------------------------------------------------------------------------

export type CreateTicketParams = {
  symbol: string;
  exchange: string;
  signalId: string;
  timeframe: VectorTimeframe;
  direction: Direction;
  entryPrice: string;
  slPrice: string;
  size: string;
  leverage: number;
  tp1Price?: string;
  tp2Price?: string;
};

/**
 * Labeling deps injected into closeTicket to avoid L5→L6 import violation.
 * Callers (L6, L8, L9) provide classifyResult + classifyGrade from labeling/engine.
 * If omitted, vector labeling is skipped even when vectorId is provided.
 */
export type LabelingDeps = {
  classifyResult: (pnl: Decimal, closeReason: CloseReason | string | null) => TradeResult;
  classifyGrade: (
    signalType: SignalType,
    safetyPassed: boolean,
    knnWinrate: Decimal,
  ) => VectorGrade;
};

export type CloseTicketParams = {
  closeReason: CloseReason;
  result: TradeResult;
  pnl: string;
  /** Vector ID to label atomically in the same transaction. null → skip labeling. */
  vectorId?: string | null;
  /** Labeling functions (injected by caller to respect L5/L6 boundary). Required when vectorId is set. */
  labelingDeps?: LabelingDeps;
};

// ---------------------------------------------------------------------------
// createTicket
// ---------------------------------------------------------------------------

/**
 * Creates a new ticket and atomically transitions SymbolState.fsm_state from
 * WATCHING to HAS_POSITION in a single transaction.
 *
 * Preconditions:
 * - SymbolState.fsm_state must be WATCHING
 * - No active ticket (state != CLOSED) for this symbol x exchange
 *
 * @throws {InvalidStateError} if fsm_state is not WATCHING
 * @throws {DuplicateTicketError} if an active ticket already exists
 */
export async function createTicket(db: DbInstance, params: CreateTicketParams): Promise<TicketRow> {
  return await db.transaction(async (tx) => {
    // 1. Lock SymbolState row FOR UPDATE
    const symbolStates = await tx
      .select()
      .from(symbolStateTable)
      .where(
        and(
          eq(symbolStateTable.symbol, params.symbol),
          eq(symbolStateTable.exchange, params.exchange),
        ),
      )
      .for("update");

    const symbolState = symbolStates[0];
    if (!symbolState) {
      throw new InvalidStateError("WATCHING", "NOT_FOUND");
    }

    // 2. Verify fsm_state is WATCHING
    if (symbolState.fsm_state !== "WATCHING") {
      throw new InvalidStateError("WATCHING", symbolState.fsm_state);
    }

    // 3. Check no active ticket exists
    const activeTickets = await tx
      .select({ id: ticketTable.id })
      .from(ticketTable)
      .where(
        and(
          eq(ticketTable.symbol, params.symbol),
          eq(ticketTable.exchange, params.exchange),
          ne(ticketTable.state, "CLOSED"),
        ),
      )
      .limit(1);

    if (activeTickets.length > 0) {
      throw new DuplicateTicketError(params.symbol, params.exchange);
    }

    // 4. Insert ticket
    const now = new Date();
    const inserted = await tx
      .insert(ticketTable)
      .values({
        symbol: params.symbol,
        exchange: params.exchange,
        signal_id: params.signalId,
        timeframe: params.timeframe,
        direction: params.direction,
        state: "INITIAL",
        entry_price: params.entryPrice,
        sl_price: params.slPrice,
        current_sl_price: params.slPrice,
        size: params.size,
        remaining_size: params.size,
        leverage: params.leverage,
        tp1_price: params.tp1Price ?? null,
        tp2_price: params.tp2Price ?? null,
        opened_at: now,
      })
      .returning();

    const ticket = inserted[0];
    if (!ticket) {
      throw new Error("createTicket: INSERT did not return a row");
    }

    // 5. Update SymbolState.fsm_state to HAS_POSITION
    await tx
      .update(symbolStateTable)
      .set({
        fsm_state: "HAS_POSITION",
        updated_at: now,
      })
      .where(eq(symbolStateTable.id, symbolState.id));

    return ticket;
  });
}

// ---------------------------------------------------------------------------
// transitionTicket
// ---------------------------------------------------------------------------

/**
 * Transitions a ticket to a new state after FSM validation.
 * Runs inside a transaction with FOR UPDATE on the ticket row.
 *
 * @throws {TicketNotFoundError} if ticket does not exist
 * @throws {InvalidTransitionError} if the state transition is not allowed
 */
export async function transitionTicket(
  db: DbInstance,
  ticketId: string,
  newState: TicketState,
): Promise<TicketRow> {
  return await db.transaction(async (tx) => {
    // 1. Lock ticket FOR UPDATE
    const tickets = await tx
      .select()
      .from(ticketTable)
      .where(eq(ticketTable.id, ticketId))
      .for("update");

    const ticket = tickets[0];
    if (!ticket) {
      throw new TicketNotFoundError(ticketId);
    }

    // 2. Validate transition via FSM
    validateTransition(ticket.state as TicketState, newState);

    // 3. Update state
    const updated = await tx
      .update(ticketTable)
      .set({
        state: newState,
        updated_at: new Date(),
      })
      .where(eq(ticketTable.id, ticketId))
      .returning();

    const result = updated[0];
    if (!result) {
      throw new Error("transitionTicket: UPDATE did not return a row");
    }

    return result;
  });
}

// ---------------------------------------------------------------------------
// closeTicket
// ---------------------------------------------------------------------------

/**
 * Closes a ticket and atomically transitions SymbolState.fsm_state to IDLE.
 *
 * Calculates:
 * - pnl_pct = pnl / (entry_price * size)
 * - hold_duration_sec = floor((closed_at - opened_at) / 1000)
 *
 * If params.vectorId is provided AND params.labelingDeps is provided, also labels the
 * associated Vector row in the same transaction (PRD §7.19 "단일 트랜잭션").
 *
 * Lock order: SymbolState -> Ticket -> Vector (per ARCHITECTURE.md)
 *
 * @throws {TicketNotFoundError} if ticket does not exist
 * @throws {InvalidTransitionError} if the ticket cannot transition to CLOSED
 */
export async function closeTicket(
  db: DbInstance,
  ticketId: string,
  params: CloseTicketParams,
): Promise<TicketRow> {
  return await db.transaction(async (tx) => {
    // 1. First fetch ticket to get symbol/exchange (without lock, just for FK lookup)
    const ticketLookup = await tx
      .select({
        symbol: ticketTable.symbol,
        exchange: ticketTable.exchange,
      })
      .from(ticketTable)
      .where(eq(ticketTable.id, ticketId))
      .limit(1);

    const lookup = ticketLookup[0];
    if (!lookup) {
      throw new TicketNotFoundError(ticketId);
    }

    // 2. Lock SymbolState FOR UPDATE (lock order: SymbolState first)
    await tx
      .select({ id: symbolStateTable.id })
      .from(symbolStateTable)
      .where(
        and(
          eq(symbolStateTable.symbol, lookup.symbol),
          eq(symbolStateTable.exchange, lookup.exchange),
        ),
      )
      .for("update");

    // 3. Lock Ticket FOR UPDATE
    const tickets = await tx
      .select()
      .from(ticketTable)
      .where(eq(ticketTable.id, ticketId))
      .for("update");

    const ticket = tickets[0];
    if (!ticket) {
      throw new TicketNotFoundError(ticketId);
    }

    // 4. Validate FSM transition to CLOSED
    validateTransition(ticket.state as TicketState, "CLOSED");

    // 5. Calculate derived fields
    const closedAt = new Date();
    const pnl = d(params.pnl);
    // entry_price and size are NOT NULL columns; Drizzle infers string | null for numeric
    const entryPrice = d(ticket.entry_price ?? "0");
    const size = d(ticket.size ?? "0");
    const notionalValue = mul(entryPrice, size);
    const pnlPct = div(pnl, notionalValue);
    const holdDurationSec = Math.floor((closedAt.getTime() - ticket.opened_at.getTime()) / 1000);

    // 6. Update ticket
    const updated = await tx
      .update(ticketTable)
      .set({
        state: "CLOSED",
        closed_at: closedAt,
        close_reason: params.closeReason,
        result: params.result,
        pnl: pnl.toString(),
        pnl_pct: pnlPct.toString(),
        hold_duration_sec: holdDurationSec,
        updated_at: closedAt,
      })
      .where(eq(ticketTable.id, ticketId))
      .returning();

    const result = updated[0];
    if (!result) {
      throw new Error("closeTicket: UPDATE did not return a row");
    }

    // 7. Set SymbolState.fsm_state to IDLE
    await tx
      .update(symbolStateTable)
      .set({
        fsm_state: "IDLE",
        updated_at: closedAt,
      })
      .where(
        and(
          eq(symbolStateTable.symbol, lookup.symbol),
          eq(symbolStateTable.exchange, lookup.exchange),
        ),
      );

    // 8. Vector labeling — same transaction (PRD §7.19 "단일 트랜잭션")
    // Lock order: SymbolState → Ticket → Vector
    const vectorId = params.vectorId ?? null;
    const labelingDeps = params.labelingDeps;
    if (vectorId !== null && labelingDeps !== undefined) {
      // 8a. Read Signal for signal_type and safety_passed
      const signals = await tx
        .select({
          signal_type: signalTable.signal_type,
          safety_passed: signalTable.safety_passed,
        })
        .from(signalTable)
        .where(eq(signalTable.id, ticket.signal_id));

      const signal = signals[0];
      if (!signal) {
        throw new Error(
          `closeTicket: Signal not found for ticket ${ticketId} (signal_id=${ticket.signal_id})`,
        );
      }

      // 8b. Read knn_winrate from signal_details (default to "0" if absent)
      const knnRows = await tx
        .select({ value: signalDetailTable.value })
        .from(signalDetailTable)
        .where(
          and(
            eq(signalDetailTable.signal_id, ticket.signal_id),
            eq(signalDetailTable.key, "knn_winrate"),
          ),
        );
      const knnWinrate = d(knnRows[0]?.value ?? "0");

      // 8c. Classify label and grade using injected pure functions
      const label = labelingDeps.classifyResult(pnl, params.closeReason);
      const grade = labelingDeps.classifyGrade(
        signal.signal_type as SignalType,
        signal.safety_passed,
        knnWinrate,
      );

      // 8d. Lock Vector FOR UPDATE (lock order: SymbolState → Ticket → Vector)
      await tx
        .select({ id: vectorTable.id })
        .from(vectorTable)
        .where(eq(vectorTable.id, vectorId))
        .for("update");

      // 8e. Update Vector label, grade, labeled_at
      await tx
        .update(vectorTable)
        .set({ label, grade, labeled_at: closedAt })
        .where(eq(vectorTable.id, vectorId));
    }

    return result;
  });
}

// ---------------------------------------------------------------------------
// getActiveTicket
// ---------------------------------------------------------------------------

/**
 * Returns the currently active ticket (state != CLOSED) for a given
 * symbol x exchange, or null if none exists.
 */
export async function getActiveTicket(
  db: DbInstance,
  symbol: string,
  exchange: string,
): Promise<TicketRow | null> {
  const rows = await db
    .select()
    .from(ticketTable)
    .where(
      and(
        eq(ticketTable.symbol, symbol),
        eq(ticketTable.exchange, exchange),
        ne(ticketTable.state, "CLOSED"),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// getTicketById
// ---------------------------------------------------------------------------

/**
 * Returns a ticket by its primary key, or null if not found.
 */
export async function getTicketById(db: DbInstance, ticketId: string): Promise<TicketRow | null> {
  const rows = await db.select().from(ticketTable).where(eq(ticketTable.id, ticketId)).limit(1);

  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// upsertSymbolState
// ---------------------------------------------------------------------------

/**
 * Partial update shape for upsertSymbolState.
 * Only the fields explicitly listed here can be patched.
 * All fields are optional — omitting a field leaves it unchanged.
 */
export type SymbolStatePatch = Partial<
  Pick<
    NewSymbolStateRow,
    | "fsm_state"
    | "execution_mode"
    | "daily_bias"
    | "daily_open"
    | "session_box_high"
    | "session_box_low"
    | "losses_today"
    | "losses_session"
    | "losses_this_1h_5m"
    | "losses_this_1h_1m"
  >
>;

/**
 * Upserts a SymbolState row using INSERT ... ON CONFLICT (symbol, exchange) DO UPDATE.
 *
 * - If no row exists for (symbol, exchange), inserts with the provided patch values
 *   and column defaults (fsm_state='IDLE', execution_mode='analysis').
 * - If a row already exists, updates only the fields present in `patch`.
 * - Always sets `updated_at` to now on both insert and update paths.
 *
 * @param db       - Drizzle ORM instance.
 * @param symbol   - Trading pair symbol (e.g. "BTC/USDT").
 * @param exchange - Exchange identifier (e.g. "binance").
 * @param patch    - Fields to set on insert conflict update.
 * @returns The upserted SymbolStateRow.
 */
export async function upsertSymbolState(
  db: DbInstance,
  symbol: string,
  exchange: string,
  patch: SymbolStatePatch,
): Promise<SymbolStateRow> {
  const now = new Date();

  const insertValues: NewSymbolStateRow = {
    symbol,
    exchange,
    fsm_state: patch.fsm_state ?? "IDLE",
    execution_mode: patch.execution_mode ?? "analysis",
    daily_bias: patch.daily_bias ?? null,
    daily_open: patch.daily_open ?? null,
    session_box_high: patch.session_box_high ?? null,
    session_box_low: patch.session_box_low ?? null,
    losses_today: patch.losses_today ?? "0",
    losses_session: patch.losses_session ?? 0,
    losses_this_1h_5m: patch.losses_this_1h_5m ?? 0,
    losses_this_1h_1m: patch.losses_this_1h_1m ?? 0,
    updated_at: now,
  };

  // Build the SET clause for the conflict update path — only patch fields
  const updateSet: Record<string, unknown> = { updated_at: now };
  if (patch.fsm_state !== undefined) updateSet.fsm_state = patch.fsm_state;
  if (patch.execution_mode !== undefined) updateSet.execution_mode = patch.execution_mode;
  if (patch.daily_bias !== undefined) updateSet.daily_bias = patch.daily_bias;
  if (patch.daily_open !== undefined) updateSet.daily_open = patch.daily_open;
  if (patch.session_box_high !== undefined) updateSet.session_box_high = patch.session_box_high;
  if (patch.session_box_low !== undefined) updateSet.session_box_low = patch.session_box_low;
  if (patch.losses_today !== undefined) updateSet.losses_today = patch.losses_today;
  if (patch.losses_session !== undefined) updateSet.losses_session = patch.losses_session;
  if (patch.losses_this_1h_5m !== undefined) updateSet.losses_this_1h_5m = patch.losses_this_1h_5m;
  if (patch.losses_this_1h_1m !== undefined) updateSet.losses_this_1h_1m = patch.losses_this_1h_1m;

  const rows = await db
    .insert(symbolStateTable)
    .values(insertValues)
    .onConflictDoUpdate({
      target: [symbolStateTable.symbol, symbolStateTable.exchange],
      set: updateSet,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error(`upsertSymbolState: no row returned for ${symbol}@${exchange}`);
  }

  return row;
}

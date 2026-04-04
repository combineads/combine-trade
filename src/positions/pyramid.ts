/**
 * Pyramid (add-on entry) logic — condition check + execution.
 *
 * - canPyramid(): PURE function — no DB imports. Checks whether a ticket
 *   qualifies for a pyramid (2nd) entry based on state, SL position, and count.
 * - executePyramid(): DB function — creates a child ticket via sizer +
 *   injected entry executor + direct ticket insert. Caller provides the
 *   executeEntry callback so this module stays within L5 (no L6 import).
 * - loadPyramidConfig(): Reads max_pyramid_count from CommonCode table.
 *
 * Layer: L5 (positions)
 */

import { and, eq } from "drizzle-orm";
import type { Decimal } from "@/core/decimal";
import { gte, lte } from "@/core/decimal";
import { createLogger } from "@/core/logger";
import type { ExchangeAdapter, ExchangeSymbolInfo } from "@/core/ports";
import type { Direction, Exchange, TicketState } from "@/core/types";
import type { DbInstance } from "@/db/pool";
import type { TicketRow } from "@/db/schema";
import { commonCodeTable, ticketTable } from "@/db/schema";
import { calculateSize, getRiskPct } from "./sizer";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger("pyramid");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PyramidConfig = {
  /** Maximum number of pyramid entries allowed per parent ticket */
  maxPyramidCount: number;
};

export type PyramidCheckResult = {
  /** Whether pyramid entry is allowed */
  allowed: boolean;
  /** Human-readable reason when not allowed */
  reason?: string;
};

/**
 * Result shape returned by the executeEntry callback.
 * Matches the subset of ExecuteEntryResult that executePyramid needs.
 * Defined here to avoid importing from L6 (orders).
 */
export type EntryResult = {
  success: boolean;
  entryOrder: { filled_price: string | null } | null;
  abortReason?: string;
};

/**
 * Slippage configuration passed through to the entry executor.
 * Defined here to avoid importing from L6 (orders).
 */
export type PyramidSlippageConfig = {
  maxSpreadPct: Decimal;
};

/** Callback type for entry execution — injected by the caller (L6+). */
export type ExecuteEntryFn = (params: {
  adapter: ExchangeAdapter;
  symbol: string;
  exchange: Exchange;
  mode: "live";
  direction: Direction;
  entryPrice: Decimal;
  slPrice: Decimal;
  size: Decimal;
  leverage: number;
  slippageConfig: PyramidSlippageConfig;
}) => Promise<EntryResult>;

export type ExecutePyramidParams = {
  db: DbInstance;
  adapter: ExchangeAdapter;
  parentTicket: TicketRow;
  signal: {
    id: string;
    entryPrice: Decimal;
    slPrice: Decimal;
    direction: Direction;
    timeframe: "5M" | "1M";
    tp1Price?: Decimal;
    tp2Price?: Decimal;
  };
  balance: Decimal;
  exchangeInfo: ExchangeSymbolInfo;
  slippageConfig: PyramidSlippageConfig;
  config: PyramidConfig;
  /** Injected entry executor (from L6 orders layer) */
  executeEntry: ExecuteEntryFn;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default max pyramid count matching CommonCode POSITION.max_pyramid_count */
const DEFAULT_MAX_PYRAMID_COUNT = 2;

/** Ticket states that indicate TP1 has been reached (or beyond) */
const PYRAMID_ELIGIBLE_STATES = new Set<string>(["TP1_HIT", "TP2_HIT"]);

// ---------------------------------------------------------------------------
// canPyramid — PURE function (no DB)
// ---------------------------------------------------------------------------

/**
 * Checks whether a ticket is eligible for a pyramid (add-on) entry.
 *
 * Conditions (all must be true):
 * 1. state is TP1_HIT or TP2_HIT (TP1 reached)
 * 2. SL is at or beyond breakeven:
 *    - LONG: current_sl_price >= entry_price
 *    - SHORT: current_sl_price <= entry_price
 * 3. pyramid_count < maxPyramidCount
 *
 * @param ticket - The parent ticket row (from DB; numeric fields are string|null)
 * @param config - Pyramid configuration with maxPyramidCount
 * @returns PyramidCheckResult with allowed flag and optional reason
 */
export function canPyramid(ticket: TicketRow, config: PyramidConfig): PyramidCheckResult {
  const state = ticket.state as TicketState;
  const direction = ticket.direction as Direction;
  const pyramidCount = ticket.pyramid_count ?? 0;

  // 1. Check state — must have reached TP1
  if (!PYRAMID_ELIGIBLE_STATES.has(state)) {
    return { allowed: false, reason: "TP1 not reached" };
  }

  // 2. Check SL at breakeven
  const entryPrice = ticket.entry_price;
  const currentSlPrice = ticket.current_sl_price;

  if (entryPrice == null || currentSlPrice == null) {
    return { allowed: false, reason: "SL not at breakeven (missing price data)" };
  }

  const isBreakeven =
    direction === "LONG" ? gte(currentSlPrice, entryPrice) : lte(currentSlPrice, entryPrice);

  if (!isBreakeven) {
    return { allowed: false, reason: "SL not at breakeven" };
  }

  // 3. Check pyramid count
  if (pyramidCount >= config.maxPyramidCount) {
    return { allowed: false, reason: "max pyramid reached" };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// executePyramid — DB function
// ---------------------------------------------------------------------------

/**
 * Executes a pyramid (2nd) entry:
 * 1. Calculates position size using current balance (not original)
 * 2. Executes entry order via injected executeEntry callback
 * 3. Creates a child ticket with parent_ticket_id set
 * 4. Increments parent ticket's pyramid_count
 *
 * @returns The newly created child ticket row
 * @throws If sizing fails, entry fails, or DB operations fail
 */
export async function executePyramid(params: ExecutePyramidParams): Promise<TicketRow> {
  const {
    db,
    adapter,
    parentTicket,
    signal,
    balance,
    exchangeInfo,
    slippageConfig,
    config,
    executeEntry: execEntry,
  } = params;

  const direction = signal.direction;
  const symbol = parentTicket.symbol;
  const exchange = parentTicket.exchange;

  log.info("executePyramid started", {
    parentTicketId: parentTicket.id,
    symbol,
    exchange,
    direction,
    balance: balance.toString(),
  });

  // 1. Verify pyramid is allowed
  const check = canPyramid(parentTicket, config);
  if (!check.allowed) {
    throw new Error(`Pyramid not allowed: ${check.reason}`);
  }

  // 2. Calculate size using current balance (not original)
  const riskPct = getRiskPct(balance);
  const sizeResult = calculateSize({
    balance,
    entryPrice: signal.entryPrice,
    slPrice: signal.slPrice,
    direction,
    exchangeInfo,
    riskPct,
  });

  if (sizeResult === null) {
    throw new Error("Pyramid sizing failed: position size below minimum or balance insufficient");
  }

  log.info("pyramid size calculated", {
    size: sizeResult.size.toString(),
    leverage: sizeResult.leverage.toString(),
    riskPct: riskPct.toString(),
  });

  // 3. Execute entry order via injected callback
  const entryResult = await execEntry({
    adapter,
    symbol,
    exchange: exchange as Exchange,
    mode: "live",
    direction,
    entryPrice: signal.entryPrice,
    slPrice: signal.slPrice,
    size: sizeResult.size,
    leverage: sizeResult.leverage,
    slippageConfig,
  });

  if (!entryResult.success) {
    throw new Error(`Pyramid entry failed: ${entryResult.abortReason ?? "unknown"}`);
  }

  // 4. Create child ticket with parent_ticket_id
  const childTicket = await db.transaction(async (tx) => {
    // Insert child ticket directly (bypass createTicket FSM check since
    // we're already in HAS_POSITION state — pyramid is a special case)
    const filledPrice = entryResult.entryOrder?.filled_price
      ? entryResult.entryOrder.filled_price
      : signal.entryPrice.toString();

    const now = new Date();
    const inserted = await tx
      .insert(ticketTable)
      .values({
        symbol,
        exchange,
        signal_id: signal.id,
        parent_ticket_id: parentTicket.id,
        timeframe: signal.timeframe,
        direction,
        state: "INITIAL",
        entry_price: filledPrice,
        sl_price: signal.slPrice.toString(),
        current_sl_price: signal.slPrice.toString(),
        size: sizeResult.size.toString(),
        remaining_size: sizeResult.size.toString(),
        leverage: sizeResult.leverage,
        tp1_price: signal.tp1Price?.toString() ?? null,
        tp2_price: signal.tp2Price?.toString() ?? null,
        opened_at: now,
      })
      .returning();

    const child = inserted[0];
    if (!child) {
      throw new Error("executePyramid: INSERT child ticket did not return a row");
    }

    // 5. Increment parent's pyramid_count
    const parentCount = parentTicket.pyramid_count ?? 0;
    await tx
      .update(ticketTable)
      .set({
        pyramid_count: parentCount + 1,
        updated_at: now,
      })
      .where(eq(ticketTable.id, parentTicket.id));

    return child;
  });

  log.info("executePyramid completed", {
    parentTicketId: parentTicket.id,
    childTicketId: childTicket.id,
    pyramidCount: ((parentTicket.pyramid_count ?? 0) + 1).toString(),
  });

  return childTicket;
}

// ---------------------------------------------------------------------------
// loadPyramidConfig — DB read
// ---------------------------------------------------------------------------

/**
 * Loads pyramid configuration from the CommonCode table.
 *
 * Reads `POSITION.max_pyramid_count` row (must be active).
 * Falls back to default (2) when:
 *  - The row does not exist
 *  - `is_active` is false
 *  - The stored value is not a valid positive integer
 *
 * @param db - Drizzle ORM instance
 * @returns Resolved PyramidConfig
 */
export async function loadPyramidConfig(db: DbInstance): Promise<PyramidConfig> {
  const rows = await db
    .select({ value: commonCodeTable.value })
    .from(commonCodeTable)
    .where(
      and(
        eq(commonCodeTable.group_code, "POSITION"),
        eq(commonCodeTable.code, "max_pyramid_count"),
        eq(commonCodeTable.is_active, true),
      ),
    )
    .limit(1);

  const firstRow = rows[0];

  if (firstRow === undefined) {
    return { maxPyramidCount: DEFAULT_MAX_PYRAMID_COUNT };
  }

  const raw = firstRow.value;

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && Number.isInteger(raw)) {
    return { maxPyramidCount: raw };
  }

  if (typeof raw === "string") {
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return { maxPyramidCount: parsed };
    }
  }

  return { maxPyramidCount: DEFAULT_MAX_PYRAMID_COUNT };
}

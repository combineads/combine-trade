/**
 * Transfer routes — GET /transfers, POST /transfers/trigger
 *
 * Endpoints:
 * - GET  /transfers         — EventLog history (TRANSFER_* events), cursor pagination
 * - POST /transfers/trigger — manual immediate transfer trigger
 *
 * Layer: L8 (api) — may import L0-L7.
 */

import { Hono } from "hono";
import type { TransferResult } from "@/transfer/executor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Row shape returned by the DI query function.
 */
export type TransferEventRow = {
  id: string;
  event_type: string;
  symbol: string | null;
  exchange: string | null;
  data: unknown;
  created_at: string;
};

/**
 * Dependency injection interface for transfer routes.
 */
export type TransfersDeps = {
  /**
   * Returns transfer events from EventLog ordered by created_at DESC.
   *
   * @param cursor  ISO datetime string — only return rows WHERE created_at < cursor
   * @param limit   Maximum number of rows to return (already includes +1 for hasMore detection)
   */
  getTransferHistory(cursor: string | undefined, limit: number): Promise<TransferEventRow[]>;

  /**
   * Execute an immediate transfer for the given exchange.
   *
   * @param exchange  Exchange identifier (e.g. "binance")
   */
  triggerTransfer(exchange: string): Promise<TransferResult>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const VALID_EXCHANGES = new Set(["binance", "okx", "bitget", "mexc"]);

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates the transfers sub-router.
 *
 * GET  /transfers         — transfer event history with cursor pagination.
 * POST /transfers/trigger — immediate manual transfer trigger.
 */
export function createTransferRoutes(deps: TransfersDeps): Hono {
  const router = new Hono();

  // ---- GET /transfers ----
  router.get("/transfers", async (c) => {
    const cursorParam = c.req.query("cursor");
    const cursor = cursorParam !== undefined && cursorParam.length > 0 ? cursorParam : undefined;

    const limitParam = c.req.query("limit");
    let limit = DEFAULT_LIMIT;
    if (limitParam !== undefined) {
      const parsed = Number.parseInt(limitParam, 10);
      if (Number.isNaN(parsed) || parsed < 1) {
        return c.json({ error: "Invalid limit" }, 400);
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    // Fetch limit+1 rows to determine whether there is a next page
    const rows = await deps.getTransferHistory(cursor, limit + 1);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = data[data.length - 1];
    const nextCursor = hasMore && lastItem !== undefined ? lastItem.created_at : null;

    return c.json({ data, nextCursor });
  });

  // ---- POST /transfers/trigger ----
  router.post("/transfers/trigger", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const exchangeRaw = body.exchange;
    const exchange = typeof exchangeRaw === "string" ? exchangeRaw : "binance";

    if (!VALID_EXCHANGES.has(exchange)) {
      return c.json(
        { error: `Invalid exchange. Must be one of: ${[...VALID_EXCHANGES].join(", ")}` },
        400,
      );
    }

    const result = await deps.triggerTransfer(exchange);

    return c.json({ success: result.success, result }, 200);
  });

  return router;
}

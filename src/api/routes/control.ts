/**
 * Control routes — mode, kill-switch, trade-blocks CRUD.
 *
 * Endpoints:
 * - PUT  /mode              — switch execution mode (analysis|alert|live)
 * - POST /kill-switch       — trigger kill-switch (close all positions, cancel orders)
 * - POST /trade-blocks      — create a manual trade block
 * - DELETE /trade-blocks/:id — delete a trade block
 *
 * All actions record an EventLog entry via deps.recordEvent.
 *
 * Layer: L8 (api) — route handler only, no DB access.
 */

import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Valid execution modes. */
export type ExecutionMode = "analysis" | "alert" | "live";

/** Kill-switch result shape. */
export type KillSwitchResult = {
  positions_closed: number;
  orders_cancelled: number;
  errors: string[];
};

/** Input for creating a trade block. */
export type TradeBlockInput = {
  block_type: "MANUAL";
  reason: string;
  start_time: string;
  end_time: string;
};

/** Dependency injection interface for control routes. */
export type ControlDeps = {
  /** Update execution mode for all symbol×exchange pairs */
  updateMode(mode: ExecutionMode): Promise<void>;

  /** Trigger kill-switch: close all positions, cancel all orders */
  killSwitch(): Promise<KillSwitchResult>;

  /** Create a trade block record */
  createTradeBlock(input: TradeBlockInput): Promise<Record<string, unknown>>;

  /** Delete a trade block by ID. Returns true if found and deleted. */
  deleteTradeBlock(id: string): Promise<boolean>;

  /** Record an event to the EventLog */
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_MODES = new Set<string>(["analysis", "alert", "live"]);

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates control routes as a Hono sub-router.
 *
 * Routes:
 * - PUT  /mode              -> { mode, warning? }
 * - POST /kill-switch       -> { positions_closed, orders_cancelled, errors }
 * - POST /trade-blocks      -> created trade block
 * - DELETE /trade-blocks/:id -> { deleted: true } or 404
 */
export function createControlRoutes(deps: ControlDeps): Hono {
  const router = new Hono();

  // ---- PUT /mode ----
  router.put("/mode", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { mode } = body;

    if (typeof mode !== "string" || !VALID_MODES.has(mode)) {
      return c.json({ error: "Invalid mode. Must be one of: analysis, alert, live" }, 400);
    }

    const validMode = mode as ExecutionMode;

    await deps.updateMode(validMode);
    await deps.recordEvent("MODE_CHANGE", { mode: validMode });

    const response: { mode: string; warning?: string } = { mode: validMode };
    if (validMode === "live") {
      response.warning = "Live mode enables real trading";
    }

    return c.json(response, 200);
  });

  // ---- POST /kill-switch ----
  router.post("/kill-switch", async (c) => {
    try {
      const result = await deps.killSwitch();
      await deps.recordEvent("KILL_SWITCH", result as unknown as Record<string, unknown>);
      return c.json(result, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Kill switch failed";
      return c.json({ error: message }, 500);
    }
  });

  // ---- POST /trade-blocks ----
  router.post("/trade-blocks", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { reason, start_time, end_time } = body;

    if (typeof reason !== "string" || reason.length === 0) {
      return c.json({ error: "reason is required" }, 400);
    }
    if (typeof start_time !== "string" || start_time.length === 0) {
      return c.json({ error: "start_time is required" }, 400);
    }
    if (typeof end_time !== "string" || end_time.length === 0) {
      return c.json({ error: "end_time is required" }, 400);
    }

    const input: TradeBlockInput = {
      block_type: "MANUAL",
      reason,
      start_time,
      end_time,
    };

    const created = await deps.createTradeBlock(input);
    await deps.recordEvent("TRADE_BLOCK_CREATED", { reason });

    return c.json(created, 201);
  });

  // ---- DELETE /trade-blocks/:id ----
  router.delete("/trade-blocks/:id", async (c) => {
    const id = c.req.param("id");

    const found = await deps.deleteTradeBlock(id);
    if (!found) {
      return c.json({ error: "Trade block not found" }, 404);
    }

    await deps.recordEvent("TRADE_BLOCK_DELETED", { id });

    return c.json({ deleted: true }, 200);
  });

  return router;
}

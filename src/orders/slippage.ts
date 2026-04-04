import type Decimal from "decimal.js";
import { and, eq } from "drizzle-orm";

import { abs, d, div, lte, sub } from "@/core/decimal";
import type { DbInstance } from "@/db/pool";
import { commonCodeTable } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Result of a slippage check against the max-spread threshold. */
export type SlippageResult = {
  /** true when slippagePct <= maxSpreadPct (safe to continue). */
  passed: boolean;
  /** filledPrice - expectedPrice (signed: positive = filled higher). */
  slippage: Decimal;
  /** |slippage| / expectedPrice (always >= 0). */
  slippagePct: Decimal;
  /** The price the strategy expected to fill at. */
  expectedPrice: Decimal;
  /** The actual fill price from the exchange. */
  filledPrice: Decimal;
};

/** Config shape returned by loadSlippageConfig. */
export type SlippageConfig = {
  /** Maximum allowed slippage as a ratio (e.g. 0.05 = 5%). */
  maxSpreadPct: Decimal;
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default max spread percentage matching CommonCode SLIPPAGE.max_spread_pct */
const DEFAULT_MAX_SPREAD_PCT = d("0.05");

// ─── Pure function ────────────────────────────────────────────────────────────

/**
 * Checks whether the slippage between an expected fill price and the actual
 * fill price exceeds a maximum spread threshold.
 *
 * - `slippage = filledPrice - expectedPrice` (signed value)
 * - `slippagePct = |slippage| / expectedPrice` (always positive ratio)
 * - `passed = slippagePct <= maxSpreadPct`
 *
 * @param expectedPrice - The price the strategy expected to fill at.
 * @param filledPrice   - The actual fill price from the exchange.
 * @param maxSpreadPct  - Maximum allowed slippage ratio (e.g. 0.05 for 5%).
 * @returns SlippageResult with pass/fail verdict and numeric details.
 * @throws When expectedPrice is zero (division by zero).
 */
export function checkSlippage(
  expectedPrice: Decimal,
  filledPrice: Decimal,
  maxSpreadPct: Decimal,
): SlippageResult {
  const slippage = sub(filledPrice, expectedPrice);
  const slippagePct = div(abs(slippage), expectedPrice);
  const passed = lte(slippagePct, maxSpreadPct);

  return {
    passed,
    slippage,
    slippagePct,
    expectedPrice,
    filledPrice,
  };
}

// ─── Config loader (DB access) ────────────────────────────────────────────────

/**
 * Loads the slippage threshold from CommonCode table.
 *
 * Reads `SLIPPAGE.max_spread_pct` row (must be active).
 * Falls back to `{ maxSpreadPct: 0.05 }` (5%) when:
 *  - The row does not exist
 *  - `is_active` is false
 *  - The stored value is not a valid positive number
 *
 * @param db - Drizzle ORM instance (from getDb()).
 * @returns Resolved SlippageConfig.
 */
export async function loadSlippageConfig(db: DbInstance): Promise<SlippageConfig> {
  const rows = await db
    .select({ value: commonCodeTable.value })
    .from(commonCodeTable)
    .where(
      and(
        eq(commonCodeTable.group_code, "SLIPPAGE"),
        eq(commonCodeTable.code, "max_spread_pct"),
        eq(commonCodeTable.is_active, true),
      ),
    )
    .limit(1);

  const firstRow = rows[0];

  if (firstRow === undefined) {
    return { maxSpreadPct: DEFAULT_MAX_SPREAD_PCT };
  }

  const raw = firstRow.value;

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return { maxSpreadPct: d(raw.toString()) };
  }

  if (typeof raw === "string") {
    try {
      const parsed = d(raw);
      if (parsed.isPositive() && parsed.isFinite()) {
        return { maxSpreadPct: parsed };
      }
    } catch {
      // Invalid string — fall through to default
    }
  }

  return { maxSpreadPct: DEFAULT_MAX_SPREAD_PCT };
}

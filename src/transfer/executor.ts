import type { Decimal } from "@/core/decimal";
import type { ExchangeAdapter } from "@/core/ports";
import type { TransferableParams, TransferableResult } from "./balance";
import { calculateTransferable } from "./balance";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransferResult = {
  success: boolean;
  transferable: TransferableResult;
  balanceBefore?: Decimal;
  balanceAfter?: Decimal;
  error?: string;
};

export type TransferExecutorDeps = {
  adapter: ExchangeAdapter;
  getTransferParams: () => Promise<TransferableParams>;
  logEvent: (eventType: string, data: Record<string, unknown>) => Promise<void>;
};

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise<void>((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
  // Unreachable — loop always throws on final attempt
  throw new Error("unreachable");
}

// ─── Executor ─────────────────────────────────────────────────────────────────

/**
 * Executes a futures → spot internal transfer.
 *
 * Flow:
 *   1. Get transfer params via deps.getTransferParams()
 *   2. Calculate transferable balance
 *   3. If skip → log TRANSFER_SKIP, return
 *   4. Fetch balance_before
 *   5. Call adapter.transfer("USDT", amount, "future", "spot") with retry (3 attempts, exponential backoff)
 *   6. On success → fetch balance_after, log TRANSFER_SUCCESS
 *   7. On final failure → log TRANSFER_FAILED with error_message
 *
 * @param deps    Injected dependencies (adapter, params provider, logger)
 * @param exchange  Exchange identifier for logging (defaults to "unknown")
 */
export async function executeTransfer(
  deps: TransferExecutorDeps,
  exchange = "unknown",
): Promise<TransferResult> {
  const { adapter, getTransferParams, logEvent } = deps;

  const params = await getTransferParams();
  const transferable = calculateTransferable(params);

  if (transferable.skip) {
    await logEvent("TRANSFER_SKIP", {
      exchange,
      currency: "USDT",
      from: "future",
      to: "spot",
      skip_reason: transferable.skipReason ?? "skip",
      reserve: transferable.reserve,
      daily_profit: transferable.dailyProfit,
    });

    return { success: false, transferable };
  }

  const { transferAmount, reserve, dailyProfit } = transferable;
  const balanceBefore = (await adapter.fetchBalance()).total;

  try {
    await withRetry(() => adapter.transfer("USDT", transferAmount, "future", "spot"));

    const balanceAfter = (await adapter.fetchBalance()).total;

    await logEvent("TRANSFER_SUCCESS", {
      exchange,
      currency: "USDT",
      amount: transferAmount,
      from: "future",
      to: "spot",
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reserve,
      daily_profit: dailyProfit,
    });

    return { success: true, transferable, balanceBefore, balanceAfter };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await logEvent("TRANSFER_FAILED", {
      exchange,
      currency: "USDT",
      amount: transferAmount,
      from: "future",
      to: "spot",
      balance_before: balanceBefore,
      reserve,
      daily_profit: dailyProfit,
      error_message: errorMessage,
    });

    return { success: false, transferable, balanceBefore, error: errorMessage };
  }
}

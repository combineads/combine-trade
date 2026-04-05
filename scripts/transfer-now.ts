/**
 * transfer-now — Manual immediate transfer CLI.
 *
 * Usage:
 *   bun scripts/transfer-now.ts [--dry-run] [--exchange <name>]
 *
 * Options:
 *   --dry-run          Calculate transferable balance and print result — no actual transfer.
 *   --exchange <name>  Exchange to use (default: "binance").
 *
 * Exit codes: 0 = success, 1 = error.
 *
 * Layer: L0 (operational script — runs outside daemon)
 */

import { Decimal } from "@/core/decimal";
import type { ExchangePosition } from "@/core/ports";
import type { TransferableParams } from "@/transfer/balance";
import { calculateTransferable } from "@/transfer/balance";
import { executeTransfer } from "@/transfer/executor";
import { getDailyProfit } from "@/transfer/scheduler";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransferNowArgs = {
  dryRun: boolean;
  exchange: string;
};

// ─── Args parser ──────────────────────────────────────────────────────────────

/**
 * Parses CLI args into a typed TransferNowArgs object.
 * Exported for testability.
 */
export function parseArgs(args: string[]): TransferNowArgs {
  let dryRun = false;
  let exchange = "binance";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    }
    if (args[i] === "--exchange" && args[i + 1]) {
      exchange = args[i + 1] as string;
      i++; // skip the value token
    }
  }

  return { dryRun, exchange };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeOpenMargin(positions: ExchangePosition[]): Decimal {
  return positions.reduce(
    (sum, p) => sum.plus(p.size.mul(p.entryPrice).div(new Decimal(p.leverage))),
    new Decimal("0"),
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log(`[transfer-now] exchange=${args.exchange} dry-run=${args.dryRun}`);

  // ---- Init DB ----
  const { initDb, getDb, closePool } = await import("@/db/pool");
  await initDb();
  const db = getDb();

  // ---- Load config ----
  const { loadAllConfig, getCachedValue, getGroupConfig } = await import("@/config/loader");
  await loadAllConfig();

  const transferPct = getCachedValue<number>("TRANSFER", "transfer_pct");
  const minTransferUsdt = getCachedValue<string>("TRANSFER", "min_transfer_usdt");
  const reserveMultiplier = getCachedValue<number>("TRANSFER", "reserve_multiplier");

  // risk_pct: use the first active SYMBOL_CONFIG entry's risk_pct as global proxy.
  // Falls back to 0.03 (3%) if no symbol config is seeded.
  let riskPctStr = "0.03";
  try {
    const symbolConfigs = getGroupConfig("SYMBOL_CONFIG");
    const firstEntry = symbolConfigs.values().next().value as { risk_pct: string } | undefined;
    if (firstEntry?.risk_pct) {
      riskPctStr = firstEntry.risk_pct;
    }
  } catch {
    // SYMBOL_CONFIG group not seeded — use fallback
  }

  // ---- Create exchange adapter ----
  const { createExchangeAdapter } = await import("@/exchanges/index");
  const apiKeyEnvMap: Record<string, { key: string; secret: string }> = {
    binance: {
      key: process.env.BINANCE_API_KEY ?? "",
      secret: process.env.BINANCE_API_SECRET ?? "",
    },
    okx: { key: process.env.OKX_API_KEY ?? "", secret: process.env.OKX_API_SECRET ?? "" },
    bitget: {
      key: process.env.BITGET_API_KEY ?? "",
      secret: process.env.BITGET_API_SECRET ?? "",
    },
    mexc: { key: process.env.MEXC_API_KEY ?? "", secret: process.env.MEXC_API_SECRET ?? "" },
  };

  const exchangeCreds = apiKeyEnvMap[args.exchange];
  if (!exchangeCreds) {
    throw new Error(`Unknown exchange: ${args.exchange}`);
  }
  if (!exchangeCreds.key || !exchangeCreds.secret) {
    throw new Error(
      `Missing API credentials for exchange "${args.exchange}". ` +
        `Set ${args.exchange.toUpperCase()}_API_KEY and ${args.exchange.toUpperCase()}_API_SECRET.`,
    );
  }

  const adapter = createExchangeAdapter(
    args.exchange as Parameters<typeof createExchangeAdapter>[0],
    {
      apiKey: exchangeCreds.key,
      apiSecret: exchangeCreds.secret,
    },
  );

  if (args.dryRun) {
    // ---- Dry-run mode: calculate and print, no actual transfer ----
    const balance = await adapter.fetchBalance();
    const positions = await adapter.fetchPositions();
    const dailyProfit = await getDailyProfit(db, args.exchange);

    const openMargin = computeOpenMargin(positions);

    const params: TransferableParams = {
      walletBalance: balance.total,
      openMargin,
      dailyProfit,
      riskPct: new Decimal(riskPctStr),
      reserveMultiplier,
      transferPct,
      minTransferUsdt: new Decimal(minTransferUsdt),
    };

    const result = calculateTransferable(params);

    console.log("\n[transfer-now] Dry-run result:");
    console.log(`  walletBalance:  ${result.walletBalance.toFixed(2)} USDT`);
    console.log(`  openMargin:     ${result.openMargin.toFixed(2)} USDT`);
    console.log(`  reserve:        ${result.reserve.toFixed(2)} USDT`);
    console.log(`  dailyProfit:    ${result.dailyProfit.toFixed(2)} USDT`);
    console.log(`  transferAmount: ${result.transferAmount.toFixed(2)} USDT`);
    console.log(
      `  skip:           ${result.skip}${result.skipReason ? ` (${result.skipReason})` : ""}`,
    );
    console.log("\n[transfer-now] No transfer performed (dry-run mode).");
  } else {
    // ---- Normal mode: execute transfer ----
    const { insertEvent } = await import("@/db/event-log");

    const deps = {
      adapter,
      getTransferParams: async (): Promise<TransferableParams> => {
        const balance = await adapter.fetchBalance();
        const positions = await adapter.fetchPositions();
        const dailyProfit = await getDailyProfit(db, args.exchange);

        const openMargin = computeOpenMargin(positions);

        return {
          walletBalance: balance.total,
          openMargin,
          dailyProfit,
          riskPct: new Decimal(riskPctStr),
          reserveMultiplier,
          transferPct,
          minTransferUsdt: new Decimal(minTransferUsdt),
        };
      },
      logEvent: async (eventType: string, data: Record<string, unknown>): Promise<void> => {
        await insertEvent(db, { event_type: eventType, data });
      },
    };

    const result = await executeTransfer(deps, args.exchange);

    console.log("\n[transfer-now] Transfer result:");
    console.log(`  success:        ${result.success}`);
    console.log(`  transferAmount: ${result.transferable.transferAmount.toFixed(2)} USDT`);
    console.log(
      `  skip:           ${result.transferable.skip}${result.transferable.skipReason ? ` (${result.transferable.skipReason})` : ""}`,
    );
    if (result.balanceBefore !== undefined) {
      console.log(`  balanceBefore:  ${result.balanceBefore.toFixed(2)} USDT`);
    }
    if (result.balanceAfter !== undefined) {
      console.log(`  balanceAfter:   ${result.balanceAfter.toFixed(2)} USDT`);
    }
    if (result.error) {
      console.log(`  error:          ${result.error}`);
    }
  }

  await closePool();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[transfer-now] Fatal error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

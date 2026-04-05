import { Decimal } from "@/core/decimal";

// ─── Constants ────────────────────────────────────────────────────────────────

const RESERVE_FLOOR = new Decimal("50");

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransferableResult = {
  walletBalance: Decimal;
  openMargin: Decimal;
  dailyProfit: Decimal;
  reserve: Decimal;
  transferAmount: Decimal;
  skip: boolean;
  skipReason?: string;
};

export type TransferableParams = {
  walletBalance: Decimal;
  openMargin: Decimal;
  dailyProfit: Decimal; // SUM(당일 실현 PnL) — PRD §7.20
  riskPct: Decimal; // e.g. 0.03 (3%)
  reserveMultiplier: number; // e.g. 10
  transferPct: number; // e.g. 50 (50%)
  minTransferUsdt: Decimal; // e.g. 10
};

// ─── Calculator ───────────────────────────────────────────────────────────────

/**
 * Calculates the transferable amount from a futures account.
 *
 * PRD §7.20 formula:
 *   reserve = max(walletBalance × riskPct × reserveMultiplier, 50)
 *   amount  = max(0, dailyProfit) × transferPct / 100
 *   amount  = floor to 2 decimal places (never round up)
 *
 * Skip conditions (in order):
 *   1. dailyProfit ≤ 0                  → skip (no_daily_profit)
 *   2. amount < minTransferUsdt          → skip (below_min_transfer_usdt)
 *   3. walletBalance - amount < openMargin + reserve → skip (safety_check)
 */
export function calculateTransferable(params: TransferableParams): TransferableResult {
  const {
    walletBalance,
    openMargin,
    dailyProfit,
    riskPct,
    reserveMultiplier,
    transferPct,
    minTransferUsdt,
  } = params;

  // reserve = max(walletBalance × riskPct × reserveMultiplier, 50)
  const dynamicReserve = walletBalance.mul(riskPct).mul(new Decimal(reserveMultiplier));
  const reserve = Decimal.max(dynamicReserve, RESERVE_FLOOR);

  // Step 1: dailyProfit ≤ 0 → no transfer
  if (dailyProfit.lessThanOrEqualTo(new Decimal("0"))) {
    return {
      walletBalance,
      openMargin,
      dailyProfit,
      reserve,
      transferAmount: new Decimal("0"),
      skip: true,
      skipReason: "no_daily_profit",
    };
  }

  // amount = dailyProfit × transferPct / 100, floored to 2dp
  const rawAmount = dailyProfit.mul(new Decimal(transferPct)).div(new Decimal("100"));
  const transferAmount = rawAmount.toDecimalPlaces(2, Decimal.ROUND_DOWN);

  // Step 2: amount < minTransferUsdt → skip
  if (transferAmount.lessThan(minTransferUsdt)) {
    return {
      walletBalance,
      openMargin,
      dailyProfit,
      reserve,
      transferAmount,
      skip: true,
      skipReason: "below_min_transfer_usdt",
    };
  }

  // Step 3: safety check — balance after transfer must cover margin + reserve
  const balanceAfterTransfer = walletBalance.minus(transferAmount);
  const requiredBuffer = openMargin.plus(reserve);
  if (balanceAfterTransfer.lessThan(requiredBuffer)) {
    return {
      walletBalance,
      openMargin,
      dailyProfit,
      reserve,
      transferAmount,
      skip: true,
      skipReason: "safety_check: balance_after_transfer < margin + reserve",
    };
  }

  return {
    walletBalance,
    openMargin,
    dailyProfit,
    reserve,
    transferAmount,
    skip: false,
  };
}

import { Decimal } from "@/core/decimal";

// ─── Constants ────────────────────────────────────────────────────────────────

const RESERVE_FLOOR = new Decimal("50");

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransferableResult = {
  walletBalance: Decimal;
  openMargin: Decimal;
  reserve: Decimal;
  available: Decimal;
  transferAmount: Decimal;
  skip: boolean;
  skipReason?: string;
};

export type TransferableParams = {
  walletBalance: Decimal;
  openMargin: Decimal;
  riskPct: Decimal; // e.g. 0.03 (3%)
  reserveMultiplier: number; // e.g. 10
  transferPct: number; // e.g. 50 (50%)
  minTransferUsdt: Decimal; // e.g. 10
};

// ─── Calculator ───────────────────────────────────────────────────────────────

/**
 * Calculates the transferable balance from a futures account.
 *
 * Formula:
 *   reserve = max(walletBalance × riskPct × reserveMultiplier, 50)
 *   available = walletBalance - openMargin - reserve
 *   transferAmount = max(0, available) × transferPct / 100
 *   transferAmount = floor to 2 decimal places (never round up)
 *   if transferAmount < minTransferUsdt → skip=true
 */
export function calculateTransferable(params: TransferableParams): TransferableResult {
  const { walletBalance, openMargin, riskPct, reserveMultiplier, transferPct, minTransferUsdt } =
    params;

  // reserve = max(walletBalance × riskPct × reserveMultiplier, 50)
  const dynamicReserve = walletBalance.mul(riskPct).mul(new Decimal(reserveMultiplier));
  const reserve = Decimal.max(dynamicReserve, RESERVE_FLOOR);

  // available = walletBalance - openMargin - reserve
  const available = walletBalance.minus(openMargin).minus(reserve);

  // transferAmount = max(0, available) × transferPct / 100, floored to 2dp
  const positiveAvailable = Decimal.max(new Decimal("0"), available);
  const rawAmount = positiveAvailable.mul(new Decimal(transferPct)).div(new Decimal("100"));
  const transferAmount = rawAmount.toDecimalPlaces(2, Decimal.ROUND_DOWN);

  // Determine skip conditions
  if (transferAmount.lessThan(minTransferUsdt)) {
    return {
      walletBalance,
      openMargin,
      reserve,
      available,
      transferAmount,
      skip: true,
      skipReason: "below min_transfer_usdt",
    };
  }

  return {
    walletBalance,
    openMargin,
    reserve,
    available,
    transferAmount,
    skip: false,
  };
}

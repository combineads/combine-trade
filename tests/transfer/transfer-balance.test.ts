import { describe, expect, it } from "bun:test";
import { Decimal } from "../../src/core/decimal";
import {
  calculateTransferable,
  type TransferableParams,
} from "../../src/transfer/balance";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeParams = (overrides: Partial<TransferableParams> = {}): TransferableParams => ({
  walletBalance: new Decimal("1000"),
  openMargin: new Decimal("200"),
  dailyProfit: new Decimal("100"),
  riskPct: new Decimal("0.03"),
  reserveMultiplier: 10,
  transferPct: 50,
  minTransferUsdt: new Decimal("10"),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("transfer-balance", () => {
  describe("calculateTransferable()", () => {
    it("normal case: dailyProfit=100, transferPct=50 → amount=50", () => {
      // amount = max(0, 100) * 50 / 100 = 50
      const result = calculateTransferable(makeParams());

      expect(result.transferAmount.equals(new Decimal("50"))).toBe(true);
      expect(result.skip).toBe(false);
      expect(result.skipReason).toBeUndefined();
    });

    it("loss day: dailyProfit=-50 → skip (no transfer)", () => {
      const result = calculateTransferable(makeParams({ dailyProfit: new Decimal("-50") }));

      expect(result.transferAmount.equals(new Decimal("0"))).toBe(true);
      expect(result.skip).toBe(true);
      expect(result.skipReason).toContain("no_daily_profit");
    });

    it("zero profit: dailyProfit=0 → skip (no transfer)", () => {
      const result = calculateTransferable(makeParams({ dailyProfit: new Decimal("0") }));

      expect(result.transferAmount.equals(new Decimal("0"))).toBe(true);
      expect(result.skip).toBe(true);
      expect(result.skipReason).toContain("no_daily_profit");
    });

    it("below minimum: amount < minTransferUsdt → skip", () => {
      // amount = max(0, 10) * 50 / 100 = 5 < 10 → skip
      const result = calculateTransferable(
        makeParams({
          dailyProfit: new Decimal("10"),
          transferPct: 50,
          minTransferUsdt: new Decimal("10"),
        }),
      );

      expect(result.skip).toBe(true);
      expect(result.skipReason).toContain("min_transfer_usdt");
    });

    it("safety: balance - amount < margin + reserve → skip", () => {
      // reserve = max(1000 * 0.03 * 10, 50) = 300
      // amount = max(0, 900) * 50 / 100 = 450
      // balance - amount = 1000 - 450 = 550
      // margin + reserve = 200 + 300 = 500
      // 550 >= 500 → no skip (safety passes)
      // Now: walletBalance=600, openMargin=200, dailyProfit=900
      // reserve = max(600 * 0.03 * 10, 50) = max(180, 50) = 180
      // amount = max(0, 900) * 50 / 100 = 450
      // balance - amount = 600 - 450 = 150
      // margin + reserve = 200 + 180 = 380
      // 150 < 380 → safety skip
      const result = calculateTransferable(
        makeParams({
          walletBalance: new Decimal("600"),
          openMargin: new Decimal("200"),
          dailyProfit: new Decimal("900"),
        }),
      );

      expect(result.skip).toBe(true);
      expect(result.skipReason).toContain("safety");
    });

    it("reserve: max(balance × riskPct × reserveMultiplier, 50) preserved", () => {
      // reserve = max(1000 * 0.03 * 10, 50) = max(300, 50) = 300
      const result = calculateTransferable(makeParams());

      expect(result.reserve.equals(new Decimal("300"))).toBe(true);
    });

    it("reserve floor: max(10, 50) = 50 when balance=100, riskPct=0.01, multiplier=10", () => {
      // reserve = max(100 * 0.01 * 10, 50) = max(10, 50) = 50
      const result = calculateTransferable(
        makeParams({
          walletBalance: new Decimal("100"),
          openMargin: new Decimal("0"),
          riskPct: new Decimal("0.01"),
          dailyProfit: new Decimal("200"),
          minTransferUsdt: new Decimal("1"),
        }),
      );

      expect(result.reserve.equals(new Decimal("50"))).toBe(true);
    });

    it("floor: amount truncated to 2 decimal places (never round up)", () => {
      // amount = max(0, 111.579) * 50 / 100 = 55.7895 → floor to 55.78
      const result = calculateTransferable(
        makeParams({
          dailyProfit: new Decimal("111.579"),
          transferPct: 50,
          minTransferUsdt: new Decimal("10"),
        }),
      );

      expect(result.transferAmount.equals(new Decimal("55.78"))).toBe(true);
      expect(result.skip).toBe(false);
    });

    it("walletBalance and openMargin reflected in result", () => {
      const result = calculateTransferable(makeParams());

      expect(result.walletBalance.equals(new Decimal("1000"))).toBe(true);
      expect(result.openMargin.equals(new Decimal("200"))).toBe(true);
    });

    it("dailyProfit reflected in result", () => {
      const result = calculateTransferable(makeParams({ dailyProfit: new Decimal("100") }));

      expect(result.dailyProfit.equals(new Decimal("100"))).toBe(true);
    });

    it("safety passes: balance - amount >= margin + reserve → no skip", () => {
      // reserve = max(2000 * 0.03 * 10, 50) = 600
      // amount = max(0, 100) * 50 / 100 = 50
      // balance - amount = 2000 - 50 = 1950
      // margin + reserve = 200 + 600 = 800
      // 1950 >= 800 → safety passes, no skip
      const result = calculateTransferable(
        makeParams({
          walletBalance: new Decimal("2000"),
          dailyProfit: new Decimal("100"),
        }),
      );

      expect(result.skip).toBe(false);
      expect(result.transferAmount.equals(new Decimal("50"))).toBe(true);
    });
  });
});

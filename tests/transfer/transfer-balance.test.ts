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
  riskPct: new Decimal("0.03"),
  reserveMultiplier: 10,
  transferPct: 50,
  minTransferUsdt: new Decimal("10"),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("transfer-balance", () => {
  describe("calculateTransferable()", () => {
    it("normal case: reserve=300, available=500, transferAmount=250", () => {
      // reserve = max(1000 * 0.03 * 10, 50) = max(300, 50) = 300
      // available = 1000 - 200 - 300 = 500
      // transferAmount = 500 * 50 / 100 = 250
      const result = calculateTransferable(makeParams());

      expect(result.reserve.equals(new Decimal("300"))).toBe(true);
      expect(result.available.equals(new Decimal("500"))).toBe(true);
      expect(result.transferAmount.equals(new Decimal("250"))).toBe(true);
      expect(result.skip).toBe(false);
      expect(result.skipReason).toBeUndefined();
    });

    it("walletBalance and openMargin are reflected in result", () => {
      const result = calculateTransferable(makeParams());

      expect(result.walletBalance.equals(new Decimal("1000"))).toBe(true);
      expect(result.openMargin.equals(new Decimal("200"))).toBe(true);
    });

    it("reserve calculation: reserve=max(60,50)=60 when balance=200, risk=0.03, multiplier=10", () => {
      // reserve = max(200 * 0.03 * 10, 50) = max(60, 50) = 60
      const result = calculateTransferable(
        makeParams({
          walletBalance: new Decimal("200"),
          openMargin: new Decimal("0"),
        }),
      );

      expect(result.reserve.equals(new Decimal("60"))).toBe(true);
    });

    it("reserve minimum floor: reserve=max(10,50)=50 when balance=100, risk=0.01, multiplier=10", () => {
      // reserve = max(100 * 0.01 * 10, 50) = max(10, 50) = 50
      const result = calculateTransferable(
        makeParams({
          walletBalance: new Decimal("100"),
          openMargin: new Decimal("0"),
          riskPct: new Decimal("0.01"),
        }),
      );

      expect(result.reserve.equals(new Decimal("50"))).toBe(true);
    });

    it("negative available: transferAmount=0 and skip=true when walletBalance < openMargin + reserve", () => {
      // reserve = max(100 * 0.03 * 10, 50) = max(30, 50) = 50
      // available = 100 - 200 - 50 = -150  (negative)
      // transferAmount = max(0, -150) * 50 / 100 = 0
      const result = calculateTransferable(
        makeParams({
          walletBalance: new Decimal("100"),
          openMargin: new Decimal("200"),
        }),
      );

      expect(result.transferAmount.equals(new Decimal("0"))).toBe(true);
      expect(result.skip).toBe(true);
    });

    it("below minimum: skip=true and skipReason contains 'min_transfer_usdt' when transferAmount < minTransferUsdt", () => {
      // reserve = max(1000 * 0.03 * 10, 50) = 300
      // available = 1000 - 984 - 300 = -284 → wait, need to produce small positive amount
      // walletBalance=400, openMargin=380
      // reserve = max(400 * 0.03 * 10, 50) = max(120, 50) = 120
      // available = 400 - 380 - 120 = -100 → negative, skip
      // Use: walletBalance=400, openMargin=0
      // reserve = max(400 * 0.03 * 10, 50) = 120
      // available = 400 - 0 - 120 = 280
      // transferAmount = 280 * 3 / 100 = 8.4 < 10 → skip
      const result = calculateTransferable(
        makeParams({
          walletBalance: new Decimal("400"),
          openMargin: new Decimal("0"),
          transferPct: 3,
          minTransferUsdt: new Decimal("10"),
        }),
      );

      expect(result.skip).toBe(true);
      expect(result.skipReason).toContain("min_transfer_usdt");
    });

    it("floor: 55.789 → 55.78 (2 decimal floor, never round up)", () => {
      // We need transferAmount to be 55.789 before floor
      // transferAmount = available * transferPct / 100 = 55.789
      // available * 0.50 = 55.789 → available = 111.578
      // walletBalance - openMargin - reserve = 111.578
      // Use walletBalance=211.578, openMargin=50, reserve=50
      // reserve = max(211.578 * riskPct * multiplier, 50) = 50
      // need 211.578 * riskPct * 10 <= 50 → riskPct <= 0.02362...
      // Use riskPct=0.001 → reserve = max(211.578*0.001*10, 50) = max(2.11578, 50) = 50
      // available = 211.578 - 50 - 50 = 111.578
      // transferAmount = 111.578 * 50 / 100 = 55.789
      // floor to 2dp = 55.78
      const result = calculateTransferable(
        makeParams({
          walletBalance: new Decimal("211.578"),
          openMargin: new Decimal("50"),
          riskPct: new Decimal("0.001"),
          reserveMultiplier: 10,
          transferPct: 50,
          minTransferUsdt: new Decimal("10"),
        }),
      );

      expect(result.transferAmount.equals(new Decimal("55.78"))).toBe(true);
      expect(result.skip).toBe(false);
    });

    it("zero balance: transferAmount=0 and skip=true", () => {
      const result = calculateTransferable(
        makeParams({
          walletBalance: new Decimal("0"),
          openMargin: new Decimal("0"),
        }),
      );

      expect(result.transferAmount.equals(new Decimal("0"))).toBe(true);
      expect(result.skip).toBe(true);
    });
  });
});

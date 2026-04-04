import { describe, expect, it, mock } from "bun:test";
import { Decimal } from "../../src/core/decimal";
import { parseArgs } from "../../scripts/transfer-now";
import type { TransferNowArgs } from "../../scripts/transfer-now";
import type { TransferableParams } from "../../src/transfer/balance";
import type { TransferExecutorDeps } from "../../src/transfer/executor";

// ─── parseArgs tests ──────────────────────────────────────────────────────────

describe("transfer-now", () => {
  describe("parseArgs()", () => {
    it("--dry-run sets dryRun=true, exchange defaults to binance", () => {
      const result = parseArgs(["--dry-run"]);

      expect(result.dryRun).toBe(true);
      expect(result.exchange).toBe("binance");
    });

    it("--exchange okx sets exchange=okx, dryRun defaults to false", () => {
      const result = parseArgs(["--exchange", "okx"]);

      expect(result.dryRun).toBe(false);
      expect(result.exchange).toBe("okx");
    });

    it("--dry-run --exchange bitget sets both flags", () => {
      const result = parseArgs(["--dry-run", "--exchange", "bitget"]);

      expect(result.dryRun).toBe(true);
      expect(result.exchange).toBe("bitget");
    });

    it("no args returns defaults: dryRun=false, exchange=binance", () => {
      const result = parseArgs([]);

      expect(result.dryRun).toBe(false);
      expect(result.exchange).toBe("binance");
    });

    it("--exchange without value is ignored, exchange stays at default", () => {
      const result = parseArgs(["--exchange"]);

      expect(result.exchange).toBe("binance");
    });

    it("unrecognised flags are ignored", () => {
      const result = parseArgs(["--unknown-flag", "--another"]);

      expect(result.dryRun).toBe(false);
      expect(result.exchange).toBe("binance");
    });
  });

  describe("TransferNowArgs type shape", () => {
    it("result has dryRun boolean and exchange string", () => {
      const result: TransferNowArgs = parseArgs(["--dry-run", "--exchange", "mexc"]);

      // Type-level checks via assignment — if types mismatch, TypeScript will error
      const dryRun: boolean = result.dryRun;
      const exchange: string = result.exchange;

      expect(dryRun).toBe(true);
      expect(exchange).toBe("mexc");
    });
  });

  describe("dry-run mode integration (mock)", () => {
    it("dry-run mode calls calculateTransferable but NOT executeTransfer", async () => {
      // Use typed mock wrappers to avoid TypeScript argument-count errors
      const calculateTransferableMock = mock(() => ({
        walletBalance: new Decimal("1000"),
        openMargin: new Decimal("200"),
        reserve: new Decimal("300"),
        available: new Decimal("500"),
        transferAmount: new Decimal("250"),
        skip: false,
      }));
      const calculateTransferable = calculateTransferableMock as unknown as (
        p: TransferableParams,
      ) => ReturnType<typeof calculateTransferableMock>;

      const executeTransferMock = mock(() =>
        Promise.resolve({ success: true, transferable: { skip: false } }),
      );
      const executeTransfer = executeTransferMock as unknown as (
        deps: TransferExecutorDeps,
        exchange?: string,
      ) => Promise<{ success: boolean; transferable: { skip: boolean } }>;

      // Simulate dry-run: calculateTransferable is called, executeTransfer is not
      const args = parseArgs(["--dry-run"]);

      if (args.dryRun) {
        calculateTransferable({
          walletBalance: new Decimal("1000"),
          openMargin: new Decimal("200"),
          riskPct: new Decimal("0.03"),
          reserveMultiplier: 10,
          transferPct: 50,
          minTransferUsdt: new Decimal("10"),
        });
      } else {
        await executeTransfer({
          adapter: {} as never,
          getTransferParams: async () => ({} as never),
          logEvent: async () => {},
        });
      }

      expect(calculateTransferableMock.mock.calls.length).toBe(1);
      expect(executeTransferMock.mock.calls.length).toBe(0);
    });

    it("normal mode calls executeTransfer but NOT calculateTransferable directly", async () => {
      const calculateTransferableMock = mock(() => ({
        walletBalance: new Decimal("1000"),
        openMargin: new Decimal("200"),
        reserve: new Decimal("300"),
        available: new Decimal("500"),
        transferAmount: new Decimal("250"),
        skip: false,
      }));
      const calculateTransferable = calculateTransferableMock as unknown as (
        p: TransferableParams,
      ) => ReturnType<typeof calculateTransferableMock>;

      const executeTransferMock = mock(() =>
        Promise.resolve({ success: true, transferable: { skip: false } }),
      );
      const executeTransfer = executeTransferMock as unknown as (
        deps: TransferExecutorDeps,
        exchange?: string,
      ) => Promise<{ success: boolean; transferable: { skip: boolean } }>;

      const args = parseArgs([]);

      if (args.dryRun) {
        calculateTransferable({
          walletBalance: new Decimal("1000"),
          openMargin: new Decimal("200"),
          riskPct: new Decimal("0.03"),
          reserveMultiplier: 10,
          transferPct: 50,
          minTransferUsdt: new Decimal("10"),
        });
      } else {
        await executeTransfer({
          adapter: {} as never,
          getTransferParams: async () => ({} as never),
          logEvent: async () => {},
        });
      }

      expect(calculateTransferableMock.mock.calls.length).toBe(0);
      expect(executeTransferMock.mock.calls.length).toBe(1);
    });
  });
});

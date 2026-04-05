/**
 * T-19-007: reconciliation/worker.ts — Panic Close Slack @channel 테스트
 *
 * Test Scenarios:
 * - reconciliation worker panic close → sendSlackAlert message body contains "<!channel>"
 */

import { describe, expect, it } from "bun:test";
import { d } from "@/core/decimal";
import type { Exchange } from "@/core/types";
import { type ReconciliationDeps, runOnce } from "./worker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides?: Partial<ReconciliationDeps>): ReconciliationDeps {
  return {
    getActiveTickets: async () => [],
    getPendingSymbols: async () => new Set<string>(),
    emergencyClose: async () => {},
    setSymbolStateIdle: async () => {},
    insertEvent: async () => {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("T-19-007: reconciliation worker — panic close Slack @channel", () => {
  it("panic close → sendSlackAlert called with details containing '<!channel>'", async () => {
    const capturedCalls: Array<{
      eventType: string;
      details: Record<string, string | number | boolean | undefined>;
    }> = [];

    // Provide an unmatched exchange position (no matching ticket in DB)
    const adapters = new Map();
    adapters.set("binance", {
      fetchPositions: async () => [
        {
          symbol: "BTC/USDT",
          exchange: "binance" as Exchange,
          side: "long",
          size: d("0.1"),
          entryPrice: d("100"),
          unrealizedPnl: d("0"),
          markPrice: d("100"),
          marginMode: "cross",
          leverage: 10,
        },
      ],
    });

    const deps = makeDeps({
      getActiveTickets: async () => [], // no matching ticket → unmatched position
      sendSlackAlert: async (eventType, details) => {
        capturedCalls.push({ eventType, details });
      },
    });

    await runOnce(adapters as Parameters<typeof runOnce>[0], deps);

    // sendSlackAlert should have been called for the panic close
    expect(capturedCalls.length).toBeGreaterThan(0);

    const mismatchCall = capturedCalls.find((c) => c.eventType === "RECONCILIATION_MISMATCH");
    expect(mismatchCall).toBeDefined();

    // The details must contain slackPrefix = "<!channel>"
    const details = mismatchCall?.details ?? {};
    const hasChannelMention = Object.values(details).some(
      (v) => typeof v === "string" && v.includes("<!channel>"),
    );
    expect(hasChannelMention).toBe(true);
  });

  it("no panic close → sendSlackAlert not called", async () => {
    const capturedCalls: string[] = [];

    const adapters = new Map(); // no exchange adapters → no positions

    const deps = makeDeps({
      sendSlackAlert: async (eventType) => {
        capturedCalls.push(eventType);
      },
    });

    await runOnce(adapters as Parameters<typeof runOnce>[0], deps);

    // No unmatched positions → no panic close → no RECONCILIATION_MISMATCH alert
    const mismatchCalls = capturedCalls.filter((e) => e === "RECONCILIATION_MISMATCH");
    expect(mismatchCalls.length).toBe(0);
  });
});

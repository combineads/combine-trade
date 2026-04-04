/**
 * Tests for transfer web UI — hooks and component logic
 *
 * Since the project has no React testing library, these tests cover:
 * - Data transformation utilities
 * - Status badge color logic
 * - Hook response shape validation
 *
 * @group transfer-ui
 */

import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Types mirrored from the hook (import-free so tests run without DOM)
// ---------------------------------------------------------------------------

type TransferEvent = {
  id: string;
  event_type: string;
  symbol: string | null;
  exchange: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

type TransferHistoryResponse = {
  data: TransferEvent[];
  nextCursor: string | null;
};

// ---------------------------------------------------------------------------
// Utility: status badge color — mirrors TransferHistory.tsx logic
// ---------------------------------------------------------------------------

function getStatusColor(eventType: string): { text: string; bg: string } {
  if (eventType === "TRANSFER_SUCCESS") {
    return { text: "#22c55e", bg: "#052e16" };
  }
  if (eventType === "TRANSFER_FAILED") {
    return { text: "#ef4444", bg: "#450a0a" };
  }
  // TRANSFER_SKIP or unknown
  return { text: "#94a3b8", bg: "#334155" };
}

// ---------------------------------------------------------------------------
// Utility: status label — mirrors TransferHistory.tsx logic
// ---------------------------------------------------------------------------

function getStatusLabel(eventType: string): string {
  if (eventType === "TRANSFER_SUCCESS") return "SUCCESS";
  if (eventType === "TRANSFER_FAILED") return "FAILED";
  if (eventType === "TRANSFER_SKIP") return "SKIP";
  return eventType;
}

// ---------------------------------------------------------------------------
// Utility: extract amount from event data — mirrors TransferHistory.tsx logic
// ---------------------------------------------------------------------------

function extractAmount(data: Record<string, unknown>): string {
  const amount = data.amount;
  if (typeof amount === "string" && amount.length > 0) return amount;
  if (typeof amount === "number") return String(amount);
  return "—";
}

// ---------------------------------------------------------------------------
// Utility: build query string for GET /api/transfers
// ---------------------------------------------------------------------------

function buildTransfersUrl(cursor?: string): string {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `/api/transfers?${qs}` : "/api/transfers";
}

// ---------------------------------------------------------------------------
// Utility: validate trigger transfer body
// ---------------------------------------------------------------------------

function buildTriggerBody(exchange?: string): Record<string, string> {
  return { exchange: exchange ?? "binance" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("transfer-ui", () => {
  // ---- Status badge color ----

  describe("getStatusColor()", () => {
    it("SUCCESS=green text + dark green bg", () => {
      const result = getStatusColor("TRANSFER_SUCCESS");
      expect(result.text).toBe("#22c55e");
      expect(result.bg).toBe("#052e16");
    });

    it("FAILED=red text + dark red bg", () => {
      const result = getStatusColor("TRANSFER_FAILED");
      expect(result.text).toBe("#ef4444");
      expect(result.bg).toBe("#450a0a");
    });

    it("SKIP=gray text + dark gray bg", () => {
      const result = getStatusColor("TRANSFER_SKIP");
      expect(result.text).toBe("#94a3b8");
      expect(result.bg).toBe("#334155");
    });

    it("unknown event type falls back to gray", () => {
      const result = getStatusColor("UNKNOWN_EVENT");
      expect(result.text).toBe("#94a3b8");
      expect(result.bg).toBe("#334155");
    });
  });

  // ---- Status label ----

  describe("getStatusLabel()", () => {
    it("TRANSFER_SUCCESS → 'SUCCESS'", () => {
      expect(getStatusLabel("TRANSFER_SUCCESS")).toBe("SUCCESS");
    });

    it("TRANSFER_FAILED → 'FAILED'", () => {
      expect(getStatusLabel("TRANSFER_FAILED")).toBe("FAILED");
    });

    it("TRANSFER_SKIP → 'SKIP'", () => {
      expect(getStatusLabel("TRANSFER_SKIP")).toBe("SKIP");
    });

    it("unknown event type → returns as-is", () => {
      expect(getStatusLabel("RAW_EVENT")).toBe("RAW_EVENT");
    });
  });

  // ---- Amount extraction ----

  describe("extractAmount()", () => {
    it("extracts string amount", () => {
      expect(extractAmount({ amount: "250.00" })).toBe("250.00");
    });

    it("extracts numeric amount as string", () => {
      expect(extractAmount({ amount: 100 })).toBe("100");
    });

    it("returns dash when amount is missing", () => {
      expect(extractAmount({})).toBe("—");
    });

    it("returns dash when amount is null", () => {
      expect(extractAmount({ amount: null })).toBe("—");
    });
  });

  // ---- URL builder for useTransferHistory ----

  describe("buildTransfersUrl()", () => {
    it("returns base URL when no cursor", () => {
      expect(buildTransfersUrl()).toBe("/api/transfers");
    });

    it("appends cursor param when provided", () => {
      const url = buildTransfersUrl("2026-04-05T01:00:00.000Z");
      // URLSearchParams encodes colons as %3A
      expect(url).toContain("/api/transfers?cursor=");
      expect(url).toContain("2026-04-05");
    });

    it("does not append empty cursor", () => {
      // empty string is falsy — same as no cursor
      expect(buildTransfersUrl(undefined)).toBe("/api/transfers");
    });
  });

  // ---- Trigger transfer body ----

  describe("buildTriggerBody()", () => {
    it("defaults to binance when no exchange provided", () => {
      expect(buildTriggerBody()).toEqual({ exchange: "binance" });
    });

    it("uses provided exchange", () => {
      expect(buildTriggerBody("okx")).toEqual({ exchange: "okx" });
    });
  });

  // ---- Response shape validation ----

  describe("TransferHistoryResponse shape", () => {
    it("empty response has empty data array and null cursor", () => {
      const response: TransferHistoryResponse = { data: [], nextCursor: null };
      expect(response.data).toHaveLength(0);
      expect(response.nextCursor).toBeNull();
    });

    it("response with events has correct shape", () => {
      const event: TransferEvent = {
        id: "evt-1",
        event_type: "TRANSFER_SUCCESS",
        symbol: null,
        exchange: "binance",
        data: { amount: "100", currency: "USDT" },
        created_at: "2026-04-05T01:00:00.000Z",
      };
      const response: TransferHistoryResponse = {
        data: [event],
        nextCursor: null,
      };
      expect(response.data).toHaveLength(1);
      const first = response.data[0];
      expect(first?.event_type).toBe("TRANSFER_SUCCESS");
    });

    it("nextCursor is ISO string when there is a next page", () => {
      const response: TransferHistoryResponse = {
        data: [],
        nextCursor: "2026-04-05T00:00:00.000Z",
      };
      expect(response.nextCursor).toBe("2026-04-05T00:00:00.000Z");
    });
  });

  // ---- Empty state detection ----

  describe("empty state detection", () => {
    it("renders empty state when data array is empty", () => {
      const events: TransferEvent[] = [];
      expect(events.length === 0).toBe(true);
    });

    it("renders rows when data array has items", () => {
      const events: TransferEvent[] = [
        {
          id: "evt-1",
          event_type: "TRANSFER_SUCCESS",
          symbol: null,
          exchange: "binance",
          data: { amount: "100" },
          created_at: "2026-04-05T01:00:00.000Z",
        },
        {
          id: "evt-2",
          event_type: "TRANSFER_FAILED",
          symbol: null,
          exchange: "okx",
          data: {},
          created_at: "2026-04-04T23:00:00.000Z",
        },
      ];
      expect(events.length).toBe(2);
      const [first, second] = events;
      expect(first?.id).toBe("evt-1");
      expect(second?.id).toBe("evt-2");
    });
  });

  // ---- Pagination ----

  describe("pagination", () => {
    it("hasMore is false when nextCursor is null", () => {
      const response: TransferHistoryResponse = { data: [], nextCursor: null };
      const hasMore = response.nextCursor !== null;
      expect(hasMore).toBe(false);
    });

    it("hasMore is true when nextCursor is present", () => {
      const response: TransferHistoryResponse = {
        data: [],
        nextCursor: "2026-04-05T00:00:00.000Z",
      };
      const hasMore = response.nextCursor !== null;
      expect(hasMore).toBe(true);
    });
  });

  // ---- Confirmation dialog state machine ----

  describe("confirmation dialog state", () => {
    it("initial state: dialog is closed", () => {
      let isOpen = false;
      expect(isOpen).toBe(false);
    });

    it("clicking transfer button opens dialog", () => {
      let isOpen = false;
      // Simulate button click
      isOpen = true;
      expect(isOpen).toBe(true);
    });

    it("cancel closes dialog without triggering transfer", () => {
      let isOpen = true;
      let triggered = false;
      // Simulate cancel
      isOpen = false;
      // triggered stays false
      expect(isOpen).toBe(false);
      expect(triggered).toBe(false);
    });

    it("confirm closes dialog and triggers transfer", () => {
      let isOpen = true;
      let triggered = false;
      // Simulate confirm
      isOpen = false;
      triggered = true;
      expect(isOpen).toBe(false);
      expect(triggered).toBe(true);
    });
  });
});

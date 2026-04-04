import { describe, expect, it } from "bun:test";
import { d } from "@/core/decimal";
import type { ExchangePosition } from "@/core/ports";
import type { Direction, Exchange } from "@/core/types";
import {
  comparePositions,
  isRecentTicket,
  type TicketSnapshot,
} from "@/reconciliation/comparator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePosition(overrides: Partial<ExchangePosition> = {}): ExchangePosition {
  return {
    symbol: "BTCUSDT",
    exchange: "binance" as Exchange,
    side: "LONG" as Direction,
    size: d("1.5"),
    entryPrice: d("50000"),
    unrealizedPnl: d("100"),
    leverage: 10,
    liquidationPrice: d("45000"),
    ...overrides,
  };
}

function makeTicket(overrides: Partial<TicketSnapshot> = {}): TicketSnapshot {
  return {
    id: "ticket-1",
    symbol: "BTCUSDT",
    exchange: "binance" as Exchange,
    direction: "LONG" as Direction,
    state: "INITIAL",
    created_at: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

const SNAPSHOT_TIME = new Date("2024-01-01T12:00:00Z");

// ---------------------------------------------------------------------------
// isRecentTicket
// ---------------------------------------------------------------------------

describe("comparator — isRecentTicket", () => {
  it("returns false when ticket was created before snapshotTime", () => {
    const ticket = makeTicket({ created_at: new Date("2024-01-01T11:00:00Z") });
    expect(isRecentTicket(ticket, SNAPSHOT_TIME)).toBe(false);
  });

  it("returns true when ticket was created after snapshotTime", () => {
    const ticket = makeTicket({ created_at: new Date("2024-01-01T13:00:00Z") });
    expect(isRecentTicket(ticket, SNAPSHOT_TIME)).toBe(true);
  });

  it("returns false when ticket was created exactly at snapshotTime", () => {
    const ticket = makeTicket({ created_at: new Date("2024-01-01T12:00:00Z") });
    expect(isRecentTicket(ticket, SNAPSHOT_TIME)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// comparePositions — basic classification
// ---------------------------------------------------------------------------

describe("comparator — comparePositions", () => {
  it("empty exchange positions + empty tickets → all empty arrays", () => {
    const result = comparePositions([], [], new Set(), SNAPSHOT_TIME);

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
    expect(result.orphaned).toHaveLength(0);
    expect(result.excluded).toHaveLength(0);
  });

  it("all matched → matched=[pair], unmatched=[], orphaned=[]", () => {
    const positions = [makePosition()];
    const tickets = [makeTicket()];

    const result = comparePositions(positions, tickets, new Set(), SNAPSHOT_TIME);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.position.symbol).toBe("BTCUSDT");
    expect(result.matched[0]!.ticket.id).toBe("ticket-1");
    expect(result.unmatched).toHaveLength(0);
    expect(result.orphaned).toHaveLength(0);
  });

  it("exchange has position, no DB ticket → unmatched=[position]", () => {
    const positions = [makePosition()];
    const tickets: TicketSnapshot[] = [];

    const result = comparePositions(positions, tickets, new Set(), SNAPSHOT_TIME);

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]!.position.symbol).toBe("BTCUSDT");
    expect(result.orphaned).toHaveLength(0);
  });

  it("DB has ticket, no exchange position → orphaned=[ticket]", () => {
    const positions: ExchangePosition[] = [];
    const tickets = [makeTicket()];

    const result = comparePositions(positions, tickets, new Set(), SNAPSHOT_TIME);

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
    expect(result.orphaned).toHaveLength(1);
    expect(result.orphaned[0]!.ticket.id).toBe("ticket-1");
  });

  it("mixed: 1 matched, 1 unmatched, 1 orphaned → correct classification", () => {
    const positions = [
      makePosition({ symbol: "BTCUSDT", exchange: "binance" }),
      makePosition({ symbol: "ETHUSDT", exchange: "binance" }),
    ];
    const tickets = [
      makeTicket({ id: "t-btc", symbol: "BTCUSDT", exchange: "binance" }),
      makeTicket({ id: "t-sol", symbol: "SOLUSDT", exchange: "binance" }),
    ];

    const result = comparePositions(positions, tickets, new Set(), SNAPSHOT_TIME);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.position.symbol).toBe("BTCUSDT");
    expect(result.matched[0]!.ticket.id).toBe("t-btc");

    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]!.position.symbol).toBe("ETHUSDT");

    expect(result.orphaned).toHaveLength(1);
    expect(result.orphaned[0]!.ticket.id).toBe("t-sol");
  });

  // -------------------------------------------------------------------------
  // Safety 1: pendingSymbols
  // -------------------------------------------------------------------------

  it("pendingSymbol in unmatched → excluded, not unmatched", () => {
    const positions = [makePosition({ symbol: "BTCUSDT", exchange: "binance" })];
    const tickets: TicketSnapshot[] = [];
    const pending = new Set(["BTCUSDT:binance"]);

    const result = comparePositions(positions, tickets, pending, SNAPSHOT_TIME);

    expect(result.unmatched).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.position.symbol).toBe("BTCUSDT");
    expect(result.excluded[0]!.reason).toBe("pending");
  });

  // -------------------------------------------------------------------------
  // Safety 2: recent ticket (after snapshotTime)
  // -------------------------------------------------------------------------

  it("recent ticket (after snapshotTime) → not counted as unmatched", () => {
    // Exchange has a position, DB has a ticket created AFTER snapshotTime.
    // The recent ticket should be excluded from the comparison entirely,
    // so the position should NOT be considered unmatched.
    const positions = [makePosition({ symbol: "BTCUSDT", exchange: "binance" })];
    const tickets = [
      makeTicket({
        id: "t-recent",
        symbol: "BTCUSDT",
        exchange: "binance",
        created_at: new Date("2024-01-01T13:00:00Z"),
      }),
    ];

    const result = comparePositions(positions, tickets, new Set(), SNAPSHOT_TIME);

    // The recent ticket matches the position by key, so the position
    // is excluded from unmatched (treated as excluded with reason "recent_ticket")
    expect(result.unmatched).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.position.symbol).toBe("BTCUSDT");
    expect(result.excluded[0]!.reason).toBe("recent_ticket");
  });

  // -------------------------------------------------------------------------
  // Multiple exchanges same symbol
  // -------------------------------------------------------------------------

  it("multiple exchanges same symbol → matched by (symbol, exchange) pair", () => {
    const positions = [
      makePosition({ symbol: "BTCUSDT", exchange: "binance" }),
      makePosition({ symbol: "BTCUSDT", exchange: "okx" }),
    ];
    const tickets = [
      makeTicket({ id: "t-binance", symbol: "BTCUSDT", exchange: "binance" }),
      makeTicket({ id: "t-okx", symbol: "BTCUSDT", exchange: "okx" }),
    ];

    const result = comparePositions(positions, tickets, new Set(), SNAPSHOT_TIME);

    expect(result.matched).toHaveLength(2);
    const matchedIds = result.matched.map((m) => m.ticket.id).sort();
    expect(matchedIds).toEqual(["t-binance", "t-okx"]);
    expect(result.unmatched).toHaveLength(0);
    expect(result.orphaned).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Direction mismatch
  // -------------------------------------------------------------------------

  it("direction mismatch (exchange LONG, DB SHORT) → treated as unmatched + orphaned", () => {
    const positions = [
      makePosition({ symbol: "BTCUSDT", exchange: "binance", side: "LONG" }),
    ];
    const tickets = [
      makeTicket({
        id: "t-short",
        symbol: "BTCUSDT",
        exchange: "binance",
        direction: "SHORT",
      }),
    ];

    const result = comparePositions(positions, tickets, new Set(), SNAPSHOT_TIME);

    // Direction mismatch means both sides are treated as if the other doesn't exist
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]!.position.symbol).toBe("BTCUSDT");
    expect(result.orphaned).toHaveLength(1);
    expect(result.orphaned[0]!.ticket.id).toBe("t-short");
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("direction mismatch with pendingSymbol → excluded + orphaned", () => {
    const positions = [
      makePosition({ symbol: "BTCUSDT", exchange: "binance", side: "LONG" }),
    ];
    const tickets = [
      makeTicket({
        id: "t-short",
        symbol: "BTCUSDT",
        exchange: "binance",
        direction: "SHORT",
      }),
    ];
    const pending = new Set(["BTCUSDT:binance"]);

    const result = comparePositions(positions, tickets, pending, SNAPSHOT_TIME);

    // Position would be unmatched but it's pending → excluded
    expect(result.unmatched).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.orphaned).toHaveLength(1);
    expect(result.orphaned[0]!.ticket.id).toBe("t-short");
  });

  it("multiple tickets for the same symbol+exchange → all match same position", () => {
    // Possible with pyramid tickets
    const positions = [makePosition({ symbol: "BTCUSDT", exchange: "binance" })];
    const tickets = [
      makeTicket({ id: "t-1", symbol: "BTCUSDT", exchange: "binance" }),
      makeTicket({ id: "t-2", symbol: "BTCUSDT", exchange: "binance" }),
    ];

    const result = comparePositions(positions, tickets, new Set(), SNAPSHOT_TIME);

    // Both tickets match the same position
    expect(result.matched).toHaveLength(2);
    expect(result.unmatched).toHaveLength(0);
    expect(result.orphaned).toHaveLength(0);
  });

  it("recent ticket excluded from orphan detection too", () => {
    // A recent ticket with no exchange position should not be orphaned
    const positions: ExchangePosition[] = [];
    const tickets = [
      makeTicket({
        id: "t-recent",
        symbol: "BTCUSDT",
        exchange: "binance",
        created_at: new Date("2024-01-01T13:00:00Z"),
      }),
    ];

    const result = comparePositions(positions, tickets, new Set(), SNAPSHOT_TIME);

    // Recent ticket is excluded from comparison entirely
    expect(result.orphaned).toHaveLength(0);
    expect(result.matched).toHaveLength(0);
  });
});

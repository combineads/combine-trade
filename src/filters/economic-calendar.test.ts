/**
 * economic-calendar.ts 단위 테스트
 *
 * T-19-010: Investing.com 경제 캘린더 스크래퍼
 *
 * 테스트 시나리오:
 *  - fetchEconomicCalendar() with mocked HTML containing 2x 3-star events → returns 2 EconomicEvent items
 *  - fetchEconomicCalendar() with mocked HTML containing 1x 1-star and 1x 3-star → returns 1 item
 *  - fetchEconomicCalendar() with fetch throwing network error → throws error (caller handles)
 *  - createEconomicTradeBlocks() with 2 events → 2 DB INSERT calls with correct blocked_at/expires_at
 *  - createEconomicTradeBlocks() event at 14:30 UTC → blocked_at=12:30 UTC, expires_at=16:30 UTC
 *  - createFallbackTradeBlock() → INSERT with reason "ECONOMIC_CALENDAR_FETCH_FAILED", 24h window
 *  - runDailyEconomicCalendar() with fetch failure → createFallbackTradeBlock called + sendSlackAlert called
 *  - runDailyEconomicCalendar() with 3 events → createEconomicTradeBlocks called, no slack alert
 *  - runDailyEconomicCalendar() with empty events array → no trade blocks, no slack alert
 */

import { describe, expect, it, mock } from "bun:test";
import type { DbInstance } from "@/db/pool";
import {
  createEconomicTradeBlocks,
  createFallbackTradeBlock,
  type EconomicEvent,
  fetchEconomicCalendar,
  runDailyEconomicCalendar,
} from "@/filters/economic-calendar";

// ---------------------------------------------------------------------------
// HTML fixtures
// ---------------------------------------------------------------------------

/** Minimal Investing.com-like calendar HTML with two 3-star events */
const HTML_TWO_THREE_STAR = `
<table class="genTbl closedTbl econCalTbl">
  <tbody>
    <tr class="js-event-item" event_timestamp="1704067200" data-event-datetime="2024/01/01 10:00:00">
      <td class="time">10:00</td>
      <td class="left event">US CPI m/m</td>
      <td class="sentiment">
        <i class="grayFullBullishIcon"></i>
        <i class="grayFullBullishIcon"></i>
        <i class="grayFullBullishIcon"></i>
      </td>
    </tr>
    <tr class="js-event-item" event_timestamp="1704074400" data-event-datetime="2024/01/01 14:00:00">
      <td class="time">14:00</td>
      <td class="left event">FOMC Statement</td>
      <td class="sentiment">
        <i class="grayFullBullishIcon"></i>
        <i class="grayFullBullishIcon"></i>
        <i class="grayFullBullishIcon"></i>
      </td>
    </tr>
  </tbody>
</table>
`;

/** One 1-star event + one 3-star event */
const HTML_ONE_STAR_AND_THREE_STAR = `
<table class="genTbl closedTbl econCalTbl">
  <tbody>
    <tr class="js-event-item" event_timestamp="1704067200" data-event-datetime="2024/01/01 10:00:00">
      <td class="time">10:00</td>
      <td class="left event">Low Impact Event</td>
      <td class="sentiment">
        <i class="grayFullBullishIcon"></i>
      </td>
    </tr>
    <tr class="js-event-item" event_timestamp="1704074400" data-event-datetime="2024/01/01 14:00:00">
      <td class="time">14:00</td>
      <td class="left event">FOMC Statement</td>
      <td class="sentiment">
        <i class="grayFullBullishIcon"></i>
        <i class="grayFullBullishIcon"></i>
        <i class="grayFullBullishIcon"></i>
      </td>
    </tr>
  </tbody>
</table>
`;

/** Empty calendar — no events */
const HTML_EMPTY = `
<table class="genTbl closedTbl econCalTbl">
  <tbody>
  </tbody>
</table>
`;

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

function makeMockDb() {
  const insertedValues: unknown[] = [];

  const db = {
    insert: mock(() => ({
      values: mock((val: unknown) => {
        insertedValues.push(val);
        return Promise.resolve();
      }),
    })),
    _insertedValues: insertedValues,
  };

  return db as unknown as DbInstance & { _insertedValues: unknown[] };
}

// ---------------------------------------------------------------------------
// fetchEconomicCalendar
// ---------------------------------------------------------------------------

describe("fetchEconomicCalendar", () => {
  it("returns 2 events when HTML contains 2x 3-star rows", async () => {
    const mockFetch = mock(async () => ({
      ok: true,
      text: async () => HTML_TWO_THREE_STAR,
    }));

    const result = await fetchEconomicCalendar(
      new Date("2024-01-01"),
      mockFetch as unknown as typeof fetch,
    );

    expect(result).toHaveLength(2);
    expect(result[0]?.title).toBe("US CPI m/m");
    expect(result[1]?.title).toBe("FOMC Statement");
    expect(result[0]?.impactStars).toBe(3);
    expect(result[1]?.impactStars).toBe(3);
  });

  it("returns 1 event when HTML contains 1-star and 3-star (filters low impact)", async () => {
    const mockFetch = mock(async () => ({
      ok: true,
      text: async () => HTML_ONE_STAR_AND_THREE_STAR,
    }));

    const result = await fetchEconomicCalendar(
      new Date("2024-01-01"),
      mockFetch as unknown as typeof fetch,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("FOMC Statement");
    expect(result[0]?.impactStars).toBe(3);
  });

  it("returns empty array when calendar has no events", async () => {
    const mockFetch = mock(async () => ({
      ok: true,
      text: async () => HTML_EMPTY,
    }));

    const result = await fetchEconomicCalendar(
      new Date("2024-01-01"),
      mockFetch as unknown as typeof fetch,
    );

    expect(result).toHaveLength(0);
  });

  it("throws when fetch throws a network error", async () => {
    const mockFetch = mock(async () => {
      throw new Error("Network error");
    });

    await expect(
      fetchEconomicCalendar(new Date("2024-01-01"), mockFetch as unknown as typeof fetch),
    ).rejects.toThrow("Network error");
  });

  it("throws when HTTP response is not ok", async () => {
    const mockFetch = mock(async () => ({
      ok: false,
      status: 403,
    }));

    await expect(
      fetchEconomicCalendar(new Date("2024-01-01"), mockFetch as unknown as typeof fetch),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createEconomicTradeBlocks
// ---------------------------------------------------------------------------

describe("createEconomicTradeBlocks", () => {
  it("inserts 2 TradeBlock rows for 2 events", async () => {
    const db = makeMockDb();

    const events: EconomicEvent[] = [
      { title: "US CPI m/m", scheduledAt: new Date("2024-01-01T10:00:00Z"), impactStars: 3 },
      { title: "FOMC Statement", scheduledAt: new Date("2024-01-01T14:00:00Z"), impactStars: 3 },
    ];

    await createEconomicTradeBlocks(db, events);

    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("sets blocked_at = scheduledAt - 120min, expires_at = scheduledAt + 120min", async () => {
    const db = makeMockDb();

    // Event at 14:30 UTC
    const scheduledAt = new Date("2024-01-01T14:30:00Z");
    const events: EconomicEvent[] = [{ title: "US GDP q/q", scheduledAt, impactStars: 3 }];

    await createEconomicTradeBlocks(db, events);

    expect(db.insert).toHaveBeenCalledTimes(1);

    // Retrieve the values passed to .values()
    const insertedValue = db._insertedValues[0] as {
      start_time: Date;
      end_time: Date;
      block_type: string;
      reason: string;
    };

    expect(insertedValue.block_type).toBe("ECONOMIC");
    expect(insertedValue.reason).toBe("US GDP q/q");

    // blocked_at = 14:30 - 120min = 12:30 UTC
    const expectedStart = new Date("2024-01-01T12:30:00Z");
    expect(insertedValue.start_time.getTime()).toBe(expectedStart.getTime());

    // expires_at = 14:30 + 120min = 16:30 UTC
    const expectedEnd = new Date("2024-01-01T16:30:00Z");
    expect(insertedValue.end_time.getTime()).toBe(expectedEnd.getTime());
  });

  it("does not insert anything for empty events array", async () => {
    const db = makeMockDb();

    await createEconomicTradeBlocks(db, []);

    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createFallbackTradeBlock
// ---------------------------------------------------------------------------

describe("createFallbackTradeBlock", () => {
  it("inserts a 24h block with reason ECONOMIC_CALENDAR_FETCH_FAILED", async () => {
    const db = makeMockDb();
    const now = new Date("2024-01-15T06:00:00Z");

    await createFallbackTradeBlock(db, now);

    expect(db.insert).toHaveBeenCalledTimes(1);

    const insertedValue = db._insertedValues[0] as {
      start_time: Date;
      end_time: Date;
      block_type: string;
      reason: string;
      is_recurring: boolean;
    };

    expect(insertedValue.block_type).toBe("ECONOMIC");
    expect(insertedValue.reason).toBe("ECONOMIC_CALENDAR_FETCH_FAILED");
    expect(insertedValue.is_recurring).toBe(false);

    // blocked_at = UTC 00:00 of the current day
    const expectedStart = new Date("2024-01-15T00:00:00Z");
    expect(insertedValue.start_time.getTime()).toBe(expectedStart.getTime());

    // expires_at = UTC 00:00 of the next day
    const expectedEnd = new Date("2024-01-16T00:00:00Z");
    expect(insertedValue.end_time.getTime()).toBe(expectedEnd.getTime());
  });
});

// ---------------------------------------------------------------------------
// runDailyEconomicCalendar
// ---------------------------------------------------------------------------

describe("runDailyEconomicCalendar", () => {
  it("calls createEconomicTradeBlocks when fetch succeeds with 3 events, no slack alert", async () => {
    const db = makeMockDb();

    const mockFetch = mock(async () => ({
      ok: true,
      text: async () => HTML_TWO_THREE_STAR, // returns 2 events from HTML
    }));

    const sendSlackAlert = mock(async () => {});

    await runDailyEconomicCalendar(db, {
      fetch: mockFetch as unknown as typeof fetch,
      sendSlackAlert,
      now: new Date("2024-01-01T00:00:00Z"),
    });

    // Should NOT have sent a slack alert
    expect(sendSlackAlert).not.toHaveBeenCalled();

    // DB insert was called (for the parsed events from HTML_TWO_THREE_STAR = 2 events)
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("calls createFallbackTradeBlock and sendSlackAlert when fetch fails", async () => {
    const db = makeMockDb();

    const mockFetch = mock(async () => {
      throw new Error("Connection refused");
    });

    const sendSlackAlert = mock(async () => {});

    await runDailyEconomicCalendar(db, {
      fetch: mockFetch as unknown as typeof fetch,
      sendSlackAlert,
      now: new Date("2024-01-01T00:00:00Z"),
    });

    // Should have sent a slack alert
    expect(sendSlackAlert).toHaveBeenCalledTimes(1);

    // Should have inserted a fallback block (1 insert)
    expect(db.insert).toHaveBeenCalledTimes(1);
    const insertedValue = db._insertedValues[0] as { reason: string };
    expect(insertedValue.reason).toBe("ECONOMIC_CALENDAR_FETCH_FAILED");
  });

  it("inserts nothing and no slack alert when events array is empty", async () => {
    const db = makeMockDb();

    const mockFetch = mock(async () => ({
      ok: true,
      text: async () => HTML_EMPTY,
    }));

    const sendSlackAlert = mock(async () => {});

    await runDailyEconomicCalendar(db, {
      fetch: mockFetch as unknown as typeof fetch,
      sendSlackAlert,
      now: new Date("2024-01-01T00:00:00Z"),
    });

    expect(sendSlackAlert).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("calls createFallbackTradeBlock and sendSlackAlert when HTTP response is not ok", async () => {
    const db = makeMockDb();

    const mockFetch = mock(async () => ({
      ok: false,
      status: 403,
    }));

    const sendSlackAlert = mock(async () => {});

    await runDailyEconomicCalendar(db, {
      fetch: mockFetch as unknown as typeof fetch,
      sendSlackAlert,
      now: new Date("2024-01-01T00:00:00Z"),
    });

    expect(sendSlackAlert).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from "bun:test";
import { generateWfoWindows } from "../../src/backtest/wfo";
import type { WfoConfig, WfoWindow } from "../../src/backtest/wfo";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function utc(year: number, month: number, day = 1): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function makeConfig(overrides: Partial<WfoConfig> = {}): WfoConfig {
  return {
    isMonths: 6,
    oosMonths: 2,
    rollMonths: 1,
    totalStartDate: utc(2021, 1, 1),
    totalEndDate: utc(2024, 1, 1),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateWfoWindows
// ---------------------------------------------------------------------------

describe("generateWfoWindows", () => {
  // ── Basic count and structure ───────────────────────────────────────────

  describe("3-year range (2021-01-01 ~ 2024-01-01), 6/2/1", () => {
    let windows: WfoWindow[];

    it("generates at least 6 windows", () => {
      windows = generateWfoWindows(makeConfig());
      expect(windows.length).toBeGreaterThanOrEqual(6);
    });

    it("assigns sequential windowIndex starting from 0", () => {
      windows = generateWfoWindows(makeConfig());
      windows.forEach((w, i) => {
        expect(w.windowIndex).toBe(i);
      });
    });
  });

  // ── First window ─────────────────────────────────────────────────────────

  describe("first window", () => {
    it("IS=[2021-01-01, 2021-07-01)", () => {
      const [w0] = generateWfoWindows(makeConfig());
      expect(w0!.isStart.getTime()).toBe(utc(2021, 1, 1).getTime());
      expect(w0!.isEnd.getTime()).toBe(utc(2021, 7, 1).getTime());
    });

    it("OOS=[2021-07-01, 2021-09-01)", () => {
      const [w0] = generateWfoWindows(makeConfig());
      expect(w0!.oosStart.getTime()).toBe(utc(2021, 7, 1).getTime());
      expect(w0!.oosEnd.getTime()).toBe(utc(2021, 9, 1).getTime());
    });
  });

  // ── Second window ─────────────────────────────────────────────────────────

  describe("second window (roll = 1 month)", () => {
    it("IS=[2021-02-01, 2021-08-01)", () => {
      const windows = generateWfoWindows(makeConfig());
      const w1 = windows[1]!;
      expect(w1.isStart.getTime()).toBe(utc(2021, 2, 1).getTime());
      expect(w1.isEnd.getTime()).toBe(utc(2021, 8, 1).getTime());
    });

    it("OOS=[2021-08-01, 2021-10-01)", () => {
      const windows = generateWfoWindows(makeConfig());
      const w1 = windows[1]!;
      expect(w1.oosStart.getTime()).toBe(utc(2021, 8, 1).getTime());
      expect(w1.oosEnd.getTime()).toBe(utc(2021, 10, 1).getTime());
    });
  });

  // ── Last window boundary ──────────────────────────────────────────────────

  it("last window OOS end <= totalEndDate", () => {
    const windows = generateWfoWindows(makeConfig());
    const last = windows[windows.length - 1]!;
    expect(last.oosEnd.getTime()).toBeLessThanOrEqual(utc(2024, 1, 1).getTime());
  });

  it("no window has OOS end > totalEndDate", () => {
    const windows = generateWfoWindows(makeConfig());
    for (const w of windows) {
      expect(w.oosEnd.getTime()).toBeLessThanOrEqual(utc(2024, 1, 1).getTime());
    }
  });

  // ── OOS immediately follows IS ────────────────────────────────────────────

  it("each window: oosStart === isEnd", () => {
    const windows = generateWfoWindows(makeConfig());
    for (const w of windows) {
      expect(w.oosStart.getTime()).toBe(w.isEnd.getTime());
    }
  });

  // ── Short range: fewer than IS + OOS months ───────────────────────────────

  it("data < 8 months → 0 windows", () => {
    const windows = generateWfoWindows(
      makeConfig({
        totalStartDate: utc(2021, 1, 1),
        totalEndDate: utc(2021, 7, 1), // only 6 months — not enough for OOS
      })
    );
    expect(windows).toHaveLength(0);
  });

  it("exactly 8 months → 1 window", () => {
    const windows = generateWfoWindows(
      makeConfig({
        totalStartDate: utc(2021, 1, 1),
        totalEndDate: utc(2021, 9, 1), // exactly 8 months
      })
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]!.isStart.getTime()).toBe(utc(2021, 1, 1).getTime());
    expect(windows[0]!.oosEnd.getTime()).toBe(utc(2021, 9, 1).getTime());
  });

  // ── IS duration is always isMonths ───────────────────────────────────────

  it("each window IS span = isMonths months", () => {
    const windows = generateWfoWindows(makeConfig());
    for (const w of windows) {
      // isEnd is isStart + isMonths
      const expected = new Date(w.isStart);
      expected.setUTCMonth(expected.getUTCMonth() + 6);
      expect(w.isEnd.getTime()).toBe(expected.getTime());
    }
  });

  // ── OOS duration is always oosMonths ─────────────────────────────────────

  it("each window OOS span = oosMonths months", () => {
    const windows = generateWfoWindows(makeConfig());
    for (const w of windows) {
      const expected = new Date(w.oosStart);
      expected.setUTCMonth(expected.getUTCMonth() + 2);
      expect(w.oosEnd.getTime()).toBe(expected.getTime());
    }
  });
});

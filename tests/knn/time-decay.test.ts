import { beforeAll, beforeEach, describe, expect, it } from "bun:test";

import {
  applyTimeDecay,
  calcTimeDecay,
  loadTimeDecayConfig,
  TIME_DECAY_STEPS,
  type KnnNeighbor,
  type TimeDecayConfig,
} from "../../src/knn/time-decay";
import { cleanupTables, initTestDb, isTestDbAvailable } from "../helpers/test-db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(days: number, from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function makeNeighbor(overrides: Partial<KnnNeighbor> = {}): KnnNeighbor {
  return {
    vectorId: "vec-1",
    distance: 0.1,
    label: "WIN",
    grade: "A",
    createdAt: daysAgo(0),
    ...overrides,
  };
}

const DEFAULT_CONFIG: TimeDecayConfig = {};

// ---------------------------------------------------------------------------
// TIME_DECAY_STEPS — structural constant
// ---------------------------------------------------------------------------

describe("time-decay: TIME_DECAY_STEPS — structural constant", () => {
  it("exposes the three tier boundaries", () => {
    expect(TIME_DECAY_STEPS.recentDays).toBe(30);
    expect(TIME_DECAY_STEPS.mediumDays).toBe(90);
  });

  it("exposes the three tier weights", () => {
    expect(TIME_DECAY_STEPS.recentWeight).toBe(1.0);
    expect(TIME_DECAY_STEPS.mediumWeight).toBe(0.7);
    expect(TIME_DECAY_STEPS.oldWeight).toBe(0.2);
  });
});

// ---------------------------------------------------------------------------
// calcTimeDecay — Tier 1: ≤ 30 days → weight 1.0
// ---------------------------------------------------------------------------

describe("time-decay: calcTimeDecay — tier 1 (0–30 days) → weight 1.0", () => {
  it("returns 1.0 when createdAt equals now (0 days)", () => {
    const now = new Date("2024-01-01T12:00:00Z");
    const weight = calcTimeDecay(now, now, DEFAULT_CONFIG);
    expect(weight).toBe(1.0);
  });

  it("returns 1.0 when createdAt and now are in the same UTC day", () => {
    const now = new Date("2024-01-01T23:59:59Z");
    const createdAt = new Date("2024-01-01T00:00:00Z");
    const weight = calcTimeDecay(createdAt, now, DEFAULT_CONFIG);
    expect(weight).toBe(1.0);
  });

  it("returns 1.0 at exactly 30 days elapsed", () => {
    const now = new Date("2024-02-01T00:00:00Z");
    const created30DaysAgo = daysAgo(30, now);
    const weight = calcTimeDecay(created30DaysAgo, now, DEFAULT_CONFIG);
    expect(weight).toBe(1.0);
  });

  it("returns 1.0 at 1 day elapsed", () => {
    const now = new Date("2024-01-15T00:00:00Z");
    const created1DayAgo = daysAgo(1, now);
    const weight = calcTimeDecay(created1DayAgo, now, DEFAULT_CONFIG);
    expect(weight).toBe(1.0);
  });

  it("returns 1.0 at 15 days elapsed", () => {
    const now = new Date("2024-01-31T00:00:00Z");
    const created15DaysAgo = daysAgo(15, now);
    const weight = calcTimeDecay(created15DaysAgo, now, DEFAULT_CONFIG);
    expect(weight).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// calcTimeDecay — Tier 2: 31–90 days → weight 0.7
// ---------------------------------------------------------------------------

describe("time-decay: calcTimeDecay — tier 2 (31–90 days) → weight 0.7", () => {
  it("returns 0.7 at exactly 31 days elapsed", () => {
    const now = new Date("2024-02-01T00:00:00Z");
    const created31DaysAgo = daysAgo(31, now);
    const weight = calcTimeDecay(created31DaysAgo, now, DEFAULT_CONFIG);
    expect(weight).toBe(0.7);
  });

  it("returns 0.7 at 60 days elapsed", () => {
    const now = new Date("2024-03-01T00:00:00Z");
    const created60DaysAgo = daysAgo(60, now);
    const weight = calcTimeDecay(created60DaysAgo, now, DEFAULT_CONFIG);
    expect(weight).toBe(0.7);
  });

  it("returns 0.7 at exactly 90 days elapsed", () => {
    const now = new Date("2024-04-01T00:00:00Z");
    const created90DaysAgo = daysAgo(90, now);
    const weight = calcTimeDecay(created90DaysAgo, now, DEFAULT_CONFIG);
    expect(weight).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// calcTimeDecay — Tier 3: > 90 days → weight 0.2
// ---------------------------------------------------------------------------

describe("time-decay: calcTimeDecay — tier 3 (> 90 days) → weight 0.2", () => {
  it("returns 0.2 at exactly 91 days elapsed", () => {
    const now = new Date("2024-04-02T00:00:00Z");
    const created91DaysAgo = daysAgo(91, now);
    const weight = calcTimeDecay(created91DaysAgo, now, DEFAULT_CONFIG);
    expect(weight).toBe(0.2);
  });

  it("returns 0.2 at 180 days elapsed", () => {
    const now = new Date("2024-07-01T00:00:00Z");
    const created180DaysAgo = daysAgo(180, now);
    const weight = calcTimeDecay(created180DaysAgo, now, DEFAULT_CONFIG);
    expect(weight).toBe(0.2);
  });

  it("returns 0.2 at 1000 days elapsed", () => {
    const now = new Date("2027-01-01T00:00:00Z");
    const created1000DaysAgo = daysAgo(1000, now);
    const weight = calcTimeDecay(created1000DaysAgo, now, DEFAULT_CONFIG);
    expect(weight).toBe(0.2);
  });
});

// ---------------------------------------------------------------------------
// calcTimeDecay — safety: future date
// ---------------------------------------------------------------------------

describe("time-decay: calcTimeDecay — future date safety", () => {
  it("returns 1.0 when createdAt is in the future (now < createdAt)", () => {
    const now = new Date("2024-01-01T00:00:00Z");
    const futureDate = new Date("2024-06-01T00:00:00Z");
    const weight = calcTimeDecay(futureDate, now, DEFAULT_CONFIG);
    expect(weight).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// calcTimeDecay — weight bounds
// ---------------------------------------------------------------------------

describe("time-decay: calcTimeDecay — weight bounds", () => {
  it("weight is always in {0.2, 0.7, 1.0}", () => {
    const now = new Date("2024-01-01T00:00:00Z");
    const validWeights = new Set([0.2, 0.7, 1.0]);
    for (const days of [0, 1, 30, 31, 60, 90, 91, 180, 365, 730, 1000]) {
      const createdAt = daysAgo(days, now);
      const weight = calcTimeDecay(createdAt, now, DEFAULT_CONFIG);
      expect(validWeights.has(weight)).toBe(true);
    }
  });

  it("weight is always > 0", () => {
    const now = new Date("2024-01-01T00:00:00Z");
    for (const days of [0, 1, 30, 31, 90, 91, 180, 365, 1000]) {
      const createdAt = daysAgo(days, now);
      const weight = calcTimeDecay(createdAt, now, DEFAULT_CONFIG);
      expect(weight).toBeGreaterThan(0);
    }
  });

  it("weight is always <= 1", () => {
    const now = new Date("2024-01-01T00:00:00Z");
    for (const days of [0, 1, 30, 31, 90, 91, 365, 1000]) {
      const createdAt = daysAgo(days, now);
      const weight = calcTimeDecay(createdAt, now, DEFAULT_CONFIG);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  it("tier-1 weight > tier-2 weight > tier-3 weight (monotone decreasing)", () => {
    const now = new Date("2024-06-01T00:00:00Z");
    const w1 = calcTimeDecay(daysAgo(0, now), now, DEFAULT_CONFIG);
    const w2 = calcTimeDecay(daysAgo(60, now), now, DEFAULT_CONFIG);
    const w3 = calcTimeDecay(daysAgo(200, now), now, DEFAULT_CONFIG);
    expect(w1).toBeGreaterThan(w2);
    expect(w2).toBeGreaterThan(w3);
  });
});

// ---------------------------------------------------------------------------
// calcTimeDecay — config parameter is ignored (steps are structural)
// ---------------------------------------------------------------------------

describe("time-decay: calcTimeDecay — config is structural (param ignored)", () => {
  it("returns same weight regardless of what is passed as config", () => {
    const now = new Date("2024-06-01T00:00:00Z");
    const createdAt = daysAgo(60, now);
    const w1 = calcTimeDecay(createdAt, now, {});
    const w2 = calcTimeDecay(createdAt, now, DEFAULT_CONFIG);
    expect(w1).toBe(w2);
    expect(w1).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// applyTimeDecay — array transformation
// ---------------------------------------------------------------------------

describe("time-decay: applyTimeDecay — adds weight to each neighbor", () => {
  it("assigns correct discrete weights to each tier", () => {
    const now = new Date("2024-06-01T00:00:00Z");
    const neighbors: KnnNeighbor[] = [
      makeNeighbor({ vectorId: "v1", createdAt: daysAgo(0, now) }),
      makeNeighbor({ vectorId: "v2", createdAt: daysAgo(60, now) }),
      makeNeighbor({ vectorId: "v3", createdAt: daysAgo(180, now) }),
    ];

    const result = applyTimeDecay(neighbors, now, DEFAULT_CONFIG);

    expect(result).toHaveLength(3);
    expect(result[0]!.weight).toBe(1.0);
    expect(result[1]!.weight).toBe(0.7);
    expect(result[2]!.weight).toBe(0.2);
  });

  it("preserves all original neighbor fields", () => {
    const now = new Date("2024-01-01T00:00:00Z");
    const neighbor = makeNeighbor({
      vectorId: "abc",
      distance: 0.42,
      label: "LOSS",
      grade: "B",
      createdAt: daysAgo(30, now),
    });

    const result = applyTimeDecay([neighbor], now, DEFAULT_CONFIG);

    expect(result[0]!.vectorId).toBe("abc");
    expect(result[0]!.distance).toBe(0.42);
    expect(result[0]!.label).toBe("LOSS");
    expect(result[0]!.grade).toBe("B");
    expect(result[0]!.createdAt).toBe(neighbor.createdAt);
  });

  it("returns empty array for empty input", () => {
    const result = applyTimeDecay([], new Date(), DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });

  it("newer neighbors receive higher or equal weight than older ones", () => {
    const now = new Date("2024-06-01T00:00:00Z");
    const neighbors: KnnNeighbor[] = [
      makeNeighbor({ vectorId: "recent", createdAt: daysAgo(10, now) }),
      makeNeighbor({ vectorId: "old", createdAt: daysAgo(200, now) }),
    ];

    const result = applyTimeDecay(neighbors, now, DEFAULT_CONFIG);
    const recentWeight = result.find((n) => n.vectorId === "recent")!.weight;
    const oldWeight = result.find((n) => n.vectorId === "old")!.weight;

    expect(recentWeight).toBeGreaterThan(oldWeight);
  });

  it("neighbors with null label/grade are handled correctly", () => {
    const now = new Date("2024-01-01T00:00:00Z");
    const neighbor = makeNeighbor({ label: null, grade: null });
    const result = applyTimeDecay([neighbor], now, DEFAULT_CONFIG);
    expect(result[0]!.label).toBeNull();
    expect(result[0]!.grade).toBeNull();
    expect(typeof result[0]!.weight).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// loadTimeDecayConfig — always returns default (no DB dependency)
// ---------------------------------------------------------------------------

describe("time-decay: loadTimeDecayConfig — returns default config", () => {
  it("returns an empty config object without DB", async () => {
    const config = await loadTimeDecayConfig();
    expect(config).toEqual({});
  });

  it("returned config is compatible with calcTimeDecay", async () => {
    const config = await loadTimeDecayConfig();
    const now = new Date("2024-06-01T00:00:00Z");
    const weight = calcTimeDecay(daysAgo(60, now), now, config);
    expect(weight).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// loadTimeDecayConfig — DB integration tests (skipped if DB unavailable)
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("time-decay: loadTimeDecayConfig — DB integration (optional)", () => {
  beforeAll(async () => {
    await initTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();
  });

  it("returns default config {} even with DB available", async () => {
    const config = await loadTimeDecayConfig();
    expect(config).toEqual({});
  });
});

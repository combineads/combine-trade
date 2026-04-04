import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import type { DbInstance } from "../../src/db/pool";
import { getDb } from "../../src/db/pool";
import { commonCodeTable } from "../../src/db/schema";
import {
  applyTimeDecay,
  calcTimeDecay,
  loadTimeDecayConfig,
  type KnnNeighbor,
  type TimeDecayConfig,
  type WeightedNeighbor,
} from "../../src/knn/time-decay";
import {
  cleanupTables,
  closeTestDb,
  initTestDb,
  isTestDbAvailable,
} from "../helpers/test-db";

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

const DEFAULT_CONFIG: TimeDecayConfig = { halfLifeDays: 90 };

// ---------------------------------------------------------------------------
// calcTimeDecay — pure function tests
// ---------------------------------------------------------------------------

describe("time-decay: calcTimeDecay — same day (0 days elapsed)", () => {
  it("returns 1.0 when createdAt equals now", () => {
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
});

describe("time-decay: calcTimeDecay — half-life boundary", () => {
  it("returns ~0.5 when exactly halfLifeDays have elapsed", () => {
    const now = new Date("2024-04-01T00:00:00Z");
    const createdAt = new Date("2024-01-01T00:00:00Z"); // 91 days, close enough
    // Use exactly 90 days
    const created90DaysAgo = daysAgo(90, now);
    const weight = calcTimeDecay(created90DaysAgo, now, DEFAULT_CONFIG);
    // exp(-ln(2)/90 * 90) = exp(-ln(2)) = 0.5
    expect(weight).toBeCloseTo(0.5, 5);
  });
});

describe("time-decay: calcTimeDecay — double half-life", () => {
  it("returns ~0.25 when 2×halfLifeDays have elapsed", () => {
    const now = new Date("2024-06-01T00:00:00Z");
    const created180DaysAgo = daysAgo(180, now);
    const weight = calcTimeDecay(created180DaysAgo, now, DEFAULT_CONFIG);
    // exp(-ln(2)/90 * 180) = exp(-2*ln(2)) = 0.25
    expect(weight).toBeCloseTo(0.25, 5);
  });
});

describe("time-decay: calcTimeDecay — large elapsed time", () => {
  it("returns weight > 0 even after 1000 days", () => {
    const now = new Date("2027-01-01T00:00:00Z");
    const created1000DaysAgo = daysAgo(1000, now);
    const weight = calcTimeDecay(created1000DaysAgo, now, DEFAULT_CONFIG);
    expect(weight).toBeGreaterThan(0);
    expect(weight).toBeLessThan(1);
  });
});

describe("time-decay: calcTimeDecay — future date safety", () => {
  it("returns 1.0 when createdAt is in the future (now < createdAt)", () => {
    const now = new Date("2024-01-01T00:00:00Z");
    const futureDate = new Date("2024-06-01T00:00:00Z");
    const weight = calcTimeDecay(futureDate, now, DEFAULT_CONFIG);
    expect(weight).toBe(1.0);
  });
});

describe("time-decay: calcTimeDecay — weight bounds", () => {
  it("weight is always <= 1", () => {
    const now = new Date("2024-01-01T00:00:00Z");
    for (const days of [0, 1, 30, 90, 180, 365, 730, 1000]) {
      const createdAt = daysAgo(days, now);
      const weight = calcTimeDecay(createdAt, now, DEFAULT_CONFIG);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  it("weight is always > 0", () => {
    const now = new Date("2024-01-01T00:00:00Z");
    for (const days of [1, 30, 90, 180, 365, 730, 1000]) {
      const createdAt = daysAgo(days, now);
      const weight = calcTimeDecay(createdAt, now, DEFAULT_CONFIG);
      expect(weight).toBeGreaterThan(0);
    }
  });
});

describe("time-decay: calcTimeDecay — custom halfLifeDays", () => {
  it("returns ~0.5 at halfLifeDays=30 when 30 days have elapsed", () => {
    const config: TimeDecayConfig = { halfLifeDays: 30 };
    const now = new Date("2024-02-01T00:00:00Z");
    const created30DaysAgo = daysAgo(30, now);
    const weight = calcTimeDecay(created30DaysAgo, now, config);
    expect(weight).toBeCloseTo(0.5, 5);
  });
});

// ---------------------------------------------------------------------------
// applyTimeDecay — array transformation
// ---------------------------------------------------------------------------

describe("time-decay: applyTimeDecay — adds weight to each neighbor", () => {
  it("returns WeightedNeighbor[] with weight field added", () => {
    const now = new Date("2024-06-01T00:00:00Z");
    const neighbors: KnnNeighbor[] = [
      makeNeighbor({ vectorId: "v1", createdAt: daysAgo(0, now) }),
      makeNeighbor({ vectorId: "v2", createdAt: daysAgo(90, now) }),
      makeNeighbor({ vectorId: "v3", createdAt: daysAgo(180, now) }),
    ];

    const result = applyTimeDecay(neighbors, now, DEFAULT_CONFIG);

    expect(result).toHaveLength(3);
    expect(result[0].weight).toBe(1.0);
    expect(result[1].weight).toBeCloseTo(0.5, 5);
    expect(result[2].weight).toBeCloseTo(0.25, 5);
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

    expect(result[0].vectorId).toBe("abc");
    expect(result[0].distance).toBe(0.42);
    expect(result[0].label).toBe("LOSS");
    expect(result[0].grade).toBe("B");
    expect(result[0].createdAt).toBe(neighbor.createdAt);
  });

  it("returns empty array for empty input", () => {
    const result = applyTimeDecay([], new Date(), DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });

  it("newer neighbors receive higher weight than older ones", () => {
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
    expect(result[0].label).toBeNull();
    expect(result[0].grade).toBeNull();
    expect(typeof result[0].weight).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// loadTimeDecayConfig — DB integration tests (skipped if DB unavailable)
// ---------------------------------------------------------------------------

const dbAvailable = await isTestDbAvailable();

describe.skipIf(!dbAvailable)("time-decay: loadTimeDecayConfig — DB integration", () => {
  let db: DbInstance;

  beforeAll(async () => {
    await initTestDb();
    db = getDb();
  });

  beforeEach(async () => {
    await cleanupTables();
  });

  // Pool is closed by test process exit to avoid cross-file conflicts

  it("returns default config { halfLifeDays: 90 } when CommonCode row is absent", async () => {
    const config = await loadTimeDecayConfig(db);
    expect(config).toEqual({ halfLifeDays: 90 });
  });

  it("returns config from DB when TIME_DECAY.half_life_days is present", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "TIME_DECAY",
      code: "half_life_days",
      value: 60,
      description: "Test half-life",
      sort_order: 10,
      is_active: true,
    });

    const config = await loadTimeDecayConfig(db);
    expect(config).toEqual({ halfLifeDays: 60 });
  });

  it("falls back to default when is_active=false", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "TIME_DECAY",
      code: "half_life_days",
      value: 30,
      description: "Inactive entry",
      sort_order: 10,
      is_active: false,
    });

    const config = await loadTimeDecayConfig(db);
    expect(config).toEqual({ halfLifeDays: 90 });
  });

  it("falls back to default when value is not a valid number", async () => {
    await db.insert(commonCodeTable).values({
      group_code: "TIME_DECAY",
      code: "half_life_days",
      value: "not-a-number",
      description: "Bad value",
      sort_order: 10,
      is_active: true,
    });

    const config = await loadTimeDecayConfig(db);
    expect(config).toEqual({ halfLifeDays: 90 });
  });
});

import { describe, expect, it } from "bun:test";
import {
  GLOSSARY_BY_ENGLISH,
  GLOSSARY_CATEGORIES,
  lookupEn,
  lookupKo,
  type GlossaryEntry,
} from "../src/i18n/glossary";

describe("GLOSSARY_CATEGORIES", () => {
  it("has at least 7 categories", () => {
    expect(GLOSSARY_CATEGORIES.length).toBeGreaterThanOrEqual(7);
  });

  it("each category has a non-empty id, label, labelKo, and entries array", () => {
    for (const cat of GLOSSARY_CATEGORIES) {
      expect(cat.id.length).toBeGreaterThan(0);
      expect(cat.label.length).toBeGreaterThan(0);
      expect(cat.labelKo.length).toBeGreaterThan(0);
      expect(Array.isArray(cat.entries)).toBe(true);
      expect(cat.entries.length).toBeGreaterThan(0);
    }
  });

  it("category ids are unique", () => {
    const ids = GLOSSARY_CATEGORIES.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("GlossaryEntry shape", () => {
  it("every entry has non-empty en and ko fields", () => {
    for (const cat of GLOSSARY_CATEGORIES) {
      for (const entry of cat.entries) {
        expect(
          entry.en.length,
          `entry.en must be non-empty (category: ${cat.id})`,
        ).toBeGreaterThan(0);
        expect(
          entry.ko.length,
          `entry.ko must be non-empty for "${entry.en}"`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("koAlt, if present, is a non-empty array of non-empty strings", () => {
    for (const cat of GLOSSARY_CATEGORIES) {
      for (const entry of cat.entries) {
        if (entry.koAlt !== undefined) {
          expect(
            Array.isArray(entry.koAlt),
            `koAlt for "${entry.en}" must be an array`,
          ).toBe(true);
          expect(
            entry.koAlt.length,
            `koAlt for "${entry.en}" must not be empty`,
          ).toBeGreaterThan(0);
          for (const alt of entry.koAlt) {
            expect(
              alt.length,
              `each koAlt item for "${entry.en}" must be non-empty`,
            ).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe("GLOSSARY_BY_ENGLISH", () => {
  it("is a frozen object", () => {
    expect(Object.isFrozen(GLOSSARY_BY_ENGLISH)).toBe(true);
  });

  it("English keys are unique across all categories", () => {
    // If two categories had the same English term, one would overwrite the other.
    // Count total entries vs keys to detect collisions.
    const totalEntries = GLOSSARY_CATEGORIES.reduce(
      (sum, cat) => sum + cat.entries.length,
      0,
    );
    const keyCount = Object.keys(GLOSSARY_BY_ENGLISH).length;
    expect(keyCount).toBe(totalEntries);
  });

  it("contains key terms required by the task spec", () => {
    const required: Array<{ en: string; ko: string }> = [
      { en: "Long Position", ko: "롱 포지션" },
      { en: "Short Position", ko: "숏 포지션" },
      { en: "Take Profit", ko: "익절" },
      { en: "Stop Loss", ko: "손절" },
      { en: "Kill Switch", ko: "킬 스위치" },
      { en: "Liquidation", ko: "청산" },
      { en: "Leverage", ko: "레버리지" },
      { en: "Margin", ko: "마진" },
      { en: "PnL", ko: "손익" },
      { en: "Backtest", ko: "백테스트" },
      { en: "Paper Trading", ko: "모의매매" },
      { en: "Candle", ko: "캔들" },
      { en: "Strategy", ko: "전략" },
      { en: "Decision Engine", ko: "의사결정 엔진" },
      { en: "Vector Search", ko: "벡터 검색" },
      { en: "Win Rate", ko: "승률" },
      { en: "Expectancy", ko: "기대값" },
    ];

    for (const { en, ko } of required) {
      const entry = GLOSSARY_BY_ENGLISH[en];
      expect(entry, `"${en}" must exist in glossary`).toBeDefined();
      expect(
        entry?.ko,
        `"${en}" must map to "${ko}"`,
      ).toBe(ko);
    }
  });

  it("domain-standard terms (LONG/SHORT/PASS) have same value in en and ko", () => {
    const domainTerms = ["LONG", "SHORT", "PASS"];
    for (const term of domainTerms) {
      const entry = GLOSSARY_BY_ENGLISH[term];
      expect(entry, `"${term}" must exist`).toBeDefined();
      expect(entry?.ko).toBe(term);
    }
  });
});

describe("lookupKo", () => {
  it("returns the Korean translation for a known term", () => {
    expect(lookupKo("Strategy")).toBe("전략");
    expect(lookupKo("Kill Switch")).toBe("킬 스위치");
    expect(lookupKo("Win Rate")).toBe("승률");
  });

  it("returns the English term unchanged for an unknown term (safe fallback)", () => {
    expect(lookupKo("UnknownTerm")).toBe("UnknownTerm");
    expect(lookupKo("")).toBe("");
  });
});

describe("lookupEn", () => {
  it("finds the English term by primary Korean translation", () => {
    expect(lookupEn("전략")).toBe("Strategy");
    expect(lookupEn("킬 스위치")).toBe("Kill Switch");
    expect(lookupEn("승률")).toBe("Win Rate");
  });

  it("finds the English term by alternative Korean translation", () => {
    // Take Profit has koAlt: ["이익실현", "TP"]
    expect(lookupEn("이익실현")).toBe("Take Profit");
    // Margin has koAlt: ["증거금"]
    expect(lookupEn("증거금")).toBe("Margin");
    // Paper Trading has koAlt: ["페이퍼 트레이딩"]
    expect(lookupEn("페이퍼 트레이딩")).toBe("Paper Trading");
  });

  it("returns undefined for a term not in the glossary", () => {
    expect(lookupEn("없는용어")).toBeUndefined();
  });
});

describe("Glossary completeness", () => {
  it("covers all 7 expected domain areas", () => {
    const expectedIds = [
      "general",
      "orderTypes",
      "riskManagement",
      "technicalAnalysis",
      "positionManagement",
      "systemComponents",
      "statistics",
    ];
    const actualIds = GLOSSARY_CATEGORIES.map((c) => c.id);
    for (const id of expectedIds) {
      expect(actualIds).toContain(id);
    }
  });

  it("has at least 80 total entries", () => {
    const total = GLOSSARY_CATEGORIES.reduce(
      (sum, cat) => sum + cat.entries.length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(80);
  });
});

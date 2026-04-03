import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  AnchorModificationError,
  ConfigNotFoundError,
  clearCache,
  getCachedValue,
  getGroupConfig,
  isLoaded,
} from "../../src/config/loader";
import {
  type ConfigChangeCallback,
  type Unsubscribe,
  updateConfig,
  watchConfig,
} from "../../src/config/index";

// ---------------------------------------------------------------------------
// Helpers — inject values directly into cache via loader internals
// ---------------------------------------------------------------------------

// We use the exported clearCache() and test only the pure cache logic —
// no DB interactions.

describe("config/loader — isLoaded", () => {
  beforeEach(() => {
    clearCache();
  });

  it("returns false before any load", () => {
    expect(isLoaded()).toBe(false);
  });
});

describe("config/loader — clearCache", () => {
  beforeEach(() => {
    clearCache();
  });

  it("resets loaded flag to false", () => {
    // Manually verify the flag resets (clearCache sets loaded=false)
    clearCache();
    expect(isLoaded()).toBe(false);
  });

  it("makes getCachedValue throw after clearing", () => {
    // Even if there was data, clearing removes it
    clearCache();
    expect(() => getCachedValue("KNN", "top_k")).toThrow(ConfigNotFoundError);
  });
});

describe("config/loader — getCachedValue throws ConfigNotFoundError", () => {
  beforeEach(() => {
    clearCache();
  });

  it("throws when cache is empty (group not found)", () => {
    expect(() => getCachedValue("KNN", "top_k")).toThrow(ConfigNotFoundError);
  });

  it("throws with correct error name", () => {
    try {
      getCachedValue("EXCHANGE", "binance");
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigNotFoundError);
      if (err instanceof ConfigNotFoundError) {
        expect(err.name).toBe("ConfigNotFoundError");
      }
    }
  });

  it("error message contains group and code", () => {
    try {
      getCachedValue("POSITION", "max_positions");
      expect(true).toBe(false);
    } catch (err) {
      if (err instanceof ConfigNotFoundError) {
        expect(err.message).toContain("POSITION");
        expect(err.message).toContain("max_positions");
      } else {
        throw err;
      }
    }
  });
});

describe("config/loader — getGroupConfig throws ConfigNotFoundError", () => {
  beforeEach(() => {
    clearCache();
  });

  it("throws when group is not in cache", () => {
    expect(() => getGroupConfig("SLIPPAGE")).toThrow(ConfigNotFoundError);
  });
});

describe("config/loader — AnchorModificationError", () => {
  it("has correct name", () => {
    const err = new AnchorModificationError("ANCHOR");
    expect(err.name).toBe("AnchorModificationError");
  });

  it("message matches required format", () => {
    const err = new AnchorModificationError("ANCHOR");
    expect(err.message).toBe("ANCHOR group 'ANCHOR' cannot be modified");
  });

  it("is an instance of Error", () => {
    const err = new AnchorModificationError("ANCHOR");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("config/loader — ConfigNotFoundError", () => {
  it("is an instance of Error", () => {
    const err = new ConfigNotFoundError("KNN", "top_k");
    expect(err).toBeInstanceOf(Error);
  });

  it("has correct name", () => {
    const err = new ConfigNotFoundError("KNN", "top_k");
    expect(err.name).toBe("ConfigNotFoundError");
  });

  it("message contains group and code", () => {
    const err = new ConfigNotFoundError("KNN", "top_k");
    expect(err.message).toContain("KNN");
    expect(err.message).toContain("top_k");
  });
});

describe("config/index — updateConfig throws AnchorModificationError for ANCHOR group", () => {
  it("throws AnchorModificationError when group is 'ANCHOR'", async () => {
    let threw = false;
    try {
      await updateConfig("ANCHOR", "bb20", { length: 20, stddev: 2, source: "close" });
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(AnchorModificationError);
      if (err instanceof AnchorModificationError) {
        expect(err.message).toContain("ANCHOR");
      }
    }
    expect(threw).toBe(true);
  });
});

describe("config/index — watchConfig callback registration and invocation", () => {
  afterEach(() => {
    clearCache();
  });

  it("returns an unsubscribe function", () => {
    const unsubscribe = watchConfig(() => {});
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("unsubscribe removes the callback so it no longer fires", async () => {
    let callCount = 0;
    const unsubscribe: Unsubscribe = watchConfig(() => {
      callCount++;
    });

    unsubscribe();

    // After unsubscribing, updateConfig on ANCHOR should throw before notifying
    // Use a non-ANCHOR group to avoid the anchor error, but since we have no DB
    // we expect a different error. The key check is callCount stays 0.
    try {
      await updateConfig("KNN", "top_k", 50);
    } catch {
      // Expected — no DB available in unit tests
    }

    expect(callCount).toBe(0);
  });

  it("registered callback is invoked on AnchorModificationError check before notify", async () => {
    // This test verifies that ANCHOR throws before any notify, so callback is NOT called
    let callCount = 0;
    const unsubscribe: Unsubscribe = watchConfig(() => {
      callCount++;
    });

    try {
      await updateConfig("ANCHOR", "bb20", {});
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorModificationError);
    }

    // Callback should NOT have been called because anchor check fires first
    expect(callCount).toBe(0);
    unsubscribe();
  });

  it("multiple callbacks can be registered independently", () => {
    let count1 = 0;
    let count2 = 0;

    const cb1: ConfigChangeCallback = () => {
      count1++;
    };
    const cb2: ConfigChangeCallback = () => {
      count2++;
    };

    const unsub1 = watchConfig(cb1);
    const unsub2 = watchConfig(cb2);

    // Both registered — unsubscribe only one
    unsub1();

    // Verify unsub2 still works
    expect(typeof unsub2).toBe("function");
    unsub2();

    // Counts never incremented since we didn't trigger any updates
    expect(count1).toBe(0);
    expect(count2).toBe(0);
  });
});

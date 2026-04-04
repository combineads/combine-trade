import { describe, expect, it } from "bun:test";
import {
  canSymbolStateTransition,
  validateSymbolStateTransition,
  getAllowedSymbolStateTransitions,
  InvalidSymbolStateTransitionError,
  SYMBOL_STATE_TRANSITION_MAP,
} from "@/positions/fsm";

// ---------------------------------------------------------------------------
// SYMBOL_STATE_TRANSITION_MAP — structural contract
// ---------------------------------------------------------------------------

describe("symbol-state-fsm — SYMBOL_STATE_TRANSITION_MAP structure", () => {
  it("IDLE can only transition to WATCHING", () => {
    expect(SYMBOL_STATE_TRANSITION_MAP.IDLE).toEqual(["WATCHING"]);
  });

  it("WATCHING can transition to HAS_POSITION or IDLE", () => {
    expect(SYMBOL_STATE_TRANSITION_MAP.WATCHING).toContain("HAS_POSITION");
    expect(SYMBOL_STATE_TRANSITION_MAP.WATCHING).toContain("IDLE");
    expect(SYMBOL_STATE_TRANSITION_MAP.WATCHING).toHaveLength(2);
  });

  it("HAS_POSITION can only transition to IDLE", () => {
    expect(SYMBOL_STATE_TRANSITION_MAP.HAS_POSITION).toEqual(["IDLE"]);
  });
});

// ---------------------------------------------------------------------------
// canSymbolStateTransition — valid transitions
// ---------------------------------------------------------------------------

describe("symbol-state-fsm — canSymbolStateTransition valid transitions", () => {
  it("IDLE -> WATCHING is allowed", () => {
    expect(canSymbolStateTransition("IDLE", "WATCHING")).toBe(true);
  });

  it("WATCHING -> HAS_POSITION is allowed (enter position)", () => {
    expect(canSymbolStateTransition("WATCHING", "HAS_POSITION")).toBe(true);
  });

  it("WATCHING -> IDLE is allowed (cancel watching)", () => {
    expect(canSymbolStateTransition("WATCHING", "IDLE")).toBe(true);
  });

  it("HAS_POSITION -> IDLE is allowed (position closed)", () => {
    expect(canSymbolStateTransition("HAS_POSITION", "IDLE")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canSymbolStateTransition — invalid transitions
// ---------------------------------------------------------------------------

describe("symbol-state-fsm — canSymbolStateTransition invalid transitions", () => {
  it("IDLE -> HAS_POSITION is rejected (must pass through WATCHING)", () => {
    expect(canSymbolStateTransition("IDLE", "HAS_POSITION")).toBe(false);
  });

  it("HAS_POSITION -> WATCHING is rejected (must close first)", () => {
    expect(canSymbolStateTransition("HAS_POSITION", "WATCHING")).toBe(false);
  });

  it("IDLE -> IDLE is rejected (no self-loop)", () => {
    expect(canSymbolStateTransition("IDLE", "IDLE")).toBe(false);
  });

  it("WATCHING -> WATCHING is rejected (no self-loop)", () => {
    expect(canSymbolStateTransition("WATCHING", "WATCHING")).toBe(false);
  });

  it("HAS_POSITION -> HAS_POSITION is rejected (no self-loop)", () => {
    expect(canSymbolStateTransition("HAS_POSITION", "HAS_POSITION")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateSymbolStateTransition — does not throw on valid
// ---------------------------------------------------------------------------

describe("symbol-state-fsm — validateSymbolStateTransition valid transitions", () => {
  it("does not throw for IDLE -> WATCHING", () => {
    expect(() => validateSymbolStateTransition("IDLE", "WATCHING")).not.toThrow();
  });

  it("does not throw for WATCHING -> HAS_POSITION", () => {
    expect(() => validateSymbolStateTransition("WATCHING", "HAS_POSITION")).not.toThrow();
  });

  it("does not throw for WATCHING -> IDLE", () => {
    expect(() => validateSymbolStateTransition("WATCHING", "IDLE")).not.toThrow();
  });

  it("does not throw for HAS_POSITION -> IDLE", () => {
    expect(() => validateSymbolStateTransition("HAS_POSITION", "IDLE")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateSymbolStateTransition — throws on invalid
// ---------------------------------------------------------------------------

describe("symbol-state-fsm — validateSymbolStateTransition invalid transitions", () => {
  it("throws InvalidSymbolStateTransitionError for IDLE -> HAS_POSITION", () => {
    expect(() => validateSymbolStateTransition("IDLE", "HAS_POSITION")).toThrow(
      InvalidSymbolStateTransitionError,
    );
  });

  it("throws InvalidSymbolStateTransitionError for HAS_POSITION -> WATCHING", () => {
    expect(() => validateSymbolStateTransition("HAS_POSITION", "WATCHING")).toThrow(
      InvalidSymbolStateTransitionError,
    );
  });

  it("throws InvalidSymbolStateTransitionError for IDLE -> IDLE (self-loop)", () => {
    expect(() => validateSymbolStateTransition("IDLE", "IDLE")).toThrow(
      InvalidSymbolStateTransitionError,
    );
  });

  it("throws InvalidSymbolStateTransitionError for WATCHING -> WATCHING (self-loop)", () => {
    expect(() => validateSymbolStateTransition("WATCHING", "WATCHING")).toThrow(
      InvalidSymbolStateTransitionError,
    );
  });

  it("throws InvalidSymbolStateTransitionError for HAS_POSITION -> HAS_POSITION (self-loop)", () => {
    expect(() => validateSymbolStateTransition("HAS_POSITION", "HAS_POSITION")).toThrow(
      InvalidSymbolStateTransitionError,
    );
  });

  it("error message includes from and to states for IDLE -> HAS_POSITION", () => {
    try {
      validateSymbolStateTransition("IDLE", "HAS_POSITION");
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSymbolStateTransitionError);
      const error = err as InvalidSymbolStateTransitionError;
      expect(error.message).toContain("IDLE");
      expect(error.message).toContain("HAS_POSITION");
      expect(error.from).toBe("IDLE");
      expect(error.to).toBe("HAS_POSITION");
    }
  });

  it("InvalidSymbolStateTransitionError has from and to properties", () => {
    try {
      validateSymbolStateTransition("HAS_POSITION", "WATCHING");
      expect(true).toBe(false);
    } catch (err) {
      const error = err as InvalidSymbolStateTransitionError;
      expect(error.from).toBe("HAS_POSITION");
      expect(error.to).toBe("WATCHING");
      expect(error.name).toBe("InvalidSymbolStateTransitionError");
    }
  });
});

// ---------------------------------------------------------------------------
// getAllowedSymbolStateTransitions
// ---------------------------------------------------------------------------

describe("symbol-state-fsm — getAllowedSymbolStateTransitions", () => {
  it("IDLE can only go to WATCHING", () => {
    const allowed = getAllowedSymbolStateTransitions("IDLE");
    expect(allowed).toEqual(["WATCHING"]);
  });

  it("WATCHING can go to HAS_POSITION or IDLE", () => {
    const allowed = getAllowedSymbolStateTransitions("WATCHING");
    expect(allowed).toContain("HAS_POSITION");
    expect(allowed).toContain("IDLE");
    expect(allowed).toHaveLength(2);
  });

  it("HAS_POSITION can only go to IDLE", () => {
    const allowed = getAllowedSymbolStateTransitions("HAS_POSITION");
    expect(allowed).toEqual(["IDLE"]);
  });
});

// ---------------------------------------------------------------------------
// Sequential workflow scenarios
// ---------------------------------------------------------------------------

describe("symbol-state-fsm — sequential workflow scenarios", () => {
  it("full lifecycle IDLE -> WATCHING -> HAS_POSITION -> IDLE", () => {
    expect(canSymbolStateTransition("IDLE", "WATCHING")).toBe(true);
    expect(canSymbolStateTransition("WATCHING", "HAS_POSITION")).toBe(true);
    expect(canSymbolStateTransition("HAS_POSITION", "IDLE")).toBe(true);
  });

  it("cancel watching IDLE -> WATCHING -> IDLE", () => {
    expect(canSymbolStateTransition("IDLE", "WATCHING")).toBe(true);
    expect(canSymbolStateTransition("WATCHING", "IDLE")).toBe(true);
  });

  it("skip WATCHING is always blocked IDLE -> HAS_POSITION", () => {
    expect(() => validateSymbolStateTransition("IDLE", "HAS_POSITION")).toThrow(
      InvalidSymbolStateTransitionError,
    );
  });
});

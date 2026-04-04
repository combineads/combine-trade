import { describe, expect, it } from "bun:test";
import {
  canTransition,
  validateTransition,
  getNextState,
  getAllowedTransitions,
  InvalidTransitionError,
  type FsmEvent,
} from "@/positions/fsm";

// ---------------------------------------------------------------------------
// canTransition — valid transitions
// ---------------------------------------------------------------------------

describe("fsm — canTransition valid transitions", () => {
  it("INITIAL -> TP1_HIT is allowed", () => {
    expect(canTransition("INITIAL", "TP1_HIT")).toBe(true);
  });

  it("INITIAL -> CLOSED is allowed (SL/PANIC_CLOSE direct close)", () => {
    expect(canTransition("INITIAL", "CLOSED")).toBe(true);
  });

  it("TP1_HIT -> TP2_HIT is allowed", () => {
    expect(canTransition("TP1_HIT", "TP2_HIT")).toBe(true);
  });

  it("TP1_HIT -> CLOSED is allowed", () => {
    expect(canTransition("TP1_HIT", "CLOSED")).toBe(true);
  });

  it("TP2_HIT -> CLOSED is allowed", () => {
    expect(canTransition("TP2_HIT", "CLOSED")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canTransition — invalid transitions
// ---------------------------------------------------------------------------

describe("fsm — canTransition invalid transitions", () => {
  it("CLOSED -> INITIAL is rejected (terminal state)", () => {
    expect(canTransition("CLOSED", "INITIAL")).toBe(false);
  });

  it("CLOSED -> TP1_HIT is rejected (terminal state)", () => {
    expect(canTransition("CLOSED", "TP1_HIT")).toBe(false);
  });

  it("CLOSED -> TP2_HIT is rejected (terminal state)", () => {
    expect(canTransition("CLOSED", "TP2_HIT")).toBe(false);
  });

  it("CLOSED -> CLOSED is rejected (terminal state, no self-loop)", () => {
    expect(canTransition("CLOSED", "CLOSED")).toBe(false);
  });

  it("TP1_HIT -> INITIAL is rejected (reverse transition)", () => {
    expect(canTransition("TP1_HIT", "INITIAL")).toBe(false);
  });

  it("TP2_HIT -> INITIAL is rejected (reverse transition)", () => {
    expect(canTransition("TP2_HIT", "INITIAL")).toBe(false);
  });

  it("TP2_HIT -> TP1_HIT is rejected (reverse transition)", () => {
    expect(canTransition("TP2_HIT", "TP1_HIT")).toBe(false);
  });

  it("INITIAL -> TP2_HIT is rejected (skip TP1)", () => {
    expect(canTransition("INITIAL", "TP2_HIT")).toBe(false);
  });

  it("same state INITIAL -> INITIAL is rejected (no self-loop)", () => {
    expect(canTransition("INITIAL", "INITIAL")).toBe(false);
  });

  it("same state TP1_HIT -> TP1_HIT is rejected (no self-loop)", () => {
    expect(canTransition("TP1_HIT", "TP1_HIT")).toBe(false);
  });

  it("same state TP2_HIT -> TP2_HIT is rejected (no self-loop)", () => {
    expect(canTransition("TP2_HIT", "TP2_HIT")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateTransition — throws on invalid
// ---------------------------------------------------------------------------

describe("fsm — validateTransition", () => {
  it("does not throw for valid transition INITIAL -> TP1_HIT", () => {
    expect(() => validateTransition("INITIAL", "TP1_HIT")).not.toThrow();
  });

  it("does not throw for valid transition INITIAL -> CLOSED", () => {
    expect(() => validateTransition("INITIAL", "CLOSED")).not.toThrow();
  });

  it("does not throw for valid transition TP1_HIT -> TP2_HIT", () => {
    expect(() => validateTransition("TP1_HIT", "TP2_HIT")).not.toThrow();
  });

  it("does not throw for valid transition TP1_HIT -> CLOSED", () => {
    expect(() => validateTransition("TP1_HIT", "CLOSED")).not.toThrow();
  });

  it("does not throw for valid transition TP2_HIT -> CLOSED", () => {
    expect(() => validateTransition("TP2_HIT", "CLOSED")).not.toThrow();
  });

  it("throws InvalidTransitionError for CLOSED -> TP1_HIT", () => {
    expect(() => validateTransition("CLOSED", "TP1_HIT")).toThrow(
      InvalidTransitionError,
    );
  });

  it("throws InvalidTransitionError for TP1_HIT -> INITIAL (reverse)", () => {
    expect(() => validateTransition("TP1_HIT", "INITIAL")).toThrow(
      InvalidTransitionError,
    );
  });

  it("throws InvalidTransitionError for INITIAL -> TP2_HIT (skip)", () => {
    expect(() => validateTransition("INITIAL", "TP2_HIT")).toThrow(
      InvalidTransitionError,
    );
  });

  it("error message includes from and to states", () => {
    try {
      validateTransition("CLOSED", "INITIAL");
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      const error = err as InvalidTransitionError;
      expect(error.message).toContain("CLOSED");
      expect(error.message).toContain("INITIAL");
      expect(error.from).toBe("CLOSED");
      expect(error.to).toBe("INITIAL");
    }
  });

  it("InvalidTransitionError has from and to properties", () => {
    try {
      validateTransition("TP2_HIT", "TP1_HIT");
      expect(true).toBe(false);
    } catch (err) {
      const error = err as InvalidTransitionError;
      expect(error.from).toBe("TP2_HIT");
      expect(error.to).toBe("TP1_HIT");
    }
  });
});

// ---------------------------------------------------------------------------
// getNextState — event-based transitions
// ---------------------------------------------------------------------------

describe("fsm — getNextState", () => {
  it("INITIAL + TP1_HIT_EVENT -> TP1_HIT", () => {
    expect(getNextState("INITIAL", "TP1_HIT_EVENT")).toBe("TP1_HIT");
  });

  it("INITIAL + CLOSE_EVENT -> CLOSED", () => {
    expect(getNextState("INITIAL", "CLOSE_EVENT")).toBe("CLOSED");
  });

  it("TP1_HIT + TP2_HIT_EVENT -> TP2_HIT", () => {
    expect(getNextState("TP1_HIT", "TP2_HIT_EVENT")).toBe("TP2_HIT");
  });

  it("TP1_HIT + CLOSE_EVENT -> CLOSED", () => {
    expect(getNextState("TP1_HIT", "CLOSE_EVENT")).toBe("CLOSED");
  });

  it("TP2_HIT + CLOSE_EVENT -> CLOSED", () => {
    expect(getNextState("TP2_HIT", "CLOSE_EVENT")).toBe("CLOSED");
  });

  it("throws InvalidTransitionError for INITIAL + TP2_HIT_EVENT (skip)", () => {
    expect(() => getNextState("INITIAL", "TP2_HIT_EVENT")).toThrow(
      InvalidTransitionError,
    );
  });

  it("throws InvalidTransitionError for CLOSED + any event", () => {
    expect(() => getNextState("CLOSED", "TP1_HIT_EVENT")).toThrow(
      InvalidTransitionError,
    );
    expect(() => getNextState("CLOSED", "TP2_HIT_EVENT")).toThrow(
      InvalidTransitionError,
    );
    expect(() => getNextState("CLOSED", "CLOSE_EVENT")).toThrow(
      InvalidTransitionError,
    );
  });

  it("throws InvalidTransitionError for TP2_HIT + TP1_HIT_EVENT (invalid event for state)", () => {
    expect(() => getNextState("TP2_HIT", "TP1_HIT_EVENT")).toThrow(
      InvalidTransitionError,
    );
  });

  it("throws InvalidTransitionError for TP1_HIT + TP1_HIT_EVENT (already in TP1_HIT)", () => {
    expect(() => getNextState("TP1_HIT", "TP1_HIT_EVENT")).toThrow(
      InvalidTransitionError,
    );
  });
});

// ---------------------------------------------------------------------------
// getAllowedTransitions
// ---------------------------------------------------------------------------

describe("fsm — getAllowedTransitions", () => {
  it("INITIAL can go to TP1_HIT or CLOSED", () => {
    const allowed = getAllowedTransitions("INITIAL");
    expect(allowed).toContain("TP1_HIT");
    expect(allowed).toContain("CLOSED");
    expect(allowed).toHaveLength(2);
  });

  it("TP1_HIT can go to TP2_HIT or CLOSED", () => {
    const allowed = getAllowedTransitions("TP1_HIT");
    expect(allowed).toContain("TP2_HIT");
    expect(allowed).toContain("CLOSED");
    expect(allowed).toHaveLength(2);
  });

  it("TP2_HIT can only go to CLOSED", () => {
    const allowed = getAllowedTransitions("TP2_HIT");
    expect(allowed).toEqual(["CLOSED"]);
  });

  it("CLOSED returns empty array (terminal state)", () => {
    const allowed = getAllowedTransitions("CLOSED");
    expect(allowed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Type safety — FsmEvent type
// ---------------------------------------------------------------------------

describe("fsm — FsmEvent type safety", () => {
  it("FsmEvent values are TP1_HIT_EVENT, TP2_HIT_EVENT, CLOSE_EVENT", () => {
    const events: FsmEvent[] = ["TP1_HIT_EVENT", "TP2_HIT_EVENT", "CLOSE_EVENT"];
    expect(events).toHaveLength(3);
  });
});

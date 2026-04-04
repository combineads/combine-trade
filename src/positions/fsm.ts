/**
 * Ticket FSM — pure-function state machine for Ticket lifecycle.
 *
 * States:  INITIAL -> TP1_HIT -> TP2_HIT -> CLOSED
 * CLOSED is a terminal state — no transitions out.
 * Every non-terminal state can also transition directly to CLOSED (SL, PANIC_CLOSE, etc.).
 *
 * NO database imports, NO side effects.
 */

import type { FsmState, TicketState } from "@/core/types";

// ---------------------------------------------------------------------------
// FSM events
// ---------------------------------------------------------------------------

export type FsmEvent = "TP1_HIT_EVENT" | "TP2_HIT_EVENT" | "CLOSE_EVENT";

// ---------------------------------------------------------------------------
// Transition map (as const for exhaustiveness)
// ---------------------------------------------------------------------------

/** Allowed transitions keyed by source state. */
const TRANSITION_MAP: Readonly<Record<TicketState, readonly TicketState[]>> = {
  INITIAL: ["TP1_HIT", "CLOSED"],
  TP1_HIT: ["TP2_HIT", "CLOSED"],
  TP2_HIT: ["CLOSED"],
  CLOSED: [],
} as const;

/** Maps (state, event) -> target state. */
const EVENT_MAP: Readonly<Record<TicketState, Readonly<Partial<Record<FsmEvent, TicketState>>>>> = {
  INITIAL: {
    TP1_HIT_EVENT: "TP1_HIT",
    CLOSE_EVENT: "CLOSED",
  },
  TP1_HIT: {
    TP2_HIT_EVENT: "TP2_HIT",
    CLOSE_EVENT: "CLOSED",
  },
  TP2_HIT: {
    CLOSE_EVENT: "CLOSED",
  },
  CLOSED: {},
} as const;

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class InvalidTransitionError extends Error {
  readonly from: TicketState;
  readonly to: TicketState;

  constructor(from: TicketState, to: TicketState) {
    super(`Invalid ticket state transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Check whether a transition from `from` to `to` is allowed.
 */
export function canTransition(from: TicketState, to: TicketState): boolean {
  return TRANSITION_MAP[from].includes(to);
}

/**
 * Validate a transition. Throws {@link InvalidTransitionError} if not allowed.
 */
export function validateTransition(from: TicketState, to: TicketState): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/**
 * Given the current state and an FSM event, return the next state.
 * Throws {@link InvalidTransitionError} if the event is not valid for the current state.
 */
export function getNextState(current: TicketState, event: FsmEvent): TicketState {
  const stateEvents = EVENT_MAP[current];
  const next = stateEvents[event];
  if (next === undefined) {
    // Derive a target description from the event for the error message
    const targetFromEvent = eventToTarget(event);
    throw new InvalidTransitionError(current, targetFromEvent);
  }
  return next;
}

/**
 * Return the list of states reachable from the given state.
 */
export function getAllowedTransitions(current: TicketState): readonly TicketState[] {
  return TRANSITION_MAP[current];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function eventToTarget(event: FsmEvent): TicketState {
  switch (event) {
    case "TP1_HIT_EVENT":
      return "TP1_HIT";
    case "TP2_HIT_EVENT":
      return "TP2_HIT";
    case "CLOSE_EVENT":
      return "CLOSED";
  }
}

// ---------------------------------------------------------------------------
// SymbolState FSM — pure-function state machine for SymbolState lifecycle.
//
// States:  IDLE -> WATCHING -> HAS_POSITION -> IDLE
//          WATCHING -> IDLE (cancel watching)
//
// Forbidden: IDLE -> HAS_POSITION (must go through WATCHING)
//            HAS_POSITION -> WATCHING (must close position first)
//            self-loops (IDLE -> IDLE, WATCHING -> WATCHING, HAS_POSITION -> HAS_POSITION)
//
// NO database imports, NO side effects.
// ---------------------------------------------------------------------------

/** Allowed SymbolState transitions keyed by source state. */
export const SYMBOL_STATE_TRANSITION_MAP: Readonly<Record<FsmState, readonly FsmState[]>> = {
  IDLE: ["WATCHING"],
  WATCHING: ["HAS_POSITION", "IDLE"],
  HAS_POSITION: ["IDLE"],
} as const;

// ---------------------------------------------------------------------------
// SymbolState error class
// ---------------------------------------------------------------------------

export class InvalidSymbolStateTransitionError extends Error {
  readonly from: FsmState;
  readonly to: FsmState;

  constructor(from: FsmState, to: FsmState) {
    super(`Invalid symbol state transition: ${from} -> ${to}`);
    this.name = "InvalidSymbolStateTransitionError";
    this.from = from;
    this.to = to;
  }
}

// ---------------------------------------------------------------------------
// SymbolState pure functions
// ---------------------------------------------------------------------------

/**
 * Check whether a SymbolState transition from `from` to `to` is allowed.
 */
export function canSymbolStateTransition(from: FsmState, to: FsmState): boolean {
  return SYMBOL_STATE_TRANSITION_MAP[from].includes(to);
}

/**
 * Validate a SymbolState transition. Throws {@link InvalidSymbolStateTransitionError} if not allowed.
 */
export function validateSymbolStateTransition(from: FsmState, to: FsmState): void {
  if (!canSymbolStateTransition(from, to)) {
    throw new InvalidSymbolStateTransitionError(from, to);
  }
}

/**
 * Return the list of SymbolState states reachable from the given state.
 */
export function getAllowedSymbolStateTransitions(current: FsmState): readonly FsmState[] {
  return SYMBOL_STATE_TRANSITION_MAP[current];
}
